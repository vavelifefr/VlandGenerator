import {createMovementField,findMovementPath,canMovementStep,movementProfile,movementFits} from './movement.mjs';
import {neighbors,cell,index,minHeap} from '../core/atlas-math.mjs';
export function atlasComponents(field){
  const seen=new Uint8Array(field.passable.length),regions=[];
  for(let i=0;i<seen.length;i++)if(field.passable[i]&&!seen[i]){const q=[i];seen[i]=1;for(let k=0;k<q.length;k++){const a=cell(q[k],field.width);for(const j of neighbors(q[k],field.width,field.height,field.topology))if(!seen[j]&&canMovementStep(field,a,cell(j,field.width))){seen[j]=1;q.push(j);}}regions.push(q);}
  return regions.sort((a,b)=>b.length-a.length||a[0]-b[0]);
}
export function rebuildAtlasWalls(layer){
  const {width:w,height:h}=layer.board;layer.board.walls=[];
  for(let i=0;i<w*h;i++)if(layer.fields.obstacle[i]){const p=cell(i,w),edge=layer.kind==='underground'&&(!p.x||!p.y||p.x===w-1||p.y===h-1);layer.board.walls.push({...p,type:edge?'bedrock':layer.fields.structure[i]?'ruin':layer.fields.vegetation[i]?'tree':'rock'});}
}
export function atlasFarthest(field,start){const q=[index(start,field.width)],seen=new Set(q);for(let k=0;k<q.length;k++){const a=cell(q[k],field.width);for(const j of neighbors(q[k],field.width,field.height,field.topology))if(!seen.has(j)&&canMovementStep(field,a,cell(j,field.width))){seen.add(j);q.push(j);}}return cell(q.at(-1),field.width);}
export function clearAtlasFootprint(layer,p,width=2,height=2,{reserve=true,construct=true}={}){
  const f=layer.fields,w=layer.board.width,h=layer.board.height;
  for(let dy=0;dy<height;dy++)for(let dx=0;dx<width;dx++){const x=p.x+dx,y=p.y+dy;if(x<1||y<1||x>=w-1||y>=h-1)continue;const i=y*w+x;
    f.obstacle[i]=0;f.support[i]=1;f.ceiling[i]=Math.max(3,f.ceiling[i]);f.vegetation[i]='';
    if(f.waterDepth[i]>0&&!f.frozen[i]&&construct)f.bridge[i]=1;
    if(f.material[i]==='air'){f.material[i]='timber';f.biome[i]='canopy';}
    else if(f.biome[i]==='cave-wall'){f.material[i]='gravel';f.biome[i]='dry-cave';}
    if(reserve)f.reserved[i]=1;
  }
}
function excavationPath(layer,from,goals,profile){
  const {width:w,height:h}=layer.board,n=w*h,start=index(from,w),target=new Set(goals),dist=new Float64Array(n).fill(Infinity),prev=new Int32Array(n).fill(-1),q=minHeap();dist[start]=0;q.push(start,0);
  while(q.length){const {id,cost}=q.pop();if(cost!==dist[id])continue;if(target.has(id)){const out=[];for(let k=id;k>=0;k=prev[k])out.push(cell(k,w));return out.reverse();}
    for(const j of neighbors(id,w,h,layer.topology)){const x=j%w,y=Math.floor(j/w);if(x<1||y<1||x>w-Math.max(2,profile.width)-1||y>h-Math.max(2,profile.height)-1)continue;const f=layer.fields,c=cost+1+f.obstacle[j]*9+(1-f.support[j])*20+f.waterDepth[j]*18+Math.abs(f.elevation[j]-f.elevation[id])*40;if(c<dist[j]){dist[j]=c;prev[j]=id;q.push(j,c);}}
  }return null;
}
export function connectAtlasAnchor(layer,anchor,profile,repairs){
  rebuildAtlasWalls(layer);let field=createMovementField(layer,profile),main=atlasComponents(field)[0]??[];
  if(main.includes(index(anchor,field.width)))return;
  const path=main.length?excavationPath(layer,anchor,main,movementProfile(profile)):[anchor];if(!path)throw new Error('Не удалось связать площадку '+layer.id);
  const before=layer.fields.obstacle.reduce((a,b)=>a+b,0),p=movementProfile(profile),aHeight=layer.fields.elevation[index(anchor,field.width)],bHeight=layer.fields.elevation[index(path.at(-1),field.width)];
  for(let k=0;k<path.length;k++){
    clearAtlasFootprint(layer,path[k],Math.max(2,p.width),Math.max(2,p.height));const grade=aHeight+(bHeight-aHeight)*k/Math.max(1,path.length-1);
    for(let dy=0;dy<Math.max(2,p.height);dy++)for(let dx=0;dx<Math.max(2,p.width);dx++){const x=path[k].x+dx,y=path[k].y+dy,i=y*field.width+x;if(x>0&&y>0&&x<field.width-1&&y<field.height-1)layer.fields.elevation[i]=Math.round(grade*1e6)/1e6;}
  }
  repairs.push({layerId:layer.id,type:layer.kind==='underground'?'excavated-connection':'constructed-connection',cells:path.length,wallsRemoved:Math.max(0,before-layer.fields.obstacle.reduce((a,b)=>a+b,0))});rebuildAtlasWalls(layer);
}
export function findAtlasPath(atlas,from=atlas.spawn,to=atlas.exit,input=atlas.request.profile,{layerStates={}}={}){
  if(![from,to].every(p=>p&&atlas.layers.some(l=>l.id===p.layerId)&&Number.isInteger(p.x)&&Number.isInteger(p.y)))throw new Error('Позиции пути должны указывать ярус и целые XY.');
  const profile=movementProfile(input),nodes=[{id:'start',...from},{id:'end',...to}],edges=new Map(),fields=new Map();
  for(const layer of atlas.layers)fields.set(layer.id,createMovementField(layer,profile,layerStates[layer.id]??{}));
  const add=(a,b,cost,segment)=>{if(!edges.has(a))edges.set(a,[]);edges.get(a).push({to:b,cost,segment});};
  for(const link of atlas.links){const a={id:link.id+'-a',...link.from},b={id:link.id+'-b',...link.to};nodes.push(a,b);if(profile.width<=link.footprint.width&&profile.height<=link.footprint.height&&profile.bodyHeight<=link.clearance&&movementFits(fields.get(a.layerId),a)&&movementFits(fields.get(b.layerId),b)){add(a.id,b.id,link.travelCost,{type:'transition',linkId:link.id,from:link.from,to:link.to});add(b.id,a.id,link.travelCost,{type:'transition',linkId:link.id,from:link.to,to:link.from});}}
  for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++)if(nodes[i].layerId===nodes[j].layerId){const a=nodes[i],b=nodes[j],layer=atlas.layers.find(l=>l.id===a.layerId);if(!layer)continue;const path=findMovementPath(layer,a,b,profile,{},fields.get(layer.id));if(path){add(a.id,b.id,path.length-1,{type:'walk',layerId:layer.id,path});add(b.id,a.id,path.length-1,{type:'walk',layerId:layer.id,path:[...path].reverse()});}}
  const dist=new Map([['start',0]]),previous=new Map(),q=minHeap();q.push(0,0);const ids=nodes.map(n=>n.id),byId=new Map(nodes.map((n,i)=>[n.id,i]));
  while(q.length){const {id,cost}=q.pop(),name=ids[id];if(cost!==dist.get(name))continue;for(const edge of edges.get(name)??[]){const next=cost+edge.cost;if(next<(dist.get(edge.to)??Infinity)){dist.set(edge.to,next);previous.set(edge.to,{from:name,segment:edge.segment});q.push(byId.get(edge.to),next);}}}
  const reachableLayers=[...new Set(nodes.filter(n=>dist.has(n.id)&&movementFits(fields.get(n.layerId),n)).map(n=>n.layerId))],missing=atlas.layers.filter(l=>!reachableLayers.includes(l.id)).map(l=>l.id);
  let path=null;if(dist.has('end')){const segments=[];for(let at='end';at!=='start';){const p=previous.get(at);if(!p)break;segments.push(p.segment);at=p.from;}path={cost:dist.get('end'),segments:segments.reverse()};}
  return{ok:!!path&&!missing.length,reachable:!!path,profile,reachableLayers,unreachableLayers:missing,path,note:'Проверены реальные клетки и парные переходы 2D-срезов; физику прыжков и бой проверяет игра.'};
}
