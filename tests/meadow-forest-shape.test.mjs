import test from 'node:test';
import assert from 'node:assert/strict';
import {applyLandscapeRegions} from '../engine/core/landscape-regions.mjs';
import {gridNeighbors} from '../engine/core/topology.mjs';

function region(type,kind,size,seed,base='mountains',percent=35,id='territory'){
 const n=size*size,r={seed,width:size,height:size,topology:{kind},landscape:{structure:'land',baseBiome:base,uniformity:50,biomes:[{id,type,percent}]}},fields={elevation:new Array(n).fill(.55),humidity:new Array(n).fill(.6),temperature:new Array(n).fill(.55),slope:new Array(n).fill(.01),waterType:new Array(n).fill('none')};
 return {r,fields,labels:applyLandscapeRegions(fields,r,seed)};
}
function shape(labels,type,r){
 let area=0,boundary=0,core=0;const seen=new Uint8Array(labels.length),groups=[];
 for(let i=0;i<labels.length;i++)if(labels[i]===type){area++;const neighbors=gridNeighbors(i,r.width,r.height,r.topology);boundary+=neighbors.filter(j=>labels[j]!==type).length;if(neighbors.every(j=>labels[j]===type))core++;if(!seen[i]){const q=[i];seen[i]=1;for(let k=0;k<q.length;k++)for(const j of gridNeighbors(q[k],r.width,r.height,r.topology))if(labels[j]===type&&!seen[j]){seen[j]=1;q.push(j);}groups.push(q.length);}}
 groups.sort((a,b)=>b-a);return {area,boundary,core,groups};
}
test('forest edges are more irregular than equally sized open meadows on both grids',t=>{
 for(const kind of ['square','hex'])for(const size of [50,128,300]){
  const rows=[7,42,2026].map(seed=>{const meadow=region('meadow',kind,size,seed),forest=region('forest',kind,size,seed),a=shape(meadow.labels,'meadow',meadow.r),b=shape(forest.labels,'forest',forest.r);assert.equal(a.area,Math.round(size*size*.35));assert.equal(b.area,a.area);assert.ok(a.core/a.area>.65,'meadows retain open interiors');assert.ok(b.groups.slice(0,8).reduce((sum,x)=>sum+x,0)>b.area*.8,'forests remain substantial territories');return {meadow:a.boundary,forest:b.boundary};});
  const meadow=rows.reduce((sum,x)=>sum+x.meadow,0),forest=rows.reduce((sum,x)=>sum+x.forest,0);t.diagnostic(JSON.stringify({kind,size,meadow,forest}));assert.ok(forest>meadow*1.2,kind+'/'+size+' forest fringes differ from smooth meadow contours');
 }
});
test('dominant forests also use their edge formula and repeated meadow IDs still affect clearings',()=>{
 for(const kind of ['square','hex']){
  const a=region('meadow',kind,128,42,'forest',30,'clearing-one'),b=region('meadow',kind,128,42,'forest',30,'clearing-two');
  assert.equal(a.labels.filter(x=>x==='meadow').length,Math.round(128*128*.3));assert.notDeepEqual(a.labels,b.labels,'chosen meadow cards retain stable spatial influences');assert.deepEqual(a.labels,region('meadow',kind,128,42,'forest',30,'clearing-one').labels);
 }
});
