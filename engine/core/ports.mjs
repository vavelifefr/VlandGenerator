import {roomContains} from './space.mjs';
export const makePort=(p,side,dx,dy)=>({...p,side,outside:{x:p.x+dx,y:p.y+dy},inside:{x:p.x-dx,y:p.y-dy}});
export function standardPortPairs(a,b,an,bn){
 const horizontal=an.x+an.spanX===bn.x||bn.x+bn.spanX===an.x,pairs=[];
 if(horizontal){const dx=an.x<bn.x?1:-1,lo=Math.max(a.y+2,b.y+2),hi=Math.min(a.y+a.height-3,b.y+b.height-3);
  for(let y=lo;y<=hi;y++)pairs.push({dx,dy:0,from:makePort({x:dx===1?a.x+a.width-1:a.x,y},dx===1?'E':'W',dx,0),to:makePort({x:dx===1?b.x:b.x+b.width-1,y},dx===1?'W':'E',-dx,0)});
 }else{const dy=an.y<bn.y?1:-1,lo=Math.max(a.x+2,b.x+2),hi=Math.min(a.x+a.width-3,b.x+b.width-3);
  for(let x=lo;x<=hi;x++)pairs.push({dx:0,dy,from:makePort({x,y:dy===1?a.y+a.height-1:a.y},dy===1?'S':'N',0,dy),to:makePort({x,y:dy===1?b.y:b.y+b.height-1},dy===1?'N':'S',0,-dy)});
 }
 return pairs.filter(p=>roomContains(a,p.from)&&roomContains(a,p.from.inside,{interior:true})&&roomContains(b,p.to)&&roomContains(b,p.to.inside,{interior:true}));
}
export function nestedPortPair(edge,rooms,nest){
 const leaf=rooms.find(r=>r.id===nest.childId),host=rooms.find(r=>r.id===nest.hostId),east=nest.corner.endsWith('W'),south=nest.corner.startsWith('N');
 let dx=0,dy=0,a,b;
 if(nest.axis==='x'){dx=east?1:-1;const y=leaf.y+Math.floor(leaf.height/2);a=makePort({x:dx===1?leaf.x+leaf.width-1:leaf.x,y},dx===1?'E':'W',dx,0);b=makePort({x:a.x+dx*(nest.gap+1),y},dx===1?'W':'E',-dx,0);}
 else{dy=south?1:-1;const x=leaf.x+Math.floor(leaf.width/2);a=makePort({x,y:dy===1?leaf.y+leaf.height-1:leaf.y},dy===1?'S':'N',0,dy);b=makePort({x,y:a.y+dy*(nest.gap+1)},dy===1?'N':'S',0,-dy);}
 if(!roomContains(host,b.inside,{interior:true}))throw new Error('Вход выемки не ведёт в хозяина.');
 return edge.from===leaf.id?{from:a,to:b,dx,dy}:{from:b,to:a,dx:-dx,dy:-dy};
}
