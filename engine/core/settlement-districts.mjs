import {neighbors} from './atlas-math.mjs';
export const DEFAULT_NEIGHBORHOODS=Object.freeze({minArea:36,maxArea:144});
export const DEFAULT_QUARTERS=Object.freeze({minArea:144,maxArea:576});
export function areaRange(value,defaults,name){
 if(value!==undefined&&(!value||Array.isArray(value)||typeof value!=='object'||Object.keys(value).some(k=>!['minArea','maxArea'].includes(k))))throw Error('Неверные настройки площади: '+name);
 const out={...defaults,...value};if(![out.minArea,out.maxArea].every(v=>Number.isInteger(v)&&v>=4&&v<=25600)||out.minArea>out.maxArea)throw Error(name+': площадь4–25600 клеток, минимум не больше максимума.');return out;
}
function components(cells,w,h){
 const left=new Set(cells),out=[];
 for(const first of cells)if(left.delete(first)){const queue=[first];for(let k=0;k<queue.length;k++)for(const j of neighbors(queue[k],w,h))if(left.delete(j))queue.push(j);queue.sort((a,b)=>a-b);out.push(queue);}return out;
}
function landFaces(layer,parcels=[]){
 const {width:w,height:h}=layer.board,f=layer.fields,buildings=new Set();for(const p of parcels)for(let y=p.y;y<p.y+p.height;y++)for(let x=p.x;x<p.x+p.width;x++)buildings.add(y*w+x);
 const cells=[];for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;if(!f.road[i]&&f.waterType[i]==='none'&&f.biome[i]!=='cliffs'&&(!f.obstacle[i]||buildings.has(i))&&f.support[i])cells.push(i);}return components(cells,w,h);
}
function bounds(cells,w){let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(const i of cells){const x=i%w,y=Math.floor(i/w);minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}return{x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1};}
export function subdivideNeighborhoodLand(layer,limits,width,record,reachable,allowFace=()=>true){
 const {width:w,height:h}=layer.board,f=layer.fields,queue=landFaces(layer).filter(allowFace);let cuts=0;
 for(let next=0;next<queue.length;next++){
  const cells=queue[next];if(cells.length<=limits.maxArea)continue;const face=new Set(cells),box=bounds(cells,w);let best;
  for(const axis of ['x','y'])for(const fraction of [.5,.33,.67]){
   const low=box[axis],length=axis==='x'?box.width:box.height,line=Math.floor(low+(length-width)*fraction),paths=[],removed=new Set();let path=[];
   const finish=()=>{if(path.length>=2){paths.push(path);for(const p of path)for(let dy=0;dy<width;dy++)for(let dx=0;dx<width;dx++)removed.add((p.y+dy)*w+p.x+dx);}path=[];};
   for(let t=axis==='x'?box.y:box.x;t<(axis==='x'?box.y+box.height:box.x+box.width);t++){
    const p=axis==='x'?{x:line,y:t}:{x:t,y:line};let safe=true;
    for(let dy=0;dy<width&&safe;dy++)for(let dx=0;dx<width;dx++){const i=(p.y+dy)*w+p.x+dx,previous=path.at(-1),j=previous?(previous.y+dy)*w+previous.x+dx:i;if(!face.has(i)||!reachable.has(i)||Math.abs(f.elevation[i]-f.elevation[j])>.18){safe=false;break;}}
    if(safe)path.push(p);else finish();
   }finish();if(!removed.size)continue;
   const parts=components(cells.filter(i=>!removed.has(i)),w,h);if(parts.length<2)continue;const largest=Math.max(...parts.map(p=>p.length));if(largest>=cells.length)continue;
   // Removing a long strip of land must not look better than a short street.
   // Prefer compact faces; coastal fragments may still be narrow naturally.
   const thin=parts.reduce((sum,part)=>{const b=bounds(part,w),aspect=Math.max(b.width,b.height)/Math.min(b.width,b.height);return sum+part.length*Math.max(0,aspect-3)*.15;},0);
   const score=largest+removed.size*2+thin+parts.filter(p=>p.length<limits.minArea).reduce((s,p)=>s+p.length,0);if(!best||score<best.score)best={paths,parts,score};
  }
  if(best){for(const path of best.paths)record(path,'secondary',width);cuts+=best.paths.length;queue.push(...best.parts);}
 }
 return cuts;
}
function adjacency(neighborhoods,layer,maxDistance){
 const {width:w,height:h}=layer.board,f=layer.fields,owner=new Int32Array(w*h),graph=neighborhoods.map(()=>new Set());neighborhoods.forEach((n,k)=>n.cells.forEach(i=>owner[i]=k+1));
 neighborhoods.forEach((n,k)=>{
  const distance=new Map(),queue=[];for(const i of n.cells)for(const j of neighbors(i,w,h))if(f.road[j]&&f.waterType[j]==='none'&&!distance.has(j)){distance.set(j,1);queue.push(j);}
  for(let q=0;q<queue.length;q++){const i=queue[q],d=distance.get(i);for(const j of neighbors(i,w,h)){const other=owner[j]-1;if(other>=0&&other!==k){graph[k].add(other);graph[other].add(k);}if(d<maxDistance&&f.road[j]&&f.waterType[j]==='none'&&!distance.has(j)){distance.set(j,d+1);queue.push(j);}}}
 });return graph;
}
export function describeDistricts(layer,request,parcels){
 const w=layer.board.width,neighborhoods=[],unassigned=[];
 for(const cells of landFaces(layer,parcels)){
  const area=cells.length;if(area<request.neighborhoods.minArea||area>request.neighborhoods.maxArea){unassigned.push({reason:area<request.neighborhoods.minArea?'below-minimum':'above-maximum',area,cells});continue;}
  neighborhoods.push({id:'neighborhood-'+(neighborhoods.length+1),area,cells,bounds:bounds(cells,w)});
 }
 const graph=adjacency(neighborhoods,layer,request.streetWidth+2),available=new Set(neighborhoods.map((_,i)=>i)),quarters=[];
 for(let seed=0;seed<neighborhoods.length;seed++)if(available.has(seed)){
  const selected=new Set([seed]),frontier=[seed];let area=neighborhoods[seed].area;
  for(let q=0;q<frontier.length&&(area<request.quarters.minArea||selected.size<2);q++)for(const k of [...graph[frontier[q]]].sort((a,b)=>a-b))if(available.has(k)&&!selected.has(k)&&area+neighborhoods[k].area<=request.quarters.maxArea){selected.add(k);frontier.push(k);area+=neighborhoods[k].area;if(area>=request.quarters.minArea&&selected.size>=2)break;}
  if(selected.size>=2&&area>=request.quarters.minArea&&area<=request.quarters.maxArea){for(const k of selected)available.delete(k);quarters.push({id:'quarter-'+(quarters.length+1),area,neighborhoodIds:[...selected].sort((a,b)=>a-b).map(k=>neighborhoods[k].id)});}
 }
 return{neighborhoods,quarters,planning:{areaUnit:'land-cells-without-streets',unassigned,ungroupedNeighborhoodIds:[...available].map(k=>neighborhoods[k].id)}};
}
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
export function validateDistricts(value,layer,request){
 const expected=describeDistricts(layer,request,value.parcels);for(const key of ['neighborhoods','quarters','planning'])if(canonical(value[key])!==canonical(expected[key]))throw Error('План микрорайонов/кварталов не соответствует геометрии: '+key);
}
