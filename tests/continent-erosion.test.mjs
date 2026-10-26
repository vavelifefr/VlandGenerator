import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeLandscapeProfile,landscapeElevation} from '../engine/core/landscape-profile.mjs';
import {gridNeighbors} from '../engine/core/topology.mjs';
import {coastCoreWidth} from '../tools/verify-coast-correction.mjs';
import {coastlineMetrics} from '../tools/verify-coastlines.mjs';
import {normalizeAtlasRequest} from '../engine/api/atlas-catalog.mjs';
import {atlasSeed} from '../engine/core/atlas-landforms.mjs';
import {marineBayDepth,longestAxisShore} from '../tools/continent-shape-metrics.mjs';

const recipe=(kind,size,seed,coastErosion=50,landPercent=75)=>({width:size,height:size,seed,topology:{kind},landscape:{structure:'continent',baseBiome:'meadow',biomes:[],landPercent,uniformity:50,coastErosion}});
const mask=r=>Uint8Array.from({length:r.width*r.height},(_,i)=>+(landscapeElevation(.5,r,i%r.width,Math.floor(i/r.width))>.36));
function components(a,r){const seen=new Uint8Array(a.length),q=[];let parts=0;for(let i=0;i<a.length;i++)if(a[i]&&!seen[i]){parts++;q.length=0;q.push(i);seen[i]=1;for(let k=0;k<q.length;k++)for(const j of gridNeighbors(q[k],r.width,r.height,r.topology))if(a[j]&&!seen[j]){seen[j]=1;q.push(j);}}return parts;}
function metrics(a,r){let boundary=0,x0=r.width,y0=r.height,x1=0,y1=0;for(let i=0;i<a.length;i++)if(a[i]){const x=i%r.width,y=Math.floor(i/r.width);x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);for(const j of gridNeighbors(i,r.width,r.height,r.topology))boundary+=!a[j];}return{boundary,boxFill:a.reduce((s,v)=>s+v,0)/((x1-x0+1)*(y1-y0+1)),thinLoss:coastCoreWidth(a,r.width,r.height,r.topology).primary.lostFraction};}

test('coastErosion is an integer 0–100 canonical setting with default50',()=>{
 const p=normalizeLandscapeProfile({structure:'continent',baseBiome:'meadow'});assert.equal(p.coastErosion,50);
 for(const value of [0,50,100])assert.equal(normalizeLandscapeProfile({...p,coastErosion:value}).coastErosion,value);
 for(const value of [-1,101,.1,'50',null,NaN])assert.throws(()=>normalizeLandscapeProfile({...p,coastErosion:value}),/coastErosion|эрози/i);
});

test('maximum erosion carves deep coherent marine inlets rather than a softly warped potato',t=>{
 const failures=[],rows=[];
 for(const kind of ['square','hex'])for(const size of [100,300])for(const seed of [42,7,2026]){
  const request=normalizeAtlasRequest({...recipe(kind,size,seed,100),schema:'vland.atlas.request',schemaVersion:1,layers:{above:0,underground:0}}),derived=atlasSeed(request,'surface','relief');request.seed=derived;
  const high=mask(request),a=metrics(high,request),coarse=coastlineMetrics(high,{width:size,height:size,topology:request.topology}).scales[2];request.landscape.coastErosion=0;const zero=metrics(mask(request),request),ratio=a.boundary/zero.boundary;
  const depth=marineBayDepth(high,size,size,request.topology),straight=longestAxisShore(high,size,size),row={kind,size,seed,concavity:coarse.concavity,bays:coarse.regionalBays,deepBayFraction:coarse.deepBayFraction,seaPenetration:depth.fractionOfSide,straight:straight.fractionOfSide,ratio,thin:a.thinLoss};rows.push(row);
  if(coarse.concavity<.12||coarse.deepBayFraction<.02||depth.fractionOfSide<.1||straight.fractionOfSide>.2||ratio<1.45||a.thinLoss>.04)failures.push(row);
 }
 t.diagnostic(JSON.stringify(rows));assert.deepEqual(failures,[],'Erosion100 must have materially deep marine coves and >=1.45x coast, retaining wide land');
});

test('continent erosion increases coherent coastline detail without losing area or physical connectivity at100/300',t=>{
 const rows=[];
 for(const kind of ['square','hex'])for(const size of [100,300])for(const seed of [42,2026,870414469]){
  const samples=[];
  for(const erosion of [0,50,100]){const r=recipe(kind,size,seed,erosion),a=mask(r),m=metrics(a,r);assert.equal(a.reduce((s,v)=>s+v,0),Math.round(size*size*.75));assert.equal(components(a,r),1);assert.equal(components(Uint8Array.from(a,v=>1-v),r),1);assert.ok(a.every((v,i)=>!(i<size||i>=a.length-size||i%size===0||i%size===size-1)||!v));assert.ok(m.thinLoss<=.04,`${kind}/${size}/${seed}/${erosion}: thin loss ${m.thinLoss}`);if(erosion===0)assert.ok(m.boxFill>.94,`Rounded rectangle keeps a broad square body (${m.boxFill})`);samples.push(m);rows.push({kind,size,seed,erosion,...m});}
  assert.ok(samples[1].boundary>samples[0].boundary,`${kind}/${size}/${seed}:50 should have more coast than0`);
  assert.ok(samples[2].boundary>samples[1].boundary,`${kind}/${size}/${seed}:100 should have more coast than50`);
 }
 t.diagnostic(JSON.stringify(rows));
});

test('erosion affects sea structures and invalidates reused recipe geometry; cards and uniformity never change the sea mask',()=>{
 for(const kind of ['square','hex'])for(const size of [100,300]){
  const r=recipe(kind,size,42,0),a=mask(r);r.landscape.coastErosion=100;const b=mask(r);assert.notDeepEqual(a,b,'A mutated canonical recipe must not reuse cached erosion0');assert.deepEqual(b,mask({...r}));
  assert.deepEqual(b,mask({...r,landscape:{...r.landscape,uniformity:100,biomes:[{id:'f',type:'forest',percent:50}]}}));
  for(const structure of ['land'])assert.deepEqual(mask({...r,landscape:{...r.landscape,structure,coastErosion:0}}),mask({...r,landscape:{...r.landscape,structure,coastErosion:100}}));
  for(const landPercent of [25,90]){const c=recipe(kind,size,2026,100,landPercent),m=mask(c);assert.equal(m.reduce((s,v)=>s+v,0),Math.round(m.length*landPercent/100));assert.equal(components(m,c),1);assert.equal(components(Uint8Array.from(m,v=>1-v),c),1);}
 }
});
