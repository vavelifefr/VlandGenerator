import {roomContains} from './space.mjs';
export function compactLevelPreview(level){
 const walls=new Set(level.board.walls.map(p=>p.x+':'+p.y)),bands=[];
 for(const r of level.rooms)for(let y=r.y+1;y<r.y+r.height-1;y++){
  let start=null;for(let x=r.x+1;x<=r.x+r.width-1;x++){
   const free=x<r.x+r.width-1&&roomContains(r,{x,y},{interior:true})&&!walls.has(x+':'+y);
   if(free&&start===null)start=x;if(!free&&start!==null){bands.push({x:start,y,width:x-start,districtKind:r.districtKind});start=null;}
  }
 }
 return{width:level.board.width,height:level.board.height,bands,passages:level.connections.flatMap(c=>[c.fromDoor,...c.cells,c.toDoor])};
}
