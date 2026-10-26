// Measure only regional reversals of shoreline depth, after ignoring pixel
// steps. A regular comb has many substantial alternating capes and inlets;
// a broad cape or bay has one reversal. No target count of bays is rewarded.
export function shoreReversals(mask,width,height,prominence=.085){
 const top=Array.from(mask.subarray(0,width)),bottom=Array.from(mask.subarray(mask.length-width)),
  left=Array.from(mask).filter((_,i)=>i%width===0),right=Array.from(mask).filter((_,i)=>i%width===width-1),
  dry=edge=>edge.every(Boolean),sea=edge=>edge.every(v=>!v),vertical=dry(top)&&sea(bottom)||dry(bottom)&&sea(top);
 if(!vertical&&!(dry(left)&&sea(right)||dry(right)&&sea(left)))throw Error('A coast needs opposing dry and sea edges.');
 const length=vertical?width:height,depth=vertical?height:width,profile=Array.from({length},(_,along)=>{
  let cells=0;for(let across=0;across<depth;across++)cells+=mask[vertical?across*width+along:along*width+across];return cells/depth;
 }),radius=Math.max(1,Math.round(length*.025)),smoothed=profile.map((_,i)=>{
  let sum=0,count=0;for(let j=Math.max(0,i-radius);j<=Math.min(length-1,i+radius);j++){sum+=profile[j];count++;}return sum/count;
 });
 let direction=0,extreme=smoothed[0],turns=0;
 for(const value of smoothed){
  if(!direction){if(Math.abs(value-extreme)>=prominence){direction=Math.sign(value-extreme);extreme=value;}continue;}
  if(direction>0){if(value>extreme)extreme=value;else if(extreme-value>=prominence){turns++;direction=-1;extreme=value;}}
  else if(value<extreme)extreme=value;else if(value-extreme>=prominence){turns++;direction=1;extreme=value;}
 }
 return{turns,range:Math.max(...smoothed)-Math.min(...smoothed),profile:smoothed};
}
