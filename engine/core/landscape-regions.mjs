// Biome territories are solved on the final dry mask, after the shared Surface
// relief and watershed. Percentages constrain area; continuous geographic
// suitability determines where that area lies. Repeated cards blend their
// regional influences and may meet/merge rather than forcing isolated blobs.
import {LANDSCAPE_ADDITIONAL_BIOMES} from './landscape-profile.mjs';
import {clamp,fractalNoise,gaussianBlur,rounded} from './atlas-math.mjs';
import {gridNeighbors} from './topology.mjs';
import {landscapeFieldScale} from './landscape-uniformity.mjs';

function stringSeed(value){let seed=2166136261;for(let i=0;i<value.length;i++)seed=Math.imul(seed^value.charCodeAt(i),16777619);return seed>>>0;}
function quotas(cards,total){
 const used=cards.reduce((sum,card)=>sum+Math.round(card.percent*10),0),parts=[...cards.map(card=>({type:card.type,units:Math.round(card.percent*10)})),{type:null,units:1000-used}],counts=parts.map(part=>Math.floor(total*part.units/1000));
 let rest=total-counts.reduce((sum,count)=>sum+count,0);
 const order=parts.map((part,i)=>({i,remainder:total*part.units%1000})).sort((a,b)=>b.remainder-a.remainder||a.i-b.i);
 for(let k=0;k<rest;k++)counts[order[k].i]++;
 return parts.map((part,i)=>({...part,count:counts[i]}));
}
function regionalInfluence(cards,type,seed,scale=1,main=false){
 // Cache a small continuous field per type. Its cost is bounded by 64 cards
 // on 17x17 knots, never 64 full 300x300 noise grids or sorts.
 const side=17,values=new Float64Array(side*side),selected=cards.filter(card=>card.type===type&&card.percent>0);if(!selected.length&&main)selected.push({id:'@main-'+type,percent:100});const weight=selected.reduce((sum,card)=>sum+card.percent,0);
 if(!weight)return values.fill(.5);
 for(const card of selected){const s=seed^stringSeed(card.id);for(let y=0;y<side;y++)for(let x=0;x<side;x++)values[y*side+x]+=fractalNoise(s,x/(5.3*scale)+23,y/(5.3*scale)-17,{octaves:2})*card.percent/weight;}
 return values;
}
function sample(values,x,y,w,h){const gx=x/(w-1)*16,gy=y/(h-1)*16,ix=Math.min(15,Math.floor(gx)),iy=Math.min(15,Math.floor(gy)),fx=gx-ix,fy=gy-iy;return(values[iy*17+ix]*(1-fx)+values[iy*17+ix+1]*fx)*(1-fy)+(values[(iy+1)*17+ix]*(1-fx)+values[(iy+1)*17+ix+1]*fx)*fy;}

