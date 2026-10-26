// Pure surface-profile helpers. Apply final elevation before surfaceWater and
// after noise smoothing/erosion; a later water-quantile shift would undo shape.
import {clamp,fractalNoise,hash2,rounded,minHeap} from './atlas-math.mjs';
import {gridNeighbors} from './topology.mjs';

export const LANDSCAPE_STRUCTURES=Object.freeze({
 land:Object.freeze({name:'Суша',description:'Суша без моря; реки и озёра возможны.'}),
 coast:Object.freeze({name:'Суша с берегом моря',description:'Одна сторона суши выходит к морю.'}),
 islands:Object.freeze({name:'Острова',description:'Три островных ядра с морскими разделителями.'}),
 continent:Object.freeze({name:'Большой остров / континент',description:'Один крупный массив суши в морской рамке.'})
});
const biome=(name,id,temperature,humidity,preset='temperate')=>Object.freeze({name,biome:id,temperature,humidity,preset});
export const LANDSCAPE_BIOMES=Object.freeze({
 meadow:biome('Луга','plains',.57,.52),forest:biome('Леса','forest',.52,.73),
 swamp:biome('Болота','wetland',.6,.88),desert:biome('Пустыня','desert',.85,.12,'desert'),
 snow:biome('Снежный','snow',.12,.5,'frozen'),mountains:biome('Гористый','alpine',.35,.48,'highlands'),
 volcanic:biome('Вулканический','volcanic',.74,.2,'volcanic')
});

export const LANDSCAPE_ADDITIONAL_BIOMES=Object.freeze({...LANDSCAPE_BIOMES,gravel:biome('Гравий','gravel',.57,.35)});

export function normalizeLandscapeProfile(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['structure','baseBiome','biomes','landPercent','uniformity','coastErosion'].includes(key))||
  !Object.hasOwn(value,'structure')||!Object.hasOwn(value,'baseBiome')||
  typeof value.structure!=='string'||!Object.hasOwn(LANDSCAPE_STRUCTURES,value.structure)||
  typeof value.baseBiome!=='string'||!Object.hasOwn(LANDSCAPE_BIOMES,value.baseBiome))
  throw Error('Ландшафт: выберите structure и baseBiome из обязательных списков.');
 const cards=Object.hasOwn(value,'biomes')?value.biomes:[],ids=new Set();let tenths=0;
 if(!Array.isArray(cards)||cards.length>64)throw Error('Ландшафт: biomes — список до64 блоков с id, type и percent.');
 const biomes=Array.from(cards,card=>{
  if(!card||typeof card!=='object'||Array.isArray(card)||Object.keys(card).length!==3||Object.keys(card).some(key=>!['id','type','percent'].includes(key))||
   typeof card.id!=='string'||!card.id.trim()||Array.from(card.id).length>64||ids.has(card.id)||
   typeof card.type!=='string'||!Object.hasOwn(LANDSCAPE_ADDITIONAL_BIOMES,card.type)||!Number.isFinite(card.percent)||card.percent<0||card.percent>100||Math.abs(card.percent*10-Math.round(card.percent*10))>1e-7)
   throw Error('Ландшафт: каждому блоку нужны уникальный id до64 символов, type из списка и percent0–100 с шагом0.1.');
  ids.add(card.id);tenths+=Math.round(card.percent*10);return{id:card.id,type:card.type,percent:Math.round(card.percent*10)/10};
 });
 if(tenths>1000)throw Error('Ландшафт: сумма процентов биомов не должна превышать100% суши.');
 const landPercent=Object.hasOwn(value,'landPercent')?value.landPercent:75,uniformity=Object.hasOwn(value,'uniformity')?value.uniformity:50,coastErosion=Object.hasOwn(value,'coastErosion')?value.coastErosion:50;
 if(!Number.isInteger(landPercent)||landPercent<1||landPercent>99||!Number.isInteger(uniformity)||uniformity<0||uniformity>100)throw Error('Ландшафт: landPercent — целое1–99, uniformity — целое0–100.');
 if(!Number.isInteger(coastErosion)||coastErosion<0||coastErosion>100)throw Error('Ландшафт: coastErosion — целое0–100.');
 return{structure:value.structure,baseBiome:value.baseBiome,biomes,landPercent,uniformity,coastErosion};
}

