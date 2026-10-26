import {minHeap,neighbors,rounded,clamp} from './atlas-math.mjs';
import {gridDistance} from './topology.mjs';

// Priority-Flood: the parent is resolved earlier, including perfectly flat basins.
// This gives an acyclic routing tree without relying on tiny floating epsilons.
export function watershed(elevation,width,height,rainfall=null,topology){
  const n=width*height,filled=new Array(n),flowTo=new Array(n).fill(-1),rank=new Array(n),basin=new Array(n).fill(-1),seen=new Uint8Array(n),q=minHeap(),order=[];
  for(let i=0;i<n;i++){const x=i%width,y=Math.floor(i/width);if(!x||!y||x===width-1||y===height-1){seen[i]=1;filled[i]=elevation[i];basin[i]=i;q.push(i,filled[i]);}}
  while(q.length){const {id}=q.pop();rank[id]=order.length;order.push(id);for(const j of neighbors(id,width,height,topology))if(!seen[j]){seen[j]=1;filled[j]=Math.max(elevation[j],filled[id]);flowTo[j]=id;basin[j]=basin[id];q.push(j,filled[j]);}}
  const drainage=Array.from({length:n},(_,i)=>rainfall?.[i]??1);for(let k=order.length-1;k>=0;k--){const i=order[k];if(flowTo[i]>=0)drainage[flowTo[i]]+=drainage[i];}
  return{filledElevation:filled.map(rounded),flowTo,flowRank:rank,drainage:drainage.map(rounded),basin};
}
function profileChannels(fields,width,height,settings,topology,route,waterType,waterDepth,threshold,depth,uniformity){
  const n=width*height,dry=waterType.map(t=>t==='none'),seen=new Uint8Array(n),routed=new Uint8Array(n),heads=[];
  for(let start=0;start<n;start++)if(dry[start]&&!seen[start]){
    const cells=[start];seen[start]=1;let low=fields.elevation[start],high=low;
    for(let at=0;at<cells.length;at++){const i=cells[at];low=Math.min(low,fields.elevation[i]);high=Math.max(high,fields.elevation[i]);for(const j of neighbors(i,width,height,topology))if(!seen[j]&&dry[j]){seen[j]=1;cells.push(j);}}
    const minimum=low+(high-low)*.6,limit=Math.max(1,Math.ceil(Math.sqrt(cells.length)*settings.rivers/20)),
      spacing=Math.max(3,Math.sqrt(cells.length)/(limit+1)*.35),selected=[],
      candidates=cells.filter(i=>route.flowTo[i]>=0&&route.drainage[i]>=threshold&&fields.elevation[i]>=minimum)
        .sort((a,b)=>fields.elevation[b]-fields.elevation[a]||route.drainage[b]-route.drainage[a]||a-b);
    // Springs must still be high, fed by rain and routed by the watershed.
    // Uniformity only chooses among those valid sources: grouped headwaters
    // at the low end, separated catchments at the high end. The configured
    // source budget and acyclic flow graph remain unchanged.
    const balance=(uniformity-50)/50;
    while(selected.length<limit){
      let chosen=-1,best=-Infinity;
      for(const i of candidates){
        if(routed[i])continue;
        const distance=selected.length?Math.min(...selected.map(j=>gridDistance({x:i%width,y:Math.floor(i/width)},{x:j%width,y:Math.floor(j/width)},topology))):Infinity;
        if(distance<spacing)continue;
        if(!balance||!selected.length){chosen=i;break;}
        const newBasin=selected.every(j=>route.basin[j]!==route.basin[i])?1:0,
          geographic=(fields.elevation[i]-low)/Math.max(.001,high-low),score=geographic*.35+balance*(distance/Math.sqrt(cells.length)*1.7+newBasin*.25);
        if(score>best){best=score;chosen=i;}
      }
      if(chosen<0)break;
      const i=chosen;
      selected.push(i);heads.push(i);
      // A selected spring follows the existing acyclic graph through retained
      // lakes, joining an already traced channel without traversing it twice.
      for(let j=i;j>=0&&!routed[j]&&waterType[j]!=='sea';j=route.flowTo[j]){routed[j]=1;if(waterType[j]==='none'){waterType[j]='river';waterDepth[j]=depth(j);}}
    }
  }
  // On larger floodplains a short side arm may rejoin the same river below.
  // Its own DAG route and conditioned level must both run downstream. There
  // is still one primary flowTo; this only marks a bounded wet channel mask.
  const core=waterType.map(t=>t==='river');
  if(Math.min(width,height)<100||settings.riverWidth<=1)return core;
  const radius=settings.riverWidth-1,maxLength=Math.min(6,Math.floor(Math.min(width,height)/50)),
    limit=Math.max(1,Math.floor(heads.length/2));let arms=0;
  for(let i=0;i<n&&arms<limit;i++)if(core[i]&&route.drainage[i]>=threshold*3&&fields.elevation[i]<.55){
    for(const first of neighbors(i,width,height,topology)){
      if(waterType[first]!=='none'||route.flowRank[first]>=route.flowRank[i]||route.filledElevation[first]>route.filledElevation[i]+.000001)continue;
      const path=[];let j=first;
      while(j>=0&&path.length<maxLength&&waterType[j]==='none'&&Math.abs(fields.elevation[j]-fields.elevation[i])<.04&&route.filledElevation[j]<=route.filledElevation[i]+.000001&&gridDistance({x:j%width,y:Math.floor(j/width)},{x:i%width,y:Math.floor(i/width)},topology)<=radius){path.push(j);j=route.flowTo[j];}
      if(path.length<2||j<0||!core[j]||route.flowRank[j]>=route.flowRank[i])continue;
      for(const k of path){waterType[k]='river';waterDepth[k]=depth(k);}arms++;break;
    }
  }
  return core;
}
export function surfaceWater(fields,width,height,seaLevel,settings,topology,profile=false,uniformity=50){
  const n=width*height,ocean=new Uint8Array(n),queue=[];
  for(let i=0;i<n;i++){const x=i%width,y=Math.floor(i/width);if((!x||!y||x===width-1||y===height-1)&&fields.elevation[i]<=seaLevel){ocean[i]=1;queue.push(i);}}
  for(let k=0;k<queue.length;k++)for(const j of neighbors(queue[k],width,height,topology))if(!ocean[j]&&fields.elevation[j]<=seaLevel){ocean[j]=1;queue.push(j);}
  const route=watershed(fields.elevation,width,height,fields.rainfall,topology),waterType=new Array(n).fill('none'),waterDepth=new Array(n).fill(0);
  const riverThreshold=profile?Math.max(2,Math.round(Math.sqrt(n)*(.09-.06*settings.rivers))):Math.max(10,Math.round(n*(.02-.016*settings.rivers)));
  const riverDepth=i=>rounded(clamp(.035+Math.log2(route.drainage[i]/riverThreshold+1)*.012,.035,.12));
  const removeSmallLakes=()=>{const lakeSeen=new Uint8Array(n);for(let i=0;i<n;i++)if(waterType[i]==='lake'&&!lakeSeen[i]){const q=[i];lakeSeen[i]=1;for(let at=0;at<q.length;at++)for(const j of neighbors(q[at],width,height,topology))if(waterType[j]==='lake'&&!lakeSeen[j]){lakeSeen[j]=1;q.push(j);}if(q.length<settings.minLakeArea)for(const j of q){waterType[j]='none';waterDepth[j]=0;}}};
  for(let i=0;i<n;i++){
    const below=seaLevel-fields.elevation[i],basinDepth=route.filledElevation[i]-fields.elevation[i];
    if(ocean[i]){waterType[i]='sea';waterDepth[i]=rounded(clamp(below+.04,.02,.8));}
    else if(below>0||settings.lakes>0&&basinDepth>.018+(1-settings.lakes)*.05){waterType[i]='lake';waterDepth[i]=rounded(clamp(Math.max(below,basinDepth)*settings.lakes+.025,.025,.6));}
    else if(!profile&&settings.rivers>0&&route.drainage[i]>=riverThreshold&&route.flowTo[i]>=0){waterType[i]='river';waterDepth[i]=riverDepth(i);}
  }
  let profileCore;
  if(profile){
    // Lake filtering precedes the final channel mask: a discarded small pond
    // must not erase a strong stream passing through the same depression.
    removeSmallLakes();
    if(settings.rivers>0)profileCore=profileChannels(fields,width,height,settings,topology,route,waterType,waterDepth,riverThreshold,riverDepth,uniformity);
  }
  // Profile streams use only the configured bounded widening pass below.
  // Keep the profile-free native path, including its old lake-filter order.
  const core=profileCore?profileCore.map(v=>v?'river':'none'):[...waterType];if(!profile){for(let i=0;i<n;i++)if(core[i]==='river'&&route.drainage[i]>riverThreshold*3)for(const j of neighbors(i,width,height,topology))if(waterType[j]==='none'&&Math.abs(fields.elevation[j]-fields.elevation[i])<.05){waterType[j]='river';waterDepth[j]=.035;}removeSmallLakes();}
  if(settings.riverWidth>1){const rivers=core.flatMap((t,i)=>t==='river'?[i]:[]);for(const i of rivers){const radius=Math.min(settings.riverWidth-1,Math.floor(Math.sqrt(route.drainage[i]/riverThreshold)/2)),seen=new Set([i]),q=[[i,0]];for(let at=0;at<q.length;at++){const [j,d]=q[at];if(d>=radius)continue;for(const k of neighbors(j,width,height,topology))if(!seen.has(k)&&waterType[k]==='none'&&Math.abs(fields.elevation[k]-fields.elevation[i])<.04){seen.add(k);waterType[k]='river';waterDepth[k]=.035;q.push([k,d+1]);}}}}
  // A saturated static freshwater surface follows the conditioned watershed.
  // The sea anchor also keeps mouths and retained lake outlets consistent.
  // This internal head may exceed one; only the exported depth is normalized.
  if(profile)for(let i=0;i<n;i++)if(waterType[i]==='river'||waterType[i]==='lake')waterDepth[i]=rounded(clamp(Math.max(seaLevel+.04,route.filledElevation[i]+.035)-fields.elevation[i],0,1));
  return{...route,waterType,waterDepth,riverThreshold};
}