export function applyLandscapeRegions(fields,r,seed=r.seed){
 const {width:w,height:h}=r,n=w*h,base=r.landscape.baseBiome,cards=r.landscape.biomes??[],labels=new Array(n).fill(base),dry=[];
 for(let i=0;i<n;i++)if(fields.waterType[i]==='none')dry.push(i);
 if(!dry.length)return labels;
 const budget=quotas(cards,dry.length),targets=new Map();
 for(const part of budget){const type=part.type??base;targets.set(type,(targets.get(type)??0)+part.count);}
 for(const [type,count]of targets)if(!count)targets.delete(type);
 if(targets.size===1&&targets.has(base))return labels;
 let low=1,high=0;for(const i of dry){low=Math.min(low,fields.elevation[i]);high=Math.max(high,fields.elevation[i]);}
 const span=Math.max(.01,high-low),available=new Uint8Array(n);for(const i of dry)available[i]=1;
 const distance=new Int16Array(n).fill(w+h),queue=[];
 for(let i=0;i<n;i++)if(fields.waterType[i]!=='none'){distance[i]=0;queue.push(i);}
 for(let at=0;at<queue.length;at++)for(const j of gridNeighbors(queue[at],w,h,r.topology))if(distance[j]>distance[queue[at]]+1){distance[j]=distance[queue[at]]+1;queue.push(j);}
 // The two extremes are allocated before intermediate environments. This
 // avoids spending all low, wet valleys on a broad forest quota first.
 const fallback=base!=='meadow'&&targets.has('meadow')?'meadow':base;for(const i of dry)labels[i]=fallback;
 const types=['swamp','snow','mountains','volcanic','forest','desert','gravel','meadow'].filter(type=>type!==fallback&&(targets.get(type)??0)>0),side=Math.min(w,h),scale=landscapeFieldScale(r),clearings=targets.has('meadow')?regionalInfluence(cards,'meadow',seed,scale):null,
  radius=Math.max(1.6,Math.min(9,side*.035*scale)),
  regionalHeight=types.some(type=>['swamp','volcanic'].includes(type))?gaussianBlur(fields.elevation,w,h,radius):null,
  regionalHumidity=types.includes('desert')?gaussianBlur(fields.humidity,w,h,Math.max(2,Math.min(10,side*.03*scale))):null,
  freshDistance=new Int16Array(n).fill(w+h),freshQueue=[];
 if(types.includes('swamp')){
  for(let i=0;i<n;i++)if(['river','lake'].includes(fields.waterType[i])){freshDistance[i]=0;freshQueue.push(i);}
  for(let at=0;at<freshQueue.length;at++)for(const j of gridNeighbors(freshQueue[at],w,h,r.topology))if(freshDistance[j]>freshDistance[freshQueue[at]]+1){freshDistance[j]=freshDistance[freshQueue[at]]+1;freshQueue.push(j);}
 }
 const slope=types.includes('volcanic')?Array.from({length:n},(_,i)=>fields.slope?.[i]??Math.max(0,...gridNeighbors(i,w,h,r.topology).map(j=>Math.abs(fields.elevation[i]-fields.elevation[j])))):null,
  rockiness=slope?gaussianBlur(slope,w,h,Math.max(1,radius*.5)):null;
 const ridgeProminence=types.includes('mountains')?new Float64Array(n):null;
 if(ridgeProminence){
  // A ridge is higher on both sides of a cross-section. A plateau rim has
  // only one descending side; rewarding Laplacian alone mistakes its cliff
  // perimeter for a range and creates thin bands. Several cross-sections
  // avoid imposing one preferred mountain direction on either grid.
  const reach=Math.max(2,Math.round(side*.04*scale)),crossSections=[[reach,0],[0,reach],[reach,reach],[reach,-reach]];
  for(let i=0;i<n;i++){const x=i%w,y=Math.floor(i/w),e=fields.elevation[i];let prominence=0;
   for(const [dx,dy]of crossSections){
    const a=clamp(y+dy,0,h-1)*w+clamp(x+dx,0,w-1),b=clamp(y-dy,0,h-1)*w+clamp(x-dx,0,w-1);
    prominence=Math.max(prominence,Math.min(e-fields.elevation[a],e-fields.elevation[b]));
   }
   ridgeProminence[i]=clamp(prominence/Math.max(.025,span*.16));
  }
 }
 const ridgeAffinity=ridgeProminence?gaussianBlur(ridgeProminence,w,h,Math.max(1,Math.min(9,side*.03*scale))):null;
 for(const type of types){
  const influence=regionalInfluence(cards,type,seed,scale,type===base),raw=new Float64Array(n);
  for(let i=0;i<n;i++){
   const a=clamp((fields.elevation[i]-low)/span),wet=fields.humidity[i],temp=fields.temperature[i],nearWater=1-clamp(distance[i]/Math.max(4,side*.12)),regional=sample(influence,i%w,Math.floor(i/w),w,h);let suitability;
   if(type==='swamp'){
    const lowland=1-clamp((fields.elevation[i]-.36)/.45),fresh=1-clamp(freshDistance[i]/Math.max(4,side*.14)),valley=clamp((regionalHeight[i]-fields.elevation[i])/Math.max(.015,span*.08));
    suitability=.18*(1-a)+.32*wet+.4*fresh*lowland+.08*nearWater+.12*valley;
   }
   else if(type==='mountains'){
    const crest=clamp(ridgeAffinity[i]*2.5);
    suitability=.55*a+.48*crest+.08*(1-wet);
   }
   else if(type==='forest')suitability=.5*wet+.25*(1-Math.abs(a-.45))+.12*nearWater;
   else if(type==='desert')suitability=.67*(1-regionalHumidity[i])+.24*temp;
   else if(type==='gravel')suitability=.4*(1-wet)+.35*(1-Math.abs(a-.5))+.2*nearWater;
   else if(type==='snow')suitability=.42*a+.38*(1-temp)+.2*a*(1-temp);
   else if(type==='volcanic'){
    const rocky=clamp(rockiness[i]/.08),crest=clamp((fields.elevation[i]-regionalHeight[i])/Math.max(.018,span*.08));
    suitability=.45*a+.15*(1-wet)+.34*rocky+.1*crest;
   }
   else suitability=.5*(1-Math.abs(a-.35))+.37*(1-Math.abs(wet-.5));
   raw[i]=suitability+.28*(regional-.5);
   if(type==='forest'){
    // Coherent canopy fingers and recesses follow the regional woodland field;
    // the detail wavelength stays several cells wide, never per-cell scatter.
    const frequency=Math.min(side/6,12/scale),x=(i%w+(r.topology?.kind==='hex'?(Math.floor(i/w)&1)*.5:0))/(w-1),y=Math.floor(i/w)/(h-1),edge=fractalNoise(seed^0x5f1e3a,x*frequency+31,y*frequency-17,{octaves:2});
    raw[i]+=.14*(edge-.5);if(clearings)raw[i]-=.14*(sample(clearings,i%w,Math.floor(i/w),w,h)-.5);
   }
  }
  const blur=type==='meadow'?Math.min(4,Math.max(1.5,side/50)):type==='forest'?Math.min(1.2,Math.max(.65,side/150)):type==='desert'?Math.max(2,Math.min(8,side*.025*scale)):type==='snow'?Math.max(1.2,Math.min(3,side*.015)):side<75?1:1.7,
   scores=gaussianBlur(raw,w,h,blur),ranked=dry.filter(i=>available[i]).sort((a,b)=>scores[b]-scores[a]||a-b),count=targets.get(type);
  for(let at=0;at<count;at++){const i=ranked[at];labels[i]=type;available[i]=0;}
  // Remove one-cell confetti by equal-area boundary exchanges. The quota is
  // unchanged and only a currently unallocated (base) cell may be exchanged.
  for(let pass=0;pass<2;pass++){
   const isolated=ranked.slice(0,count).filter(i=>labels[i]===type&&gridNeighbors(i,w,h,r.topology).filter(j=>labels[j]===type&&fields.waterType[j]==='none').length<=1),frontier=ranked.slice(count).filter(i=>available[i]&&gridNeighbors(i,w,h,r.topology).filter(j=>labels[j]===type&&fields.waterType[j]==='none').length>=2);
   for(let k=0;k<Math.min(isolated.length,frontier.length);k++){const from=isolated[k],to=frontier[k];labels[from]=fallback;available[from]=1;labels[to]=type;available[to]=0;}
  }
 }
 // All region climates are composed together as continuous fields; the same
 // smooth target exists on both sides of every boundary. Surface's local
 // variation remains, while altitude, wet valleys and lee-side rain remain
 // readable inside the territories. Hydrology never gets recalculated here.
 const temperature=new Float64Array(n),humidity=new Float64Array(n);
 for(let i=0;i<n;i++){const climate=LANDSCAPE_ADDITIONAL_BIOMES[labels[i]];temperature[i]=climate.temperature;humidity[i]=climate.humidity;}
 const width=side<75?2:Math.min(6,side/35),smoothTemp=gaussianBlur(temperature,w,h,width),smoothWet=gaussianBlur(humidity,w,h,width),baseClimate=LANDSCAPE_ADDITIONAL_BIOMES[base];
 for(const i of dry){fields.temperature[i]=rounded(clamp(fields.temperature[i]+(smoothTemp[i]-baseClimate.temperature)*.75));fields.humidity[i]=rounded(clamp(fields.humidity[i]+(smoothWet[i]-baseClimate.humidity)*.75));}
 return labels;
}
