const inBox=(box,p,pad=0)=>p.x>=box.x+pad&&p.y>=box.y+pad&&p.x<box.x+box.width-pad&&p.y<box.y+box.height-pad;
export function roomContains(room,p,{interior=false}={}){
 if(!room||!inBox(room,p,interior?1:0))return false;
 return !room.notch||!inBox(room.notch,p)||!interior&&room.doors?.some(d=>d.x===p.x&&d.y===p.y);
}
export const roomAt=(rooms,p,options)=>rooms?.find(r=>roomContains(r,p,options));
export function roomEnvelopesOverlap(a,b){
 const left=Math.max(a.x,b.x),top=Math.max(a.y,b.y),right=Math.min(a.x+a.width,b.x+b.width),bottom=Math.min(a.y+a.height,b.y+b.height);
 if(left>=right||top>=bottom)return false;if(!a.notch&&!b.notch)return true;
 for(let y=top;y<bottom;y++)for(let x=left;x<right;x++)if(roomContains(a,{x,y})&&roomContains(b,{x,y}))return true;return false;
}
