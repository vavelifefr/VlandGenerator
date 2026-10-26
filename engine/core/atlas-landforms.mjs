import {shapeElevation} from './atlas-shaping.mjs';
import {deriveBiomes} from './atlas-biomes.mjs';
import {deriveStageSeed} from './streams.mjs';
import {ATLAS_VERSION,ATLAS_BIOMES,ATLAS_ROCKS} from '../api/atlas-catalog.mjs';
import {clamp,rounded,fractalNoise,warpedNoise,gaussianBlur,thermalErosion,hash2,neighbors} from './atlas-math.mjs';
import {surfaceWater} from './atlas-water.mjs';
import {landscapeElevation,landscapeClimate,landscapeBiome} from './landscape-profile.mjs';
import {applyLandscapeRegions} from './landscape-regions.mjs';
import {landscapeFieldScale,landscapeUniformity} from './landscape-uniformity.mjs';
const noise=(seed,x,y,scale)=>fractalNoise(seed,x/scale,y/scale,{octaves:4});
export const atlasSeed=(r,region,stage)=>deriveStageSeed(r.seed,region,stage,ATLAS_VERSION);
const quantile=(array,q)=>[...array].sort((a,b)=>a-b)[Math.min(array.length-1,Math.max(0,Math.floor(q*array.length)))];
export function surfaceFields(r){
  const {width:w,height:h}=r,n=w*h,t=r.terrain,s=atlasSeed(r,'surface','relief'),humid=atlasSeed(r,'climate','rain'),temp=atlasSeed(r,'climate','temperature'),raw=[],distributionScale=r.landscape?landscapeFieldScale(r):1;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const gx=(x+r.origin.x)/(t.scale*distributionScale),gy=(y+r.origin.y)/(t.scale*distributionScale),
      continental=warpedNoise(s,gx*.48,gy*.48,t.warp,{octaves:t.octaves,persistence:t.persistence}),
      regional=warpedNoise(s^0x1298,gx*1.7,gy*1.7,t.warp,{octaves:4,ridged:r.preset==='highlands'}),
      detail=fractalNoise(s^0x921c,gx*4,gy*4,{octaves:3});
    const elevation=clamp(.5+((continental*.62+regional*.28+detail*.1)-.5)*(1.1+t.relief*1.5));raw.push(r.landscape?elevation:shapeElevation(elevation,r,gx,gy,s));
  }
  const blurred=gaussianBlur(raw,w,h,t.blur),eroded=thermalErosion(blurred,w,h,t.erosion,.045,r.topology),seaLevel=.36;
  // Passing all 90000 cells as function arguments overflows Chromium's
  // worker stack even though the same map succeeds on a larger Node stack.
  let minimum=Infinity,maximum=-Infinity;for(const value of eroded){minimum=Math.min(minimum,value);maximum=Math.max(maximum,value);}
  const shift=r.landscape?-minimum:t.water>0?seaLevel-quantile(eroded,t.water):seaLevel-minimum+.02,
    reliefScale=r.landscape?.58/Math.max(.58,maximum+shift):1;
  const fields={elevation:[],humidity:[],temperature:[],rainfall:[],erosion:[],slope:[],fertility:[],obstacle:new Array(n).fill(0),support:new Array(n).fill(1),biome:[],material:[],rock:[],hardness:[],vegetation:new Array(n).fill(''),resource:new Array(n).fill(''),resourceAmount:new Array(n).fill(0),deposit:new Array(n).fill(''),structure:new Array(n).fill(''),reserved:new Array(n).fill(0)};
  for(let i=0;i<n;i++){
    const x=i%w+r.origin.x,y=Math.floor(i/w)+r.origin.y;
    // The explicit profile owns the final sea geometry. Quantile shifting or
    // terracing after this step would erase the chosen island/coast boundaries.
    let elevation=r.landscape?landscapeElevation((eroded[i]+shift)*reliefScale,r,i%w,Math.floor(i/w),s):clamp(eroded[i]+shift);if(!r.landscape&&t.terraces>0)elevation=Math.round(elevation*t.terraces)/t.terraces;
    fields.elevation.push(rounded(elevation));fields.erosion.push(rounded(Math.abs(blurred[i]-eroded[i])));
    if(r.landscape){const climate=landscapeClimate(r,x/distributionScale,y/distributionScale,elevation,temp);fields.temperature.push(climate.temperature);fields.humidity.push(climate.humidity);}
    else{fields.temperature.push(rounded(clamp(r.climate.temperature+(noise(temp,x,y,r.climate.scale)-.5)*1.7-Math.max(0,elevation-.65)*.6-r.climate.latitude*.3-Math.tanh(y/400)*.08)));
    fields.humidity.push(rounded(clamp(r.climate.moisture+(noise(humid,x,y,r.climate.scale)-.5)*1.9)));}
  }
  // Orographic rain and leeward drying. The wind axis is explicit in the request.
  const horizontal=['west','east'].includes(r.climate.wind),reverse=['east','south'].includes(r.climate.wind),outer=horizontal?h:w,inner=horizontal?w:h;
  for(let a=0;a<outer;a++){let airborne=r.climate.moisture,previous=seaLevel;for(let b=0;b<inner;b++){const c=reverse?inner-1-b:b,i=horizontal?a*w+c:c*w+a,e=fields.elevation[i],rise=e-previous;if(e<seaLevel)airborne=clamp(airborne+.12);else airborne=clamp(airborne-rise*.7-.002);fields.rainfall[i]=rounded(clamp(fields.humidity[i]*.5+airborne*.5+Math.max(0,rise)*1.6,.05,1));fields.humidity[i]=rounded(clamp(fields.humidity[i]*.65+fields.rainfall[i]*.35));previous=e;}}
  const water=surfaceWater(fields,w,h,seaLevel,r.hydrology,r.topology,!!r.landscape,r.landscape?landscapeUniformity(r):50);Object.assign(fields,water);delete fields.riverThreshold;
  const regions=r.landscape?applyLandscapeRegions(fields,r,s):null;
  for(let i=0;i<n;i++){
    fields.slope[i]=rounded(Math.max(0,...neighbors(i,w,h,r.topology).map(j=>Math.abs(fields.elevation[i]-fields.elevation[j]))));
    const e=fields.elevation[i],temp=fields.temperature[i],wet=fields.humidity[i],type=fields.waterType[i];let b;
    if(r.landscape)b=landscapeBiome(fields,i,r,regions[i]);
    else if(type!=='none')b=type==='sea'?'ocean':type==='river'?'river':'lake';
    else if(e<seaLevel+.025&&neighbors(i,w,h,r.topology).some(j=>fields.waterType[j]!=='none'))b='coast';else if(fields.slope[i]>.12||e>.87)b='cliffs';
    else if(e>.76)b=temp<.3?'snow':'alpine';else if(temp<.18)b='snow';else if(temp<.3)b=wet<.35?'cold-desert':'tundra';
    else if(wet<.28)b=temp>.48?'desert':'cold-desert';else if(r.preset==='volcanic'&&wet<.5)b='volcanic';
    else if(wet>.72&&e<seaLevel+.17)b='wetland';else if(wet>.64)b=temp>.67?'rainforest':temp<.43?'taiga':'forest';else if(temp>.66)b='savanna';else b='plains';
    fields.biome[i]=b;fields.material[i]=ATLAS_BIOMES[b].material;
    fields.fertility[i]=rounded(type==='none'?clamp(wet*.85+.12-fields.slope[i]*2-(temp<.25?.35:0)):0);
    fields.obstacle[i]=b==='cliffs'&&fields.slope[i]>.17?1:0;
  }
  deriveBiomes(fields,r,regions);return{fields,seaLevel,riverThreshold:water.riverThreshold};
}
export function rockFields(r,z){
  const w=r.width,h=r.height,seed=atlasSeed(r,'geology','provinces'),age=atlasSeed(r,'geology','strata'),depth=Math.max(0,-z/r.layers.depthStep),rocks=r.geology.rocks;
  const groups={sedimentary:rocks.filter(id=>ATLAS_ROCKS[id].group==='sedimentary'),igneous:rocks.filter(id=>ATLAS_ROCKS[id].group==='igneous'),metamorphic:rocks.filter(id=>ATLAS_ROCKS[id].group==='metamorphic')};
  return Array.from({length:w*h},(_,i)=>{
    const x=i%w+r.origin.x,y=Math.floor(i/w)+r.origin.y,s=r.geology.scale,province=noise(seed,x,y,s),stratum=Math.floor(depth+noise(age,x,y,s*1.8)*3);
    let group=r.preset==='volcanic'?'igneous':province>.62?'igneous':depth>=3?'metamorphic':'sedimentary';const ids=groups[group].length?groups[group]:rocks;
    return ids[(Math.floor(province*17)+stratum)%ids.length];
  });
}
function floorMaskRegions(mask,w,h,topology){const seen=new Uint8Array(mask.length),regions=[];for(let i=0;i<mask.length;i++)if(mask[i]&&!seen[i]){const q=[i];seen[i]=1;for(let k=0;k<q.length;k++)for(const j of neighbors(q[k],w,h,topology))if(mask[j]&&!seen[j]){seen[j]=1;q.push(j);}regions.push(q);}return regions.sort((a,b)=>b.length-a.length);}
function disc(mask,w,h,x,y,radius){for(let yy=Math.max(1,Math.floor(y-radius));yy<=Math.min(h-2,Math.ceil(y+radius));yy++)for(let xx=Math.max(1,Math.floor(x-radius));xx<=Math.min(w-2,Math.ceil(x+radius));xx++)if((xx-x)**2+(yy-y)**2<=radius**2)mask[yy*w+xx]=1;}
export function caveFields(r,depth,surface){
  const w=r.width,h=r.height,n=w*h,s=atlasSeed(r,'cave-'+depth,'geometry'),style=r.caves.style,values=[],mask=new Uint8Array(n);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)values.push(warpedNoise(s,(x+r.origin.x)/13,(y+r.origin.y)/13,.8,{octaves:3}));
  const threshold=quantile(values,r.caves.openness);
  for(let i=0;i<n;i++){const x=i%w,y=Math.floor(i/w),ridge=fractalNoise(s^0x876ab,(x+r.origin.x)/16,(y+r.origin.y)/16,{octaves:3}),fracture=Math.abs(Math.sin((x+y*.6)/5+(ridge-.5)*5));
    const chamber=values[i]<threshold,tunnel=Math.abs(ridge-.5)<.028+r.caves.openness*.035;
    mask[i]=x>0&&y>0&&x<w-1&&y<h-1&&(style==='karst'?chamber&&surface.humidity[i]>.25||tunnel&&ridge>.48:style==='chambers'?chamber:style==='tunnels'?tunnel:style==='lava-tubes'?Math.abs(ridge-.5)<.045+r.caves.openness*.06:style==='shafts'?Math.abs(Math.sin(x/7+(ridge-.5)))<.25||chamber&&y%17<6:style==='water-carved'?tunnel||chamber&&values[i]<threshold-.03:style==='fractured'?fracture<.18||chamber&&values[i]<threshold-.035:chamber||tunnel)?1:0;
  }
  for(let step=0;step<(style==='fractured'?0:r.caves.smoothing);step++){const next=mask.slice();for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){let count=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)count+=mask[(y+dy)*w+x+dx];next[y*w+x]=count>=5?1:0;}mask.set(next);}
  // Distinct halls remain among the noise network; no empty rectangular fallback.
  for(let k=0;k<Math.max(1,Math.round(n/1800));k++){const x=3+hash2(s,k,17)*(w-6),y=3+hash2(s,k,31)*(h-6);disc(mask,w,h,x,y,2.5+hash2(s,k,53)*3);}
  const regions=floorMaskRegions(mask,w,h,r.topology),major=regions.filter(c=>c.length>=9),joined=[];
  if(r.caves.connectivity>0&&major.length>1){const base=major[0],targetCount=Math.min(16,1+Math.round((major.length-1)*r.caves.connectivity*(.5+r.caves.branching)));for(const region of major.slice(1,targetCount)){
    const a=region[Math.floor(region.length/2)],ax=a%w,ay=Math.floor(a/w);let b=base[0],best=Infinity;for(const k of base){const d=(k%w-ax)**2+(Math.floor(k/w)-ay)**2;if(d<best){best=d;b=k;}}
    const bx=b%w,by=Math.floor(b/w),steps=Math.max(Math.abs(bx-ax),Math.abs(by-ay));for(let t=0;t<=steps;t++){const f=t/Math.max(1,steps),bend=Math.sin(f*Math.PI)*2;disc(mask,w,h,ax+(bx-ax)*f+bend,ay+(by-ay)*f-bend,r.caves.tunnelRadius);}joined.push([a,b]);}}
  const fields={...Object.fromEntries(['humidity','temperature','rainfall','fertility'].map(k=>[k,new Array(n)])),elevation:new Array(n).fill(.5),erosion:new Array(n).fill(0),slope:new Array(n).fill(0),obstacle:[],support:new Array(n).fill(1),biome:[],material:[],rock:rockFields(r,-depth*r.layers.depthStep),hardness:[],waterType:[],waterDepth:[],vegetation:new Array(n).fill(''),resource:new Array(n).fill(''),resourceAmount:new Array(n).fill(0),deposit:new Array(n).fill(''),structure:new Array(n).fill(''),reserved:new Array(n).fill(0)};
  const aquiferSeed=atlasSeed(r,'cave-'+depth,'aquifers');
  for(let i=0;i<n;i++){
    const x=i%w+r.origin.x,y=Math.floor(i/w)+r.origin.y,a=noise(aquiferSeed,x,y,11),heat=noise(s^0x81ac,x,y,17),humidity=clamp(surface.humidity[i]*.6+noise(s^0x7af1,x,y,14)*.4+depth*.015),temperature=clamp(surface.temperature[i]*.6+.18+depth*.035);
    fields.humidity[i]=rounded(humidity);fields.temperature[i]=rounded(temperature);fields.rainfall[i]=0;fields.fertility[i]=mask[i]?rounded(humidity*.35):0;
    fields.obstacle[i]=mask[i]?0:1;const water=mask[i]&&r.caves.aquifers>0&&a<.25+r.caves.aquifers*.16, lava=mask[i]&&depth>=r.caves.lavaDepth&&heat>.68;
    fields.waterType[i]=lava?'lava':water?'groundwater':'none';fields.waterDepth[i]=lava?.3:water?rounded(.055+(.25+r.caves.aquifers*.16-a)*2):0;
    let biome=!mask[i]?'cave-wall':lava?'magma-cave':water?'underground-lake':temperature<.3?'ice-cave':fields.rock[i]==='limestone'||style==='karst'?'karst-cave':heat>.63?'crystal-cave':humidity>.6?(depth>1?'fungal-cave':'lush-cave'):'dry-cave';
    fields.biome[i]=biome;fields.material[i]=!mask[i]?fields.rock[i]:ATLAS_BIOMES[biome].material;fields.hardness[i]=ATLAS_ROCKS[fields.rock[i]].hardness;
  }
  return{fields,joined};
}
export function highFields(r,height,surface){
  const n=r.width*r.height,fields=structuredClone(surface),seed=atlasSeed(r,'high-'+height,'canopy');
  for(const k of ['flowTo','flowRank','drainage','basin','filledElevation'])delete fields[k];
  for(let i=0;i<n;i++){
    const x=i%r.width+r.origin.x,y=Math.floor(i/r.width)+r.origin.y,woods=['forest','rainforest','taiga'].includes(surface.biome[i]),ledge=surface.elevation[i]>.65+height*.065,canopy=r.ecology.vegetation>0&&height===1&&woods&&noise(seed,x,y,9)>.43;
    fields.support[i]=ledge||canopy?1:0;fields.obstacle[i]=0;fields.elevation[i]=.5;fields.waterType[i]='none';fields.waterDepth[i]=0;fields.biome[i]=ledge?'high-ledge':canopy?'canopy':'void';fields.material[i]=ledge?surface.rock[i]??'granite':canopy?'timber':'air';fields.fertility[i]=0;fields.vegetation[i]='';fields.resource[i]='';fields.resourceAmount[i]=0;fields.deposit[i]='';fields.structure[i]='';fields.reserved[i]=0;if(fields.landform)fields.landform[i]=ledge?'ledge':canopy?'canopy':'void';if(fields.salinity)fields.salinity[i]=0;if(fields.floodRisk)fields.floodRisk[i]=0;if(fields.secondaryBiome)fields.secondaryBiome[i]='';if(fields.transitionStrength)fields.transitionStrength[i]=0;
  }
  return fields;
}
