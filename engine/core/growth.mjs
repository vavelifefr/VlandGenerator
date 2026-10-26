import {seededRandom} from './random.mjs';
export const LAYOUT_PRESETS=Object.freeze({
 compact:{name:'Компактные кварталы',loops:.5,branches:.24,large:.14},
 branches:{name:'Разветвлённые крылья',loops:.18,branches:.3,large:.12},
 rings:{name:'Кольца и обходы',loops:.85,branches:.2,large:.18},
 sectors:{name:'Группы залов',loops:.42,branches:.26,large:.24}
});
for(const rules of Object.values(LAYOUT_PRESETS))Object.freeze(rules);
export function layoutPresetForSeed(seed,number=1){const ids=Object.keys(LAYOUT_PRESETS);return ids[Math.floor(seededRandom((seed^Math.imul(number,0x68bc21eb))>>>0)()*ids.length)];}
export function adjacentFootprints(a,b){
 const aw=a.spanX??1,ah=a.spanY??1,bw=b.spanX??1,bh=b.spanY??1;
 return((a.x+aw===b.x||b.x+bw===a.x)&&Math.max(a.y,b.y)<Math.min(a.y+ah,b.y+bh))||((a.y+ah===b.y||b.y+bh===a.y)&&Math.max(a.x,b.x)<Math.min(a.x+aw,b.x+bw));
}
export function frontierPlacements(parents,occupied,spanX=1,spanY=1){
 const cells=new Map();
 for(const p of parents){
  const options=[];
  for(let x=p.x-spanX+1;x<p.x+(p.spanX??1);x++)for(const y of [p.y-spanY,p.y+(p.spanY??1)])options.push({x,y,spanX,spanY});
  for(let y=p.y-spanY+1;y<p.y+(p.spanY??1);y++)for(const x of [p.x-spanX,p.x+(p.spanX??1)])options.push({x,y,spanX,spanY});
  for(const candidate of options){const key=candidate.x+':'+candidate.y;if(cells.has(key))continue;let free=true;
   for(let y=candidate.y;y<candidate.y+spanY;y++)for(let x=candidate.x;x<candidate.x+spanX;x++)if(occupied.has(x+':'+y))free=false;
   if(free)cells.set(key,{...candidate,neighbors:parents.filter(parent=>adjacentFootprints(parent,candidate))});
  }
 }
 return[...cells.values()];
}
export function rankFrontier(candidates,parents,random,{preset='compact',step=0,ensureLoop=false}={}){
 if(!Object.hasOwn(LAYOUT_PRESETS,preset))throw new Error('Неизвестный пресет компоновки.');
 const cx=parents.reduce((n,p)=>n+p.x+(p.spanX??1)/2,0)/parents.length,cy=parents.reduce((n,p)=>n+p.y+(p.spanY??1)/2,0)/parents.length;
 const anchor=parents[Math.max(0,parents.length-1-step%4)],kind=ensureLoop&&step<3?'compact':preset;
 return candidates.map(p=>{
  const dx=p.x+(p.spanX??1)/2-cx,dy=p.y+(p.spanY??1)/2-cy,radial=dx*dx+dy*dy,degree=p.neighbors.length;
  let score=kind==='branches'?(degree-1)*35+radial*.18:kind==='rings'?-degree*27+radial*1.1:kind==='sectors'?-degree*12+((p.x-anchor.x)**2+(p.y-anchor.y)**2)*1.4:-degree*20+radial*3;
  const xs=[...parents.map(n=>n.x),p.x],ys=[...parents.map(n=>n.y),p.y],w=Math.max(...parents.map(n=>n.x+(n.spanX??1)),p.x+(p.spanX??1))-Math.min(...xs),h=Math.max(...parents.map(n=>n.y+(n.spanY??1)),p.y+(p.spanY??1))-Math.min(...ys);
  score+=Math.max(0,Math.max(w,h)-Math.min(w,h)*2)*3+random()*5;
  return{...p,score};
 }).sort((a,b)=>a.score-b.score||a.y-b.y||a.x-b.x);
}
export function orientFootprints(nodes,random){
 const rotation=Math.floor(random()*4),mirrored=random()<.5;
 const transformed=nodes.map(n=>{const points=[];for(let y=n.y;y<n.y+(n.spanY??1);y++)for(let x=n.x;x<n.x+(n.spanX??1);x++){let xx=mirrored?-x:x,yy=y;for(let i=0;i<rotation;i++)[xx,yy]=[-yy,xx];points.push([xx,yy]);}
  const x=Math.min(...points.map(p=>p[0])),y=Math.min(...points.map(p=>p[1]));return{...n,x,y,spanX:Math.max(...points.map(p=>p[0]))-x+1,spanY:Math.max(...points.map(p=>p[1]))-y+1};});
 const minX=Math.min(...transformed.map(n=>n.x)),minY=Math.min(...transformed.map(n=>n.y));return{rotation,mirrored,nodes:transformed.map(n=>({...n,x:n.x-minX,y:n.y-minY}))};
}
