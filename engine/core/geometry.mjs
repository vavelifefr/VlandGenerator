import {corridorSettings} from './corridors.mjs';
import {applyRoomTemplate,templateWeights,classifyRoomSize} from './templates.mjs';
import {distributeRoomShapes} from './shape-distribution.mjs';
import {shapeStyleSettings,varyRoomContour} from './shape-style.mjs';
import {roomAreaBounds,areaApplies,roomAreaChoices} from './area.mjs';
import {seededRandom} from './random.mjs';
import {roomShape,ROOM_SHAPES,canonicalShapeWeights} from './shapes.mjs';
import {packRooms} from './packing.mjs';
import {roomContains} from './space.mjs';
import {nestRooms} from './interlocking.mjs';
import {standardPortPairs,nestedPortPair} from './ports.mjs';
import {roomRouteRole} from './route-patterns.mjs';
const dirs=[[0,-1],[1,0],[0,1],[-1,0]],key=p=>p.x+':'+p.y;
const distance=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
function connectedInterior(room,walls) {
  const queue=[room.core],seen=new Set([key(room.core)]);
  for(let i=0;i<queue.length;i++)for(const[dx,dy]of dirs) {
    const p={x:queue[i].x+dx,y:queue[i].y+dy},k=key(p);
    if(!roomContains(room,p,{interior:true})||walls.has(k)||seen.has(k))continue;
    seen.add(k);queue.push(p);
  }
  let free=0;
  for(let y=room.y+1;y<room.y+room.height-1;y++)for(let x=room.x+1;x<room.x+room.width-1;x++)if(roomContains(room,{x,y},{interior:true})&&!walls.has(x+':'+y))free++;
  return seen.size===free;
}
export function buildTileGeometry(plan,{maxAttempts=16,...options}={}) {
  shapeStyleSettings(options);options.corridors=corridorSettings(options.corridors);
 if(options.shapeWeights!==undefined)options.shapeWeights=canonicalShapeWeights(options.shapeWeights);
  templateWeights(options.roomTemplateWeights);
  if(options.interlocking!==undefined&&typeof options.interlocking!=='boolean')throw new Error('interlocking должен быть boolean.');
  if(!plan?.nodes?.length||plan.nodes.length>120||!Array.isArray(plan.edges))throw new Error('Геометрии нужен граф из 1–120 комнат.');
  if(!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>64)throw new Error('Лимит попыток:1–64.');
  if(!Number.isFinite(options.featureDensity??1)||(options.featureDensity??1)<0||(options.featureDensity??1)>2||!Number.isFinite(options.destructibleRatio??.6)||(options.destructibleRatio??.6)<0||(options.destructibleRatio??.6)>1)throw new Error('Недопустимая плотность или материал укрытий.');
  if(options.shapeWeights&&Object.entries(options.shapeWeights).some(([k,n])=>!ROOM_SHAPES.includes(k)||!Number.isFinite(n)||n<0))throw new Error('Недопустимые веса форм.');
  if(plan.nodes.some(n=>![n.x,n.y,n.spanX,n.spanY].every(Number.isInteger)||n.x<0||n.y<0||n.spanX<1||n.spanY<1))throw new Error('Неверные прямоугольники раскладки.');
  let failure='';
  for(let attempt=0;attempt<maxAttempts;attempt++) {
    try {return fit(plan,attempt,options);}catch(error){failure=error.message;}
  }
  throw new Error('Не удалось разместить комнаты без пересечений: '+failure);
}
function fit(plan,attempt,options) {
  const random=seededRandom((plan.seed^0xb05816af^Math.imul(attempt+1,0x9e3779b9))>>>0);
  const columnCount=Math.max(...plan.nodes.map(n=>n.x+n.spanX)),rowCount=Math.max(...plan.nodes.map(n=>n.y+n.spanY));
  const min=options.roomMin??10,max=options.roomMax??16;
  if(!Number.isInteger(min)||!Number.isInteger(max)||min<8||max<min||max>24||columnCount>128||rowCount>128)throw new Error('Размеры помещений:8–24; некорректная раскладка.');
  const packed=packRooms(plan,{roomMin:min,roomMax:max,random,interlocking:options.interlocking??true,shapeWeights:options.shapeWeights,packing:options.packing,corridors:options.corridors,roomAreaMin:options.roomAreaMin,roomAreaMax:options.roomAreaMax}),{rects,packing}=packed;let {width,height}=packed;
  if(width*height>250000)throw new Error('Раскладка превысила250000клеток; уменьшите размер или вытянутость.');
  const rooms=plan.nodes.map((n,i)=>{
    const {x,y,width:w,height:h}=rects[i];
    const role=['start','final','boss'].includes(n.purpose)?n.purpose:['vault','arsenal','secret','laboratory'].includes(n.purpose)?'branch':'intermediate';
    return {id:n.id,name:n.name,purpose:n.purpose,role:n.role??role,compact:n.compact,districtId:n.districtId,districtKind:n.districtKind,composition:n.composition?structuredClone(n.composition):undefined,templateId:'generated-'+n.purpose,gridX:n.x,gridY:n.y,spanX:n.spanX,spanY:n.spanY,largeHall:n.id!==plan.bossId&&n.spanX*n.spanY>1,x,y,width:w,height:h,doors:[],core:{x:x+Math.floor(w/2),y:y+Math.floor(h/2)}};
  });
  const nests=nestRooms(rooms,plan,{roomMin:min,shapeWeights:options.shapeWeights,interlocking:(options.interlocking??true)&&options.corridors.minLength===1,anchorIds:packing.nestingAnchors,accept:(host,child)=>[host,child].every(r=>roomAreaChoices(r,options).length),random:seededRandom((plan.seed^0x761b49d3^attempt)>>>0)});packing.nests=nests;
  if(nests.length){width=Math.max(...rooms.map(r=>r.x+r.width))+3;height=Math.max(...rooms.map(r=>r.y+r.height))+3;}
  const byId=new Map(rooms.map(r=>[r.id,r])),connections=[],corridor=[],reserved=new Set(),wallMap=new Map();
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)wallMap.set(x+':'+y,{x,y,type:'bedrock'});
  const footprints=new Map(),clearanceReserved=new Set(),features=[];
  const distribution=distributeRoomShapes(rooms,random,options);
  for(const r of rooms){const mask=varyRoomContour(r,roomShape(r,random,{...options,forcedShape:distribution?.assignment.get(r.id)}),random,options);r.shape=mask.shape;r.shapeRotation=mask.rotation;r.core=mask.core;if(mask.contourVariation)r.contourVariation=mask.contourVariation;footprints.set(r.id,mask.floor);for(const k of mask.floor)wallMap.delete(k);}
  const interior=(p,r)=>roomContains(r,p,{interior:true});
  const route=(from,to,room)=>{
    const q=[from],previous=new Map([[key(from),null]]);
    for(let i=0;i<q.length;i++){const p=q[i];if(key(p)===key(to)){const path=[];let current=p;while(current){path.unshift(current);current=previous.get(key(current));}return path;}
      for(const[dx,dy]of dirs){const n={x:p.x+dx,y:p.y+dy},k=key(n);if(!interior(n,room)||wallMap.has(k)||previous.has(k))continue;previous.set(k,p);q.push(n);}}
    return null;
  };
  const fitVestibule=(door,room)=>{
    if(!wallMap.has(key(door)))return;
    const q=[door],previous=new Map([[key(door),null]]);let end;
    for(let i=0;i<q.length&&!end;i++){const p=q[i];if(!wallMap.has(key(p))){end=p;break;}for(const[dx,dy]of dirs){const n={x:p.x+dx,y:p.y+dy},k=key(n);if(interior(n,room)&&!previous.has(k)){previous.set(k,p);q.push(n);}}}
    if(!end)throw new Error('Нет подхода к контуру комнаты.');
    while(end){for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const p={x:end.x+dx,y:end.y+dy};if(interior(p,room)){wallMap.delete(key(p));footprints.get(room.id).add(key(p));}}end=previous.get(key(end));}
  };
  const reserveLine=(from,to,room)=>{
    fitVestibule(to,room);const path=route(from,to,room);if(!path)throw new Error('Контур отсёк вход в '+room.id);
    for(const p of path){reserved.add(key(p));for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(interior({x:p.x+dx,y:p.y+dy},room))clearanceReserved.add((p.x+dx)+':'+(p.y+dy));}
  };
  const seam=(lo,hi,a,b)=>a.composition?.id&&a.composition.id===b.composition?.id?Math.max(lo,Math.min(hi,Math.round(lo+(hi-lo)*(a.composition.role==='hall'?.35:.65))+Math.floor(random()*3)-1)):lo+Math.floor(random()*(hi-lo+1));
  for(const edge of plan.edges){
    const a=byId.get(edge.from),b=byId.get(edge.to),an=plan.nodes.find(n=>n.id===a.id),bn=plan.nodes.find(n=>n.id===b.id);
    const nest=nests.find(n=>n.edgeId===edge.id),pairs=nest?[nestedPortPair(edge,rooms,nest)]:standardPortPairs(a,b,an,bn);if(!pairs.length)throw new Error('Нет свободной общей стороны '+edge.id);
    const {from,to,dx,dy}=pairs[seam(0,pairs.length-1,a,b)];
    const length=distance(from,to)-1;
    if(length<options.corridors.minLength||length>options.corridors.maxLength)throw new Error('Переход вне диапазона: '+edge.id);
    const cells=Array.from({length},(_,i)=>({x:from.x+dx*(i+1),y:from.y+dy*(i+1)})),openWidth=edge.kind==='open'?options.corridors.openWidth:1,footprintCells=[];for(const p of [from,...cells,to])for(let w=0;w<openWidth;w++){const d=w-Math.floor(openWidth/2),q={x:p.x+dy*d,y:p.y+dx*d};if(q.x<1||q.y<1||q.x>=width-1||q.y>=height-1)throw new Error('Проход вне карты.');if(rooms.some(r=>r!==a&&r!==b&&roomContains(r,q)))throw new Error('Широкий проход затрагивает чужую комнату.');footprintCells.push(q);wallMap.delete(key(q));reserved.add(key(q));}
    a.doors.push({...from,toRoomId:b.id,edgeId:edge.id});b.doors.push({...to,toRoomId:a.id,edgeId:edge.id});
    for(const p of [...cells,from,to]){wallMap.delete(key(p));reserved.add(key(p));}
    corridor.push(...cells);reserveLine(a.core,from.inside,a);reserveLine(b.core,to.inside,b);
    connections.push({...edge,cells,openWidth,footprintCells,fromDoor:{x:from.x,y:from.y},toDoor:{x:to.x,y:to.y}});
  }
  const areaBounds=roomAreaBounds(options);
  if(plan.areaPolicy)packing.areaPolicy=plan.areaPolicy;
  if(areaBounds.enabled)for(const room of rooms.filter(areaApplies)){
    const footprint=footprints.get(room.id);
    // Door vestibules may extend a shaped mask. Trim only its boundary, while
    // retaining the three-cell route clearance and the connected floor.
    const candidates=[...footprint].map(k=>{const[x,y]=k.split(':').map(Number);return{x,y};}).filter(p=>!clearanceReserved.has(key(p))&&distance(p,room.core)>2).sort((a,b)=>distance(b,room.core)-distance(a,room.core)||a.y-b.y||a.x-b.x);
    for(const p of candidates){if(footprint.size<=areaBounds.max)break;if(!dirs.some(([dx,dy])=>!footprint.has((p.x+dx)+':'+(p.y+dy))))continue;wallMap.set(key(p),{...p,type:'bedrock'});if(connectedInterior(room,wallMap))footprint.delete(key(p));else wallMap.delete(key(p));}
    if(footprint.size<areaBounds.min||footprint.size>areaBounds.max)throw new Error('Дверные подходы несовместимы с площадью '+room.id+': '+footprint.size+'.');
  }
  for(const room of rooms) {
    reserved.add(key(room.core));
    if(['start','final'].includes(room.purpose))continue;
    const applied=applyRoomTemplate(room,{footprint:footprints.get(room.id),walls:wallMap,random,weights:options.roomTemplateWeights,destructibleRatio:options.destructibleRatio??.6,roomMin:min,roomMax:max,roomAreaMin:options.roomAreaMin,roomAreaMax:options.roomAreaMax});
    if(applied){room.interiorTemplate={...applied.template,sizeClass:classifyRoomSize(footprints.get(room.id).size,options)};features.push(...applied.features);if(applied.template.type!=='scattered'){
      for(const k of [...reserved]){const[x,y]=k.split(':').map(Number);if(interior({x,y},room))reserved.delete(k);}
      for(const k of [...clearanceReserved]){const[x,y]=k.split(':').map(Number);if(interior({x,y},room))clearanceReserved.delete(k);}
      for(const door of room.doors)reserveLine(room.core,door.inside,room);
    }}
    room.featurePattern=room.composition?.featurePattern??['pillars','ruins','baffles','islands'][Math.floor(random()*4)];
    const role=roomRouteRole(plan,room.id);
    const budget=Math.round((room.purpose==='boss'?12:4+Math.floor(random()*5))*(options.featureDensity??1)*(role?.cover??1));
    for(let i=0;i<budget&&(!applied||applied.template.type==='scattered');i++) {
      const horizontal=random()<.5,pillar=['pillars','islands'].includes(room.featurePattern)&&i%2===0,length=pillar?1:2+Math.floor(random()*(Math.min(room.width,room.height)>=14?4:2));
      const size=pillar&&Math.min(room.width,room.height)>=14?2:1,w=pillar?size:horizontal?length:1,h=pillar?size:horizontal?1:length;
      const x=room.x+2+Math.floor(random()*(room.width-3-w)),y=room.y+2+Math.floor(random()*(room.height-3-h));
      const cells=[];for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)cells.push({x:xx,y:yy});
      const margin=length>3||size>1?2:1;
      if(cells.some(p=>!interior(p,room)||clearanceReserved.has(key(p))||wallMap.has(key(p))||Array.from({length:margin*2+1},(_,n)=>n-margin).some(dy=>Array.from({length:margin*2+1},(_,n)=>n-margin).some(dx=>wallMap.has((p.x+dx)+':'+(p.y+dy))))))continue;
      const type=random()<(options.destructibleRatio??.6)?'internal':'bedrock',id='feature-'+room.id+'-'+i;
      for(const p of cells)wallMap.set(key(p),{...p,type,featureId:id});
      if(!connectedInterior(room,wallMap))for(const p of cells)wallMap.delete(key(p));
      else features.push({id,roomId:room.id,kind:pillar?'pillar':room.featurePattern,material:type,destructible:type==='internal',cells});
    }
    room.floorArea=footprints.get(room.id).size;room.walkableArea=room.floorArea-features.filter(f=>f.roomId===room.id).reduce((n,f)=>n+f.cells.length,0);
    if(options.includeTiles!==false)room.floorTiles=[...footprints.get(room.id)].filter(k=>!wallMap.has(k)).map(k=>{const[x,y]=k.split(':').map(Number);return{x,y};});
  }
  for(const r of rooms)if(!r.floorArea){r.floorArea=footprints.get(r.id).size;r.walkableArea=r.floorArea;if(options.includeTiles!==false)r.floorTiles=[...footprints.get(r.id)].map(k=>{const[x,y]=k.split(':').map(Number);return{x,y};});}
  const ordered=[byId.get(plan.startId),...rooms.filter(r=>![plan.startId,plan.bossId,plan.finalId].includes(r.id)),byId.get(plan.bossId),byId.get(plan.finalId)].filter(Boolean);
  const passageOwners=new Map();for(const c of connections)for(const p of c.cells){if(passageOwners.has(key(p))||rooms.some(r=>interior(p,r)))throw new Error('Проход пересёк другую комнату или проход.');passageOwners.set(key(p),c.id);}
  for(const[k,id]of passageOwners){const[x,y]=k.split(':').map(Number);for(const[dx,dy]of dirs){const other=passageOwners.get((x+dx)+':'+(y+dy));if(other&&other!==id)throw new Error('Необъявленная развилка проходов.');}}
  return {layout:'rooms',axis:'spatial',seed:plan.seed,number:plan.number,plan,rooms:ordered,connections,corridor,features,
    board:{width,height,walls:[...wallMap.values()]},spawn:{...byId.get(plan.startId).core},
    bossRoomId:plan.bossId,protectedTiles:[...reserved],packing,...(distribution?{shapeDistribution:distribution.report}:{}),geometryAttempts:attempt+1,rngState:(plan.seed^0xa5a5a5a5)>>>0};
}