const smooth=v=>{const n=clamp(v);return n*n*(3-2*n);};
const geometryCache=new WeakMap();
// Grow a connected prefix while keeping the remaining ocean locally connected.
// A land-only flood can close an inlet: surfaceWater would then call those
// negative cells an inland lake, silently changing the requested sea quota.
// Simple-cell growth prevents that closure instead of repairing it afterwards.
function finalizeSeaQuota(signed,r,protectedCells,domains,target){
 const {width:w,height:h}=r,n=w*h,land=new Uint8Array(n),queued=new Uint8Array(n),heap=minHeap();let count=protectedCells.size;
 for(const i of protectedCells)land[i]=1;
 const push=i=>{if(!land[i]&&domains[i]>=0&&!queued[i]){heap.push(i,-signed[i]);queued[i]=1;}},
  simple=i=>{const adjacent=gridNeighbors(i,w,h,r.topology).filter(j=>!land[j]);if(!adjacent.length)return false;const seen=new Set([adjacent[0]]),q=[adjacent[0]],x=i%w,y=Math.floor(i/w);for(let k=0;k<q.length;k++)for(const j of gridNeighbors(q[k],w,h,r.topology))if(j!==i&&!land[j]&&!seen.has(j)&&Math.abs(j%w-x)<=1&&Math.abs(Math.floor(j/w)-y)<=1){seen.add(j);q.push(j);}return adjacent.every(j=>seen.has(j));};
 for(const i of protectedCells)for(const j of gridNeighbors(i,w,h,r.topology))push(j);
 while(count<target&&heap.length){const {id:i}=heap.pop();queued[i]=0;if(land[i]||!simple(i))continue;
  const adjacent=gridNeighbors(i,w,h,r.topology);if(adjacent.some(j=>land[j]&&domains[j]!==domains[i]))continue;
  land[i]=1;count++;for(const j of adjacent)push(j);
 }
 if(count!==target)throw Error('Выбранная доля суши не помещается без разрыва моря и островных ядер.');
 for(let i=0;i<n;i++)signed[i]=land[i]?Math.max(.001,Math.abs(signed[i])):-Math.max(.001,Math.abs(signed[i]));
}
function geologicalGeometry(r,seed){
 const {width:w,height:h}=r,n=w*h,kind=r.topology?.kind??'square',structure=r.landscape.structure,side=Math.min(w,h),detail=clamp((side-50)/250),
  landPercent=r.landscape.landPercent??75,shoreErosion=(r.landscape.coastErosion??50)/100,target=Math.round(n*landPercent/100),protectedCells=new Set(),domains=new Int8Array(n).fill(-1),x=new Float64Array(n),y=new Float64Array(n),wx=new Float64Array(n),wy=new Float64Array(n),signed=new Float64Array(n),volcanoDistance=new Float64Array(n),
  point=(u,v)=>{const yy=clamp(Math.round((v+1)*(h-1)/2),1,h-2),xx=clamp(Math.round((u+1)*(w-1+(kind==='hex'?.5:0))/2-(kind==='hex'?(yy&1)*.5:0)),1,w-2);return yy*w+xx;},
  edge=i=>i<w||i>=n-w||i%w===0||i%w===w-1;
 for(let i=0;i<n;i++){
  const p=position(r,i%w,Math.floor(i/w));x[i]=p.u;y[i]=p.v;
  // Regional bends and smaller headlands distort the entire continuous field,
  // rather than adding a high-frequency random jagged edge after thresholding.
  const amplitude=.075+detail*.085+(structure==='islands'?clamp((landPercent-40)/40)*.3:0);
  const warp=structure==='islands'?shoreErosion*.55:1;
  wx[i]=p.u+warp*((fractalNoise(seed^0x58ad,p.u*1.8+17,p.v*1.8-23,{octaves:3})-.5)*amplitude*2+(fractalNoise(seed^0x96c1,p.u*6+31,p.v*6-47,{octaves:2})-.5)*(.06+detail*.2));
  wy[i]=p.v+warp*((fractalNoise(seed^0x219b,p.u*1.8-37,p.v*1.8+13,{octaves:3})-.5)*amplitude*2+(fractalNoise(seed^0x713d,p.u*6-19,p.v*6+41,{octaves:2})-.5)*(.06+detail*.2));
 }
 const curve=(segments,a,control,b,steps=5)=>{let previous=a;for(let k=1;k<=steps;k++){const t=k/steps,next={x:(1-t)**2*a.x+2*(1-t)*t*control.x+t*t*b.x,y:(1-t)**2*a.y+2*(1-t)*t*control.y+t*t*b.y,radius:a.radius+(b.radius-a.radius)*t};segments.push([previous,next]);previous=next;}},
  proximity=(px,py,segments)=>{let nearest=Infinity;for(const [a,b]of segments){const dx=b.x-a.x,dy=b.y-a.y,t=clamp(((px-a.x)*dx+(py-a.y)*dy)/(dx*dx+dy*dy||1)),radius=a.radius+(b.radius-a.radius)*t;nearest=Math.min(nearest,Math.hypot(px-a.x-t*dx,py-a.y-t*dy)/radius);}return nearest;},
  flood=(potential,starts,allowed)=>{const distance=new Float64Array(n).fill(Infinity),seen=new Uint8Array(n),order=[...starts],sources=new Set(starts),heap=minHeap();for(const i of starts){distance[i]=potential[i];heap.push(i,potential[i]);}
   while(heap.length){const current=heap.pop(),i=current.id;if(seen[i]||current.cost!==distance[i])continue;seen[i]=1;if(!sources.has(i))order.push(i);for(const j of gridNeighbors(i,w,h,r.topology))if(!seen[j]&&allowed(j)){const cost=Math.max(current.cost,potential[j]);if(cost<distance[j]){distance[j]=cost;heap.push(j,cost);}}}return{distance,order};},
  select=(result,count)=>{if(!Number.isInteger(count)||count<1||count>result.order.length)throw Error('Выбранная доля суши не помещается с морскими границами и раздельными островами.');const chosen=new Uint8Array(n);for(let k=0;k<count;k++)chosen[result.order[k]]=1;return chosen;};
 if(structure==='coast'){
  const vertical=hash2(seed,7,19)>.5,flip=hash2(seed,11,29)>.5?-1:1,potential=new Float64Array(n),starts=[],drySide=flip>0?(vertical?h-1:w-1):0,
   featureCenter=(hash2(seed,19,701)-.5)*1.2,featureWidth=.4+hash2(seed,23,709)*.45,
   featureAmplitude=(hash2(seed,37,727)>.5?1:-1)*(.22+hash2(seed,41,733)*.16),
   asymmetry=(hash2(seed,43,739)-.5)*.5,tilt=(hash2(seed,47,743)-.5)*.22;
  // A mainland gradient and continuous geological fields determine this coast.
  // At most one broad regional cape OR inlet is emphasized; neither alternating
  // knots nor repeated tubular branches manufacture a mandatory zigzag rhythm.
  // Resolution refines secondary detail, not the number of dominant features.
  for(let i=0;i<n;i++){
   const px=x[i]+(wx[i]-x[i])*.35*shoreErosion,py=y[i]+(wy[i]-y[i])*.35*shoreErosion,inland=(vertical?py:px)*flip,along=vertical?px:py,
    offset=along-featureCenter,width=featureWidth*(1+Math.sign(offset)*asymmetry),
    feature=featureAmplitude*Math.exp(-((offset/width)**2)),
    regional=(fractalNoise(seed^0x3179,along*.7+17,inland*.7+31,{octaves:2})-.5)*.36,
    local=(fractalNoise(seed^0x6317,along*4+37,inland*4-19,{octaves:2})-.5)*(.04+detail*.04);
   potential[i]=-inland+shoreErosion*(regional*1.8+feature*2.2+tilt*along)+shoreErosion**2*local*5;
   const coordinate=vertical?Math.floor(i/w):i%w;if(coordinate!==(vertical?h-1:w-1)-drySide)domains[i]=0;
   if(coordinate===drySide){potential[i]=-1;starts.push(i);protectedCells.add(i);}else if(coordinate===(vertical?h-1:w-1)-drySide)potential[i]=1;
   volcanoDistance[i]=Math.hypot(inland-.5,along);
  }
  const seaSide=(vertical?h-1:w-1)-drySide,result=flood(potential,starts,i=>(vertical?Math.floor(i/w):i%w)!==seaSide);
  if(target<starts.length)throw Error('Выбранная доля суши меньше обязательного сухого края.');
  const chosen=select(result,target),threshold=result.distance[result.order[target-1]];
  for(let i=0;i<n;i++)signed[i]=chosen[i]?Math.max(.001,threshold-result.distance[i]):Math.min(-.001,threshold-result.distance[i]);
 }else if(structure==='continent'){
  const erosion=(r.landscape.coastErosion??50)/100,potential=new Float64Array(n).fill(Infinity),marineValleys=[],angles=[],
   center=point(0,0),features=Array.from({length:7},(_,k)=>{
    const angle=hash2(seed,k,1103)*Math.PI*2,radius=.7+hash2(seed,k,1109)*.24;
    return{x:Math.cos(angle)*radius,y:Math.sin(angle)*radius,width:.15+hash2(seed,k,1117)*.16,sign:hash2(seed,k,1123)>.42?1:-1,strength:.16+hash2(seed,k,1129)*.2};
   });
  const valleyCount=2+Math.floor(hash2(seed,31,1201)*2);
  for(let attempt=0;angles.length<valleyCount&&attempt<80;attempt++){
   const angle=hash2(seed,attempt,1213)*Math.PI*2;
   if(angles.some(a=>Math.abs(Math.atan2(Math.sin(angle-a),Math.cos(angle-a)))<.85))continue;
   const k=angles.length;angles.push(angle);const bend=(hash2(seed,k,1217)-.5)*.9,reach=.3+hash2(seed,k,1223)*.35,
    mouth={x:Math.cos(angle)*1.55,y:Math.sin(angle)*1.55,radius:.13+hash2(seed,k,1229)*.055},
    head={x:Math.cos(angle+bend)*reach,y:Math.sin(angle+bend)*reach,radius:.07+hash2(seed,k,1231)*.04},
    control={x:Math.cos(angle-bend)*.85,y:Math.sin(angle-bend)*.85};
   curve(marineValleys,mouth,control,head,8);
  }
  // Erosion is a scale-space coastline control, not a shoreline random walk.
  // A superellipse gives the un-eroded rounded rectangle. Continuous regional
  // fields, wide coves and smaller rocky headlands progressively deform it.
  // The relief still comes from Surface; this field changes only its sea mask.
  for(let i=0;i<n;i++)if(!edge(i)){
   domains[i]=0;const u=x[i],v=y[i],px=u+(wx[i]-u)*erosion*.55,py=v+(wy[i]-v)*erosion*.55,
    exponent=8-4*erosion**3,body=(Math.abs(px)**exponent+Math.abs(py)**exponent)**(1/exponent),
    regional=(fractalNoise(seed^0x3b17,px*2.1+17,py*2.1-31,{octaves:3})-.5)*.53,
    headlands=(fractalNoise(seed^0xa53d,px*7.3-29,py*7.3+41,{octaves:2})-.5)*.14,
    small=(fractalNoise(seed^0x719f,px*15+61,py*15-13,{octaves:2})-.5)*.045;
   let coves=0;for(const f of features)coves+=f.sign*f.strength*Math.exp(-((px-f.x)**2+(py-f.y)**2)/(2*f.width*f.width));
   const margin=1-Math.max(Math.abs(u),Math.abs(v)),
    paddingX=.055+(fractalNoise(seed^0x5713,v*3.7+17,u*1.3+23,{octaves:3})-.5)*.18+(fractalNoise(seed^0x715b,v*9.1-31,u*1.1+29,{octaves:2})-.5)*.08,
    paddingY=.055+(fractalNoise(seed^0x931d,u*3.3-19,v*1.3+37,{octaves:3})-.5)*.18+(fractalNoise(seed^0x17b3,u*8.7+41,v*1.1+43,{octaves:2})-.5)*.08,
    geologicalMargin=1-((Math.abs(u)/(1-paddingX))**4+(Math.abs(v)/(1-paddingY))**4)**.25,
    frame=.000015/Math.max(.003,margin)**2+erosion**4*.06*Math.exp((.035-geologicalMargin)/.035);
   const valley=proximity(px,py,marineValleys),incision=Math.exp(-2*valley*valley)*2.5;
   potential[i]=body+erosion*(regional*(1+erosion**4*.5)+coves)+erosion**1.5*(headlands*(1+erosion**4*1.5)+small)+frame*erosion+erosion**4*incision;
  }
  protectedCells.add(center);potential[center]=0;
  const result=flood(potential,[center],i=>domains[i]===0),chosen=select(result,target),threshold=result.distance[result.order[target-1]];
  for(let i=0;i<n;i++){
   signed[i]=chosen[i]?Math.max(.001,threshold-result.distance[i]):Math.min(-.001,threshold-result.distance[i]);
   volcanoDistance[i]=Number.isFinite(result.distance[i])?result.distance[i]/Math.max(.001,threshold)*.8:1;
  }
 }else{
  // Each island has its own curved, asymmetric body. Competing body potentials
  // determine a winding strait, rather than slicing a rectangle into sectors.
  // Three parallel strips are a rare seed variant, rather than half the maps.
  const turn=Math.floor(hash2(seed,17,1301)*4)*Math.PI/2,ct=Math.cos(turn),st=Math.sin(turn),parallel=hash2(seed,19,1381)<.02,
   layouts=parallel?[[-.02,-.64,.97,.33,0],[.01,.01,.98,.34,0],[-.01,.66,.96,.32,0]]:[[-.5,-.45,.55,.51,Math.PI/2],[.5,-.48,.5,.51,Math.PI/2],[0,.54,.96,.45,0]],
   islands=layouts.map(([u,v,a,b,direction],k)=>{
    u+=(hash2(seed,k,1303)-.5)*.1;v+=(hash2(seed,k,1307)-.5)*.1;
    const center=point(u*ct-v*st,u*st+v*ct),angle=turn+direction+(hash2(seed,k,1319)-.5)*(parallel?.16:.7);
    return{center,ox:x[center],oy:y[center],a:a*(.94+hash2(seed,k,1399)*.12),b:b*(.94+hash2(seed,k,1409)*.12),cos:Math.cos(angle),sin:Math.sin(angle),bend:(hash2(seed,k,1321)-.5)*(parallel?.38:.7),phase:hash2(seed,k,1327)*Math.PI*2,lobes:[.09+hash2(seed,k,1423)*.08,.05+hash2(seed,k,1427)*.065,.02+hash2(seed,k,1429)*.03],meander:.08+hash2(seed,k,1433)*.08,frequency:1.4+hash2(seed,k,1439)*.9};
   }),bayCount=2+Math.floor(hash2(seed,71,1333)*4),coastalBays=Array.from({length:bayCount},(_,k)=>{const angle=hash2(seed,73,1337)*Math.PI*2+k*Math.PI*2/bayCount+(hash2(seed,k,1361)-.5)*.7,c=Math.cos(angle),s=Math.sin(angle),reach=.99/Math.max(Math.abs(c),Math.abs(s));return{x:c*reach,y:s*reach,width:.22+hash2(seed,k,1367)*.1,strength:.65+hash2(seed,k,1373)*.2};}),costs=new Float64Array(n).fill(Infinity);
  const straitPools=[];for(let a=0;a<islands.length;a++)for(let b=a+1;b<islands.length;b++){const p=islands[a],q=islands[b],dx=q.ox-p.ox,dy=q.oy-p.oy,d=Math.hypot(dx,dy),k=a*3+b,offset=(hash2(seed,k,1451)>.5?1:-1)*(.2+hash2(seed,k,1453)*.2);straitPools.push({x:(p.ox+q.ox)/2-dy/d*offset,y:(p.oy+q.oy)/2+dx/d*offset,radius:.2+hash2(seed,k,1459)*.07,strength:(parallel?1:.6)*(.28+hash2(seed,k,1471)*.1)});}
  for(let i=0;i<n;i++)if(!edge(i)){
   const u=x[i],v=y[i],margin=1-Math.max(Math.abs(u),Math.abs(v)),
    frame=(.002+(parallel?.002:landPercent>=60?.001:0)*shoreErosion**4)*Math.exp(shoreErosion*(fractalNoise(seed^0x5a17,u*4.1+21,v*4.1-31,{octaves:2})-.5)*7)/Math.max(.006,margin)**1.5;
   let openBays=0;for(const bay of coastalBays)openBays+=bay.strength*Math.exp(-((u-bay.x)**2+(v-bay.y)**2)/(2*bay.width*bay.width));
   let best=Infinity,second=Infinity,owner=-1;
   for(let k=0;k<islands.length;k++){
    const a=islands[k],dx=wx[i]-a.ox,dy=wy[i]-a.oy,
     longitudinal=(dx*a.cos+dy*a.sin)/a.a,
     lateral=(-dx*a.sin+dy*a.cos)/a.b-a.bend*(longitudinal*longitudinal-.2)-a.meander*(.7+.6*shoreErosion)*Math.sin(longitudinal*a.frequency+a.phase),
     angle=Math.atan2(lateral,longitudinal),
     lobes=1+a.lobes[0]*Math.cos(angle*2+a.phase)+a.lobes[1]*Math.sin(angle*3-a.phase)+a.lobes[2]*Math.cos(angle+a.phase*2),
     body=(Math.abs(longitudinal)**2.5+Math.abs(lateral)**2.5)**(1/2.5)/lobes,
     regional=(fractalNoise(seed^(0x7b31+k*719),u*2.1+23,v*2.1-17,{octaves:3})-.5)*.55,
     headlands=(fractalNoise(seed^(0x3d71+k*947),u*6.1-13,v*6.1+39,{octaves:2})-.5)*.16,
     // Densely packed staggered bodies need stronger broad coastal recesses.
     value=body+(.2+.8*shoreErosion)*regional+shoreErosion**2*headlands+frame+(.6+.4*shoreErosion)*(parallel||landPercent<60?1:1.5)*openBays;
    if(value<best){second=best;best=value;owner=k;}else second=Math.min(second,value);
   }
   const widthField=smooth((fractalNoise(seed^0x2fa1,u*1.8+17,v*1.8-29,{octaves:2})-.25)/.5);
   let widening=0;for(const pool of straitPools)widening=Math.max(widening,pool.strength*Math.exp(-((u-pool.x)**2+(v-pool.y)**2)/(2*pool.radius*pool.radius)));
   const straitWidth=.025+.06*widthField*widthField+widening+1/side;
   costs[i]=best;domains[i]=second-best>straitWidth?owner:-1;signed[i]=2-best;
  }
  for(let k=0;k<islands.length;k++){const i=islands[k].center;protectedCells.add(i);domains[i]=k;costs[i]=0;signed[i]=2;}
  finalizeSeaQuota(signed,r,protectedCells,domains,target);
  // Round narrow coastal appendages, then regrow the exact area from the
  // same three cores. Opening is bounded and respects the physical grid;
  // every regrowth still proves connected sea and separated islands.
  if(side>=80&&landPercent>=60)for(let pass=0;pass<3;pass++){
   const radius=Math.max(2,Math.round(side*.047)),distance=new Int32Array(n).fill(n),queue=[];
   for(let i=0;i<n;i++)if(signed[i]<=0){distance[i]=0;queue.push(i);}
   for(let at=0;at<queue.length;at++)for(const j of gridNeighbors(queue[at],w,h,r.topology))if(distance[j]>distance[queue[at]]+1){distance[j]=distance[queue[at]]+1;queue.push(j);}
   const fromCore=new Int32Array(n).fill(n),front=[],totals=new Int32Array(3),lost=new Int32Array(3),cores=new Int32Array(3);
   for(let i=0;i<n;i++)if(signed[i]>0){totals[domains[i]]++;if(distance[i]>radius){fromCore[i]=0;front.push(i);cores[domains[i]]++;}}
   for(let at=0;at<front.length;at++){const i=front[at];if(fromCore[i]>=radius)continue;for(const j of gridNeighbors(i,w,h,r.topology))if(signed[j]>0&&domains[j]===domains[i]&&fromCore[j]>fromCore[i]+1){fromCore[j]=fromCore[i]+1;front.push(j);}}
   for(let i=0;i<n;i++)if(signed[i]>0&&fromCore[i]>radius)lost[domains[i]]++;
   const round=Array.from(totals,(total,k)=>cores[k]>0&&lost[k]>.04*total);if(!round.some(Boolean))break;
   for(let i=0;i<n;i++)if(signed[i]>0&&fromCore[i]>radius&&round[domains[i]]&&!protectedCells.has(i))domains[i]=-1;
   for(let i=0;i<n;i++)signed[i]=2-costs[i];
   finalizeSeaQuota(signed,r,protectedCells,domains,target);
  }
  let threshold=.001;for(let i=0;i<n;i++)if(signed[i]>0)threshold=Math.max(threshold,costs[i]);
  for(let i=0;i<n;i++){
   const distance=(threshold-costs[i])/threshold,chosen=signed[i]>0;
   signed[i]=chosen?Math.max(.001,distance):Math.min(-.001,distance);
   volcanoDistance[i]=Number.isFinite(costs[i])?costs[i]/threshold*.55:1;
  }
 }
 if(structure!=='islands')finalizeSeaQuota(signed,r,protectedCells,domains,target);
 const prepared={width:w,height:h,kind,structure,seed,signed,volcanoDistance};geometryCache.set(r,prepared);return prepared;
}
function prepareGeometry(r,seed){
 const cached=geometryCache.get(r),landPercent=r.landscape.landPercent??75,coastErosion=r.landscape.coastErosion??50;
 if(cached&&cached.width===r.width&&cached.height===r.height&&cached.kind===(r.topology?.kind??'square')&&cached.structure===r.landscape.structure&&cached.seed===seed&&cached.landPercent===landPercent&&cached.coastErosion===coastErosion)return cached;
 const prepared=geologicalGeometry(r,seed);prepared.landPercent=landPercent;prepared.coastErosion=coastErosion;return prepared;
}
function position(r,x,y){
 // Odd-r centers use their physical row offset. Domain normalization keeps
 // rectangular map edges meaningful in both square and hex workspaces.
 const offset=r.topology?.kind==='hex'?(y&1)*.5:0;
 return{u:2*(x+offset)/(r.width-1+(r.topology?.kind==='hex'?.5:0))-1,v:2*y/(r.height-1)-1};
}
function shape(r,x,y,seed){
 if(r.landscape.structure==='land'){const{u,v}=position(r,x,y);return{signed:1,volcanoDistance:Math.hypot(u,v)};}
 const prepared=prepareGeometry(r,seed),i=y*r.width+x;
 return{signed:prepared.signed[i],volcanoDistance:prepared.volcanoDistance[i]};
}

