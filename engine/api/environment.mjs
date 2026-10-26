import {seededRandom} from '../core/random.mjs';
import {findRoomPath} from './setpieces.mjs';
import {LIGHT_TYPES,MEDIUM_TYPES,environmentSettings} from './environment-catalog.mjs';
const key=p=>p.x+':'+p.y,near=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y),dirs=[[0,-1],[1,0],[0,1],[-1,0]];
export function planEnvironment(level,content,options={}){
 const rules=environmentSettings(options.environment),random=seededRandom((level.seed^0x38ce617d)>>>0),walls=new Map(level.board.walls.map(p=>[key(p),p])),reserved=new Set(level.protectedTiles),lights=[],media=[],circuits=[],warnings=[];
 if(!rules.enabled)return null;
 const nonLights=content.hints.filter(h=>h.kind!=='light'),props=content.setpieces?.slots??[],occupied=new Set([...(level.transportLinks??[]).flatMap(t=>[t.from,t.to]),...nonLights,...props.flatMap(s=>[s.anchor,...s.approach]),...level.mechanisms.map(m=>m.position),level.spawn].map(key));
 const conditional=new Set([...(content.setpieces?.zones??[]),...(content.setpieces?.challenges??[])].map(z=>z.roomId));
 const permitted=rules.lightTypes??Object.keys(LIGHT_TYPES).filter(id=>LIGHT_TYPES[id].themes.includes(options.theme??'sci-fi'));
 for(const room of level.rooms){
  const info=content.rooms.find(r=>r.roomId===room.id),floor=new Set(room.floorTiles.map(key)),localProps=props.filter(s=>s.roomId===room.id&&!s.controlsZoneId),count=info.budget.lights;
  if(rules.enabled&&!['start','final','boss'].includes(room.purpose)&&!conditional.has(room.id)){
   const interior=room.interiorTemplate,custom=['pool','lake'].includes(interior?.type);
   if(custom||random()<rules.mediaFrequency){
    const type=custom?'water':['water','oil','poison','fog','poison-gas'][Math.floor(random()*5)];
    let cells=custom?interior.cells.map(p=>({...p})):[];
    if(!custom){const candidates=room.floorTiles.filter(p=>!reserved.has(key(p))&&!occupied.has(key(p)));if(candidates.length){const centre=candidates[Math.floor(random()*candidates.length)],radius=Math.max(1,Math.min(5,Math.round(Math.sqrt(room.floorTiles.length)*.15))),queue=[centre],seen=new Set([key(centre)]);for(let i=0;i<queue.length;i++)for(const[dx,dy]of dirs){const p={x:queue[i].x+dx,y:queue[i].y+dy},k=key(p);if(floor.has(k)&&!reserved.has(k)&&!occupied.has(k)&&near(p,centre)<=radius&&!seen.has(k)){seen.add(k);queue.push(p);}}cells=queue;}}
    if(cells.length>=3)media.push({id:`medium-${media.length+1}`,roomId:room.id,type,layer:MEDIUM_TYPES[type].layer,shape:custom?interior.shape:'spill',cells,depth:custom?'shallow':'film',blocksMovement:false,source:custom?'room-template':'spill',conductive:MEDIUM_TYPES[type].conductive});
   }
  }
  const wallCandidates=room.floorTiles.flatMap(p=>dirs.flatMap(([dx,dy])=>{const support={x:p.x+dx,y:p.y+dy},wall=walls.get(key(support));return wall?.type==='bedrock'&&!wall.featureId&&!wall.gateId?[{anchor:p,support,normal:{x:-dx,y:-dy}}]:[];}));
  const wallTypes=permitted.filter(id=>LIGHT_TYPES[id].mount==='wall'),ceilingTypes=permitted.filter(id=>LIGHT_TYPES[id].mount==='ceiling');
  const placed=[];
  for(let i=0;i<count;i++){
   const ceiling=ceilingTypes.length&&(!wallTypes.length||room.floorArea>=rules.ceilingMinArea&&i===0||random()>rules.wallPreference),mount=ceiling?'ceiling':'wall';
   const source=(ceiling?room.floorTiles.map(anchor=>({anchor})):wallCandidates).filter(c=>!occupied.has(key(c.anchor)));
   const ranked=source.map(c=>({c,score:(ceiling?near(c.anchor,room.core)*.4:localProps.length?Math.min(...localProps.map(s=>near(s.anchor,c.anchor)))*.7:near(c.anchor,room.core)*.1)-(placed.length?Math.min(...placed.map(p=>near(p,c.anchor)))*.7:0)+random()*.4})).sort((a,b)=>a.score-b.score);
   const selected=ranked[0]?.c,types=ceiling?ceilingTypes:wallTypes;if(!selected||!types.length){warnings.push(`Не размещён свет в ${room.id}: нет допустимого крепления/свободного якоря.`);continue;}
   const typeId=types[Math.floor(random()*types.length)],definition=LIGHT_TYPES[typeId],nearestProp=localProps.map(s=>({id:s.id,distance:near(s.anchor,selected.anchor)})).sort((a,b)=>a.distance-b.distance)[0];
   const light={id:`light-${lights.length+1}`,roomId:room.id,typeId,mount,anchor:{...selected.anchor},height:definition.height,cone:definition.cone,radius:Math.max(3,Math.min(8,Math.ceil(Math.sqrt(room.floorTiles.length)/3))),initiallyOn:true,...(selected.support?{support:selected.support,normal:selected.normal}:{}),...(nearestProp?{nearPropId:nearestProp.id,propDistance:nearestProp.distance}:{})};
   lights.push(light);occupied.add(key(light.anchor));placed.push(light.anchor);
  }
  info.budget.lights=placed.length;
 }
 // Power controls are always dry and local. A 1–3-step path from the control
 // to its conductive medium is recorded, independently of every door lock.
 for(const medium of media){
  if(!medium.conductive||random()>=rules.powerFrequency)continue;
  const room=level.rooms.find(r=>r.id===medium.roomId),wet=new Set(media.filter(m=>m.roomId===room.id).flatMap(m=>m.cells).map(key));
  const candidates=room.floorTiles.filter(p=>!wet.has(key(p))&&!occupied.has(key(p))&&Math.min(...medium.cells.map(q=>near(p,q)))<=3).map(p=>({p,d:Math.min(...medium.cells.map(q=>near(p,q))),order:random()})).sort((a,b)=>a.d-b.d||a.order-b.order);
  let control;
  for(const {p}of candidates){
   const target=medium.cells.toSorted((a,b)=>near(a,p)-near(b,p))[0],path=findRoomPath(room,p,target),approach=dirs.map(([dx,dy])=>({x:p.x+dx,y:p.y+dy})).filter(q=>room.floorTiles.some(c=>key(c)===key(q))&&!wet.has(key(q))&&!occupied.has(key(q)));
   if(!path||path.length>4||!approach.length)continue;
   control={id:`power-${circuits.length+1}`,roomId:room.id,type:'power-switch',anchor:{...p},approach:approach.map(q=>({...q})),pathToMedium:path};break;
  }
  if(!control){warnings.push(`Питание ${medium.id} пропущено: нет сухого местного выключателя и подхода.`);continue;}
  circuits.push({id:`circuit-${circuits.length+1}`,roomId:room.id,mediumId:medium.id,control,initiallyOn:false,effect:'electrify',affects:'actors-in-medium'});occupied.add(key(control.anchor));for(const p of control.approach)occupied.add(key(p));
 }
 return{version:1,lights,media,circuits,warnings,note:'Крепление и направление света, слои среды и локальные цепи. Адаптер выбирает текстуру/mesh, шейдер и величину урона; все акторы обрабатываются одинаковыми правилами.'};
}
export function environmentErrors(level,data,content){
 if(!data||data.version!==1||!Array.isArray(data.lights)||!Array.isArray(data.media)||!Array.isArray(data.circuits)||data.lights.length>3000||data.media.length>120||data.circuits.length>120)return['Неверный план света/среды.'];
 const errors=[],rooms=new Map(level.rooms.map(r=>[r.id,r])),walls=new Map(level.board.walls.map(w=>[key(w),w])),ids=new Set();
 const point=p=>Number.isInteger(p?.x)&&Number.isInteger(p?.y)&&p.x>=0&&p.y>=0&&p.x<level.board.width&&p.y<level.board.height;
 const unique=id=>{const ok=typeof id==='string'&&id.length>0&&id.length<=96&&!ids.has(id);ids.add(id);return ok;},free=(r,p)=>r&&point(p)&&r.floorTiles.some(q=>key(q)===key(p));
 for(const light of data.lights){const r=rooms.get(light.roomId),type=LIGHT_TYPES[light.typeId];
  if(!unique(light.id)||!type||light.mount!==type.mount||!free(r,light.anchor)||light.height!==type.height||light.cone!==type.cone||!Number.isInteger(light.radius)||light.radius<1||light.radius>32||typeof light.initiallyOn!=='boolean')errors.push('Неверный тип или крепление света.');
  if(type?.mount==='wall'&&(!point(light.support)||walls.get(key(light.support))?.type!=='bedrock'||walls.get(key(light.support))?.featureId||!point(light.anchor)||near(light.support,light.anchor)!==1||light.normal?.x!==light.anchor.x-light.support.x||light.normal?.y!==light.anchor.y-light.support.y))errors.push('Настенный свет не имеет неподвижной стены и нормали.');
  if(type?.mount==='ceiling'&&(light.support!==undefined||light.normal!==undefined))errors.push('Потолочный свет ошибочно привязан к стене.');
 }
 const mediaKeys=new Set(),controls=new Set([...(level.mechanisms??[]).map(m=>m.position),...(content?.setpieces?.slots??[]).flatMap(s=>[s.anchor,...s.approach]),...(content?.hints??[])].map(key));for(const medium of data.media){const r=rooms.get(medium.roomId),type=MEDIUM_TYPES[medium.type];
  if(!unique(medium.id)||!type||medium.layer!==type.layer||medium.conductive!==type.conductive||medium.blocksMovement!==false||!Array.isArray(medium.cells)||medium.cells.length<3||medium.cells.length>65536||new Set(medium.cells.map(key)).size!==medium.cells.length||medium.cells.some(p=>!free(r,p)))errors.push('Неверная область среды.');
  else for(const p of medium.cells){const k=medium.layer+':'+key(p);if(mediaKeys.has(k))errors.push('Среды одного слоя пересекаются.');mediaKeys.add(k);}
 }
 for(const circuit of data.circuits){const r=rooms.get(circuit.roomId),medium=data.media.find(m=>m.id===circuit.mediumId),c=circuit.control,wet=new Set(data.media.filter(m=>m.roomId===r?.id).flatMap(m=>m.cells).map(key));
  if(!unique(circuit.id)||!medium?.conductive||medium.roomId!==circuit.roomId||c?.roomId!==circuit.roomId||!unique(c?.id)||c?.type!=='power-switch'||!free(r,c?.anchor)||wet.has(key(c.anchor))||typeof circuit.initiallyOn!=='boolean'||circuit.effect!=='electrify')errors.push('Питание должно управляться сухим выключателем в той же комнате.');
  if(!Array.isArray(c?.approach)||!c.approach.length||c.approach.length>4||c.approach.some(p=>!free(r,p)||wet.has(key(p))||near(p,c.anchor)!==1))errors.push('Нет сухого подхода к выключателю.');
  const path=c?.pathToMedium;if(!Array.isArray(path)||path.length<2||path.length>4||path.some(p=>!free(r,p))||key(path[0])!==key(c.anchor)||!medium?.cells.some(p=>key(p)===key(path.at(-1)))||path.slice(1).some((p,i)=>near(p,path[i])!==1))errors.push('Выключатель должен находиться в 1–3 шагах от жидкости.');
  if(c?.anchor){if(controls.has(key(c.anchor)))errors.push('Выключатель питания пересекается с другим объектом.');controls.add(key(c.anchor));}
 }
 return[...new Set(errors)];
}
export function createEnvironmentState(value){return{version:1,power:Object.fromEntries((value.content?.environment?.circuits??[]).map(c=>[c.id,c.initiallyOn]))};}
function checkState(value,state){if(state?.version!==1||!state.power||typeof state.power!=='object'||Array.isArray(state.power)||Object.values(state.power).some(v=>typeof v!=='boolean')||Object.keys(state.power).some(k=>!value.content?.environment?.circuits.some(c=>c.id===k)))throw new Error('Неверное состояние питания.');}
export function setCircuitPower(value,state,id,on){
 const circuit=value.content?.environment?.circuits.find(c=>c.id===id);if(!circuit)throw new Error('Неизвестная электрическая цепь.');
 checkState(value,state);
 if(typeof on!=='boolean')throw new Error('Питание: boolean.');
 return{state:{version:1,power:{...state.power,[id]:on}},events:[{type:'circuit-power',id,on,mediumId:circuit.mediumId,roomId:circuit.roomId}]};
}
export function environmentAt(value,state,position){
 if(state!==undefined&&state!==null)checkState(value,state);
 if(!Number.isInteger(position?.x)||!Number.isInteger(position?.y))throw new Error('Нужна целая клеточная позиция.');
 return(value.content?.environment?.media??[]).filter(m=>m.cells.some(p=>key(p)===key(position))).map(m=>({id:m.id,type:m.type,...MEDIUM_TYPES[m.type],electrified:(value.content.environment.circuits??[]).some(c=>c.mediumId===m.id&&(state?.power?.[c.id]??c.initiallyOn))}));
}
