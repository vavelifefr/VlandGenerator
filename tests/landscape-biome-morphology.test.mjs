import test from 'node:test';
import assert from 'node:assert/strict';
import {applyLandscapeRegions} from '../engine/core/landscape-regions.mjs';
import {gridNeighbors} from '../engine/core/topology.mjs';

const types=['swamp','desert','mountains','snow','volcanic'];
function fixture(type,size,kind,seed,main=false){
 const n=size*size,r={width:size,height:size,seed,topology:{kind},landscape:{structure:'land',baseBiome:main?type:'meadow',uniformity:50,biomes:[{id:'selected-'+type,type:main?'meadow':type,percent:main?70:type==='mountains'?10:20}]}},f={elevation:[],humidity:[],temperature:[],slope:[],waterType:[],drainage:[]},feature=new Uint8Array(n);
 for(let i=0;i<n;i++){
  const x=(i%size)/(size-1),y=Math.floor(i/size)/(size-1);let e=.58,wet=.55,temp=.6,slope=.01,water='none',drain=1,hit=false;
  if(type==='swamp'){
   const branch=.5+(y<.5?(y-.5)*.65:0),other=.5-(y<.5?(y-.5)*.65:0),d=Math.min(Math.abs(x-branch),Math.abs(x-other));
   e=x<.27?.42:.46;wet=x<.27?.65:.85;hit=d<.065;
   if(d<.6/size){water='river';drain=30+(y*60);}else if(d<.07)drain=10;
  }else if(type==='desert'){
   hit=x>.06&&x<.4&&y>.08&&y<.92;wet=hit?.28:(x*26%1<.2?.12:.65);temp=.75;
  }else if(type==='mountains'){
   const ridgeX=.65+Math.sin(y*3)*.055,d=Math.abs(x-ridgeX);hit=d<.055&&y>.06&&y<.94;
   e=x<.3&&y>.1&&y<.9?.88:.5+.33*Math.exp(-((d/.05)**2));wet=.45;
  }else if(type==='snow'){
   e=.4+.48*y;temp=.65-.58*y;hit=y>.78;wet=.5;
  }else if(type==='volcanic'){
   e=.69+.015*Math.sin(x*6)*Math.sin(y*5);wet=.25;hit=x>.52;slope=hit?.14:.01;
  }
  f.elevation.push(e);f.humidity.push(wet);f.temperature.push(temp);f.slope.push(slope);f.waterType.push(water);f.drainage.push(drain);feature[i]=+hit;
 }
 return{r,f,feature};
}
function fraction(labels,type,feature,f){let hit=0,total=0;for(let i=0;i<labels.length;i++)if(labels[i]===type&&f.waterType[i]==='none'){total++;hit+=feature[i];}return hit/total;}
function shape(labels,type,r,f){const seen=new Uint8Array(labels.length),groups=[];let area=0,core=0;for(let i=0;i<labels.length;i++)if(labels[i]===type&&f.waterType[i]==='none'){area++;if(gridNeighbors(i,r.width,r.height,r.topology).filter(j=>f.waterType[j]==='none').every(j=>labels[j]===type))core++;if(!seen[i]){const q=[i];seen[i]=1;for(let at=0;at<q.length;at++)for(const j of gridNeighbors(q[at],r.width,r.height,r.topology))if(!seen[j]&&labels[j]===type&&f.waterType[j]==='none'){seen[j]=1;q.push(j);}groups.push(q.length);}}return{area,coreFraction:core/area,substantialFraction:groups.filter(n=>n>=Math.max(4,area*.01)).reduce((s,n)=>s+n,0)/area};}

for(const type of ['swamp','desert','mountains','volcanic'])test(type+' selects its characteristic geography rather than generic noisy patches',t=>{
 for(const kind of ['square','hex'])for(const size of [50,128,300]){
  const values=[];
  for(const seed of [7,42,2026]){const {r,f,feature}=fixture(type,size,kind,seed),labels=applyLandscapeRegions(f,r,seed);values.push(fraction(labels,type,feature,f));}
  const mean=values.reduce((s,n)=>s+n,0)/values.length,minimum={swamp:.45,desert:.82,mountains:.43,volcanic:.85}[type];
  t.diagnostic(JSON.stringify({type,kind,size,featureFraction:mean}));assert.ok(mean>=minimum,type+' '+kind+'/'+size+' characteristic region '+mean+' >= '+minimum);
 }
});

test('snow receives the cold high caps before mountain foothills while both exact quotas survive',()=>{
 for(const kind of ['square','hex'])for(const size of [50,128,300])for(const seed of [7,42]){
  const {r,f,feature}=fixture('snow',size,kind,seed);r.landscape.biomes=[{id:'ranges',type:'mountains',percent:30},{id:'caps',type:'snow',percent:15}];const labels=applyLandscapeRegions(f,r,seed),n=size*size;
  assert.ok(fraction(labels,'snow',feature,f)>.9,'cold snowy caps retained');assert.ok(Math.abs(labels.filter(t=>t==='snow').length-n*.15)<=1);assert.ok(Math.abs(labels.filter(t=>t==='mountains').length-n*.3)<=1);
 }
});

test('all five territories retain area, substantial interiors, determinism and immutable terrain on both grids',()=>{
 for(const type of types)for(const kind of ['square','hex'])for(const size of [50,128,300])for(const main of [false,true]){
  const {r,f}=fixture(type,size,kind,71,main),before=structuredClone(f),labels=applyLandscapeRegions(f,r,71),dry=f.waterType.filter(t=>t==='none').length,requested=main?.3:type==='mountains'?.1:.2,metrics=shape(labels,type,r,f);
  assert.ok(Math.abs(metrics.area-dry*requested)<=1,type+' exact area');assert.ok(metrics.substantialFraction>.95,type+' substantial territories');assert.ok(metrics.coreFraction>.35,type+' real interiors');assert.ok(labels.every(t=>[type,'meadow'].includes(t)),'no automatic extra choices');
  const again=fixture(type,size,kind,71,main);assert.deepEqual(applyLandscapeRegions(again.f,again.r,71),labels);
  for(const key of ['elevation','slope','waterType','drainage'])assert.deepEqual(f[key],before[key],key+' immutable');
 }
});
