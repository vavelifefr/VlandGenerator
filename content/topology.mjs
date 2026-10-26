// Kept inside content/ so this module can be copied without the generator.
export function tileNeighbors(i,width,height,topology){const x=i%width,y=Math.floor(i/width),dirs=topology?.kind==='hex'?(y&1?[[1,0],[-1,0],[0,-1],[1,-1],[0,1],[1,1]]:[[1,0],[-1,0],[-1,-1],[0,-1],[-1,1],[0,1]]):[[0,-1],[1,0],[0,1],[-1,0]];return dirs.flatMap(([dx,dy])=>x+dx>=0&&x+dx<width&&y+dy>=0&&y+dy<height?[(y+dy)*width+x+dx]:[]);}
export function tileDistance(a,b,topology){if(topology?.kind!=='hex')return Math.abs(a.x-b.x)+Math.abs(a.y-b.y);const q=p=>p.x-(p.y-(p.y&1))/2,dq=q(a)-q(b),dr=a.y-b.y;return(Math.abs(dq)+Math.abs(dr)+Math.abs(dq+dr))/2;}
export function withinRadius(a,b,radius,topology){return topology?.kind==='hex'?tileDistance(a,b,topology)<=radius:(a.x-b.x)**2+(a.y-b.y)**2<=radius**2;}