export function landscapeElevation(raw,r,x,y,seed=r.seed){
 const{signed,volcanoDistance}=shape(r,x,y,seed),value=clamp(raw);
 if(signed<=0)return rounded(clamp(.36+Math.max(-1,signed)*.19-.004));
 // The Surface noise keeps its amplitude. A biome selects environments on
 // this shared relief; it must not flatten all dry land into one plateau.
 const volcano=r.landscape.baseBiome==='volcanic'?.24*Math.exp(-((volcanoDistance/.38)**2))-.16*Math.exp(-((volcanoDistance/.1)**2)):0,
  target=.385+value+volcano;
 return rounded(clamp(.365+(target-.365)*smooth(signed/.3)));
}

export function landscapeClimate(r,x,y,elevation,seed=r.seed){
 const base=LANDSCAPE_BIOMES[r.landscape.baseBiome],scale=r.climate?.scale??36,temperature=base.temperature+
  (fractalNoise(seed^0x4819,x/scale,y/scale,{octaves:4})-.5)*1.7-Math.max(0,elevation-.65)*.6,
  humidity=base.humidity+(fractalNoise(seed^0x9271,x/scale,y/scale,{octaves:4})-.5)*1.9;
 return{temperature:rounded(clamp(temperature)),humidity:rounded(clamp(humidity))};
}

export function landscapeBiome(fields,index,r,id=r.landscape.baseBiome){
 const water=fields.waterType[index];if(water!=='none')return water==='sea'?'ocean':water==='river'?'river':'lake';
 const e=fields.elevation[index],slope=fields.slope[index];
 const temperature=fields.temperature?.[index]??LANDSCAPE_ADDITIONAL_BIOMES[id].temperature,humidity=fields.humidity?.[index]??LANDSCAPE_ADDITIONAL_BIOMES[id].humidity;
 if(slope>.17)return'cliffs';
 if(id==='mountains')return e>.84&&temperature<.4?'snow':e<.62?'foothills':'alpine';
 if(id==='forest')return'forest';
 if(id==='meadow')return'plains';
 if(id==='desert'&&temperature<.35)return'cold-desert';
 return LANDSCAPE_ADDITIONAL_BIOMES[id].biome;
}
