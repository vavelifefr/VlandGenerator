import {minHeap} from './atlas-math.mjs';
const directions=[[0,-1],[1,0],[0,1],[-1,0]];
export const MAX_RIVER_SPAN=12,MAX_PIER_SEA_CELLS=3;
export function createStreetPlanner(layer,{bounds}={}){
 const {width:w,height:h}=layer.board,f=layer.fields,n=w*h,terrain={water:[...f.waterType],cliff:f.biome.map((b,i)=>b==='cliffs'||!!f.obstacle[i])},cache=new Map();
 function anchors(width){
  if(cache.has(width))return cache.get(width);const types=new Uint8Array(n),land=[];
  for(let y=1;y<h-width;y++)for(let x=1;x<w-width;x++){let type=1;for(let dy=0;dy<width&&type;dy++)for(let dx=0;dx<width;dx++){const i=(y+dy)*w+x+dx;if(bounds&&(x<bounds.left||y<bounds.top||x+dx>bounds.right||y+dy>bounds.bottom)){type=0;break;}if(terrain.cliff[i]||!f.support[i]||!['none','river'].includes(terrain.water[i])){type=0;break;}if(terrain.water[i]==='river')type=2;}types[y*w+x]=type;if(type===1)land.push(y*w+x);}
  const value={types,land};cache.set(width,value);return value;
 }
 const position=i=>({x:i%w,y:Math.floor(i/w)}),distance=(i,p)=>Math.abs(i%w-p.x)+Math.abs(Math.floor(i/w)-p.y);
 function nearest(point,width,roads){const {land}=anchors(width);let best=-1,score=Infinity;for(const i of land){if(roads?.size&&!roads.has(i))continue;const d=distance(i,point);if(d<score){best=i;score=d;}}return best;}
 function route(from,to,width,roads=new Set()){
  const {types}=anchors(width),first=nearest(from,width),last=nearest(to,width);if(first<0||last<0)return null;
  const distances=new Float64Array(n).fill(Infinity),previous=new Int32Array(n).fill(-1),heap=minHeap();distances[first]=0;heap.push(first,0);let closest=first,score=distance(first,to);
  while(heap.length){const {id,cost}=heap.pop();if(cost!==distances[id])continue;const d=distance(id,to);if(d<score){closest=id;score=d;}if(id===last){closest=id;break;}
   for(const[dx,dy]of directions){let steps=1,j=(Math.floor(id/w)+dy)*w+id%w+dx;if(j<0||j>=n||Math.abs(j%w-id%w)>1||!types[j])continue;
    if(types[j]===2){for(;steps<=MAX_RIVER_SPAN&&types[j]===2;steps++){const x=id%w+dx*(steps+1),y=Math.floor(id/w)+dy*(steps+1);if(x<1||y<1||x>=w-width||y>=h-width){j=-1;break;}j=y*w+x;}if(j<0||types[j]!==1||steps>MAX_RIVER_SPAN)continue;}
    let steep=false;for(let oy=0;oy<width&&!steep;oy++)for(let ox=0;ox<width;ox++)if(Math.abs(f.elevation[j+oy*w+ox]-f.elevation[id+oy*w+ox])>.18*steps+1e-6){steep=true;break;}if(steep)continue;
    const next=cost+steps*(roads.has(j)?.65:1)+(steps>1?steps*4:0)+Math.abs(f.elevation[j]-f.elevation[id])*8;
    if(next<distances[j]){distances[j]=next;previous[j]=id;heap.push(j,next);}
   }
  }
  if(closest===first)return null;const chain=[];for(let i=closest;i>=0;i=previous[i])chain.push(i);chain.reverse();const path=[position(first)];
  for(let k=1;k<chain.length;k++){const a=position(chain[k-1]),b=position(chain[k]),length=Math.abs(b.x-a.x)+Math.abs(b.y-a.y),dx=Math.sign(b.x-a.x),dy=Math.sign(b.y-a.y);for(let step=1;step<=length;step++)path.push({x:a.x+dx*step,y:a.y+dy*step});}return path;
 }
 function paint(path,width,type,roads){
  // Deck height follows the banks; the submerged river bed is not the walking surface.
  for(let dy=0;dy<width;dy++)for(let dx=0;dx<width;dx++)for(let a=0;a<path.length;a++){
   const index=k=>(path[k].y+dy)*w+path[k].x+dx;
   if(terrain.water[index(a)]==='none')continue;
   let b=a;while(b+1<path.length&&terrain.water[index(b+1)]!=='none')b++;
   const before=Math.max(0,a-1),after=Math.min(path.length-1,b+1),lo=f.elevation[index(before)],hi=after===b?lo:f.elevation[index(after)];
   for(let k=a;k<=b;k++)f.elevation[index(k)]=lo+(hi-lo)*(k-before)/Math.max(1,after-before);a=b;
  }
  for(const p of path)for(let dy=0;dy<width;dy++)for(let dx=0;dx<width;dx++){
   const i=(p.y+dy)*w+p.x+dx,water=terrain.water[i];if(terrain.cliff[i]||water!=='none'&&water!=='river'&&!(type==='pier'&&water==='sea'))throw Error('Улица пересекает неподходящий рельеф.');
   roads.add(i);f.road[i]=water==='sea'?'pier':water==='river'?'bridge':'trail';f.material[i]=water==='none'?(type==='village'?'soil':'gravel'):'timber';if(water!=='none')f.bridge[i]=1;f.reserved[i]=1;
  }
 }
 function pier(from,towards){
  const options=[...directions].sort(([ax,ay],[bx,by])=>(bx-ax)*(towards.x-from.x)+(by-ay)*(towards.y-from.y));
  for(const[dx,dy]of options){const path=[{...from}];let sea=0;for(let step=1;step<=7;step++){const x=from.x+dx*step,y=from.y+dy*step,i=y*w+x;if(x<1||y<1||x>=w-1||y>=h-1||terrain.cliff[i]||!['none','sea'].includes(terrain.water[i]))break;
    if(terrain.water[i]==='sea'){if(sea===MAX_PIER_SEA_CELLS)break;sea++;}else if(sea||step>4)break;path.push({x,y});
   }if(sea)return path;
  }return null;
 }
 return{terrain,anchors,nearest,route,paint,pier};
}
