// Geometric penetration of the connected exterior sea into the convex hull.
// A long thin cape alone cannot pass this depth check; ocean must occupy a
// genuinely recessed point at least that far inside the landmass silhouette.
import {gridNeighbors} from '../engine/core/topology.mjs';
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
export function longestAxisShore(mask,width,height){
 let longest=0;
 for(let y=0;y<height;y++)for(const side of [-1,1]){let run=0;for(let x=0;x<width;x++){const i=y*width+x,other=y+side;run=mask[i]&&(other<0||other>=height||!mask[other*width+x])?run+1:0;longest=Math.max(longest,run);}}
 for(let x=0;x<width;x++)for(const side of [-1,1]){let run=0;for(let y=0;y<height;y++){const i=y*width+x,other=x+side;run=mask[i]&&(other<0||other>=width||!mask[y*width+other])?run+1:0;longest=Math.max(longest,run);}}
 return{maximumCells:longest,fractionOfSide:longest/Math.min(width,height)};
}
// Transects across water between different islands; outer sea and inland lakes
// cannot count as a strait. Width is in grid cells, not physical engine units.
export function straitWidthMetrics(mask,width,height,topology={kind:'square'}){
 const labels=new Int16Array(mask.length).fill(-1);let label=0;
 for(let i=0;i<mask.length;i++)if(mask[i]&&labels[i]<0){const queue=[i];labels[i]=label;for(let at=0;at<queue.length;at++)for(const j of gridNeighbors(queue[at],width,height,topology))if(mask[j]&&labels[j]<0){labels[j]=label;queue.push(j);}label++;}
 const axes=[0,1].map(axis=>{
  const along=axis?height:width,across=axis?width:height,samples=[];
  for(let line=Math.floor(along*.15);line<Math.ceil(along*.85);line++){
   let previous=-1,gap=0;
   for(let at=0;at<across;at++){
    const index=axis?line*width+at:at*width+line,current=labels[index];
    if(current<0){if(previous>=0)gap++;continue;}
    if(previous>=0&&current!==previous&&gap>0&&gap<=Math.min(width,height)*.15)samples.push(gap);
    previous=current;gap=0;
   }
  }
  return{axis:axis?'horizontal':'vertical',samples:samples.sort((a,b)=>a-b)};
 }).sort((a,b)=>b.samples.length-a.samples.length),chosen=axes[0],quantile=p=>chosen.samples[Math.floor((chosen.samples.length-1)*p)]??0,p10=quantile(.1),p50=quantile(.5),p90=quantile(.9);
 return{axis:chosen.axis,samples:chosen.samples.length,p10,p50,p90,ratio:p10?p90/p10:0,range:p90-p10};
}
export function marineBayDepth(mask,width,height,topology={kind:'square'}){
 const hex=topology.kind==='hex',dy=hex?Math.sqrt(3)/2:1,points=[];
 for(let i=0;i<mask.length;i++)if(mask[i]&&gridNeighbors(i,width,height,topology).some(j=>!mask[j])){
  const y=Math.floor(i/width),x=i%width+(hex?(y&1)*.5:0),v=y*dy;
  points.push({x,y:v},{x:x+1,y:v},{x:x+1,y:v+dy},{x,y:v+dy});
 }
 points.sort((a,b)=>a.x-b.x||a.y-b.y);const halves=[];
 for(const list of [points,[...points].reverse()]){const part=[];for(const p of list){while(part.length>1&&cross(part.at(-2),part.at(-1),p)<=0)part.pop();part.push(p);}part.pop();halves.push(part);}
 const hull=halves.flat(),seen=new Uint8Array(mask.length),queue=[];
 for(let i=0;i<mask.length;i++)if(!mask[i]&&(i<width||i>=mask.length-width||i%width===0||i%width===width-1)){seen[i]=1;queue.push(i);}
 for(let k=0;k<queue.length;k++)for(const j of gridNeighbors(queue[k],width,height,topology))if(!mask[j]&&!seen[j]){seen[j]=1;queue.push(j);}
 let maximum=0;
 for(const i of queue){const y=Math.floor(i/width),p={x:i%width+(hex?(y&1)*.5:0)+.5,y:(y+.5)*dy};if(hull.some((a,k)=>cross(a,hull[(k+1)%hull.length],p)<0))continue;
  let nearest=Infinity;for(let k=0;k<hull.length;k++){const a=hull[k],b=hull[(k+1)%hull.length],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));nearest=Math.min(nearest,Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy));}maximum=Math.max(maximum,nearest);
 }
 return{maximumCells:maximum,fractionOfSide:maximum/Math.min(width,height*dy),connectedExteriorOnly:true};
}
