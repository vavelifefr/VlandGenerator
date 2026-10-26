import test from 'node:test';
import assert from 'node:assert/strict';
import {landscapeElevation} from '../engine/core/landscape-profile.mjs';
import {gridNeighbors} from '../engine/core/topology.mjs';
import {coastCoreWidth} from '../tools/verify-coast-correction.mjs';
import {shoreReversals} from './helpers/coast-rhythm.mjs';

const request=(structure,kind,size,seed,erosion)=>({width:size,height:size,seed,topology:{kind},landscape:{structure,baseBiome:'meadow',biomes:[],landPercent:75,uniformity:50,coastErosion:erosion}});
const mask=r=>Uint8Array.from({length:r.width*r.height},(_,i)=>+(landscapeElevation(.5,r,i%r.width,Math.floor(i/r.width))>.36));
function metrics(a,r){const seen=new Uint8Array(a.length),components=[0,0];let boundary=0;for(let i=0;i<a.length;i++){if(a[i])for(const j of gridNeighbors(i,r.width,r.height,r.topology))boundary+=!a[j];if(seen[i])continue;components[a[i]]++;const q=[i];seen[i]=1;for(let k=0;k<q.length;k++)for(const j of gridNeighbors(q[k],r.width,r.height,r.topology))if(!seen[j]&&a[j]===a[i]){seen[j]=1;q.push(j);}}return{boundary,land:components[1],sea:components[0],thin:coastCoreWidth(a,r.width,r.height,r.topology).primary.lostFraction};}

test('coast and islands erosion progressively changes coherent shores at100/300 without fingers, losing quota or cores',t=>{
 const rows=[],failures=[];
 for(const structure of ['coast','islands'])for(const kind of ['square','hex'])for(const size of [100,300])for(const seed of [42,7,870414469,4018650511]){
  const samples=[],masks=[];
  for(const erosion of [0,50,100]){
   const r=request(structure,kind,size,seed,erosion),a=mask(r),m=metrics(a,r);
   assert.equal(a.reduce((s,v)=>s+v,0),Math.round(a.length*.75));assert.equal(m.land,structure==='islands'?3:1);assert.equal(m.sea,1);assert.ok(m.thin<=.04,`${structure}/${kind}/${size}/${seed}/${erosion}: thin ${m.thin}`);
   if(structure==='islands')assert.ok(a.every((v,i)=>!(i<size||i>=a.length-size||i%size===0||i%size===size-1)||!v));
   else assert.ok(shoreReversals(a,size,size).turns<=2,'No repetitive substantial alternating bays/capes');
   samples.push(m);masks.push(a);rows.push({structure,kind,size,seed,erosion,...m});
  }
  assert.notDeepEqual(masks[1],masks[0]);
  assert.notDeepEqual(masks[2],masks[1]);
 }
 for(const structure of ['coast','islands'])for(const kind of ['square','hex'])for(const size of [100,300]){const totals=[0,50,100].map(erosion=>rows.filter(r=>r.structure===structure&&r.kind===kind&&r.size===size&&r.erosion===erosion).reduce((sum,r)=>sum+r.boundary,0));if(!(totals[0]<totals[1]&&totals[1]<totals[2]))failures.push({structure,kind,size,totals});}t.diagnostic(JSON.stringify(rows));assert.deepEqual(failures,[]);
});

test('sea erosion respects mutated recipe cache, repeatability and independence from cards/uniformity',()=>{
 for(const structure of ['coast','islands'])for(const kind of ['square','hex'])for(const size of [100,300]){
  const r=request(structure,kind,size,42,0),a=mask(r);r.landscape.coastErosion=100;const b=mask(r);assert.notDeepEqual(a,b);assert.deepEqual(b,mask({...r}));
  assert.deepEqual(b,mask({...r,landscape:{...r.landscape,uniformity:100,biomes:[{id:'forest',type:'forest',percent:50}]}}));
 }
});
