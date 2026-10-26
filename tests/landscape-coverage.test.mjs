import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeLandscapeProfile,landscapeElevation} from '../engine/core/landscape-profile.mjs';
import {gridNeighbors} from '../engine/core/topology.mjs';
import {surfaceWater} from '../engine/core/atlas-water.mjs';

const profile=(structure,landPercent=75)=>({structure,baseBiome:'meadow',biomes:[],landPercent,uniformity:50,coastErosion:50});
function mask(r){return Uint8Array.from({length:r.width*r.height},(_,i)=>+(landscapeElevation(.5,r,i%r.width,Math.floor(i/r.width))>.36));}
function components(mask,r){const seen=new Uint8Array(mask.length),sizes=[];for(let i=0;i<mask.length;i++)if(mask[i]&&!seen[i]){const q=[i];seen[i]=1;for(let k=0;k<q.length;k++)for(const j of gridNeighbors(q[k],r.width,r.height,r.topology))if(mask[j]&&!seen[j]){seen[j]=1;q.push(j);}sizes.push(q.length);}return sizes;}

test('coverage controls normalize canonically and reject noninteger or out-of-range inputs',()=>{
 assert.deepEqual(normalizeLandscapeProfile({structure:'coast',baseBiome:'meadow'}),profile('coast'));
 for(const key of ['landPercent','uniformity'])for(const value of [-1,101,.5,'75',null,NaN])assert.throws(()=>normalizeLandscapeProfile({...profile('coast'),[key]:value}));
 assert.throws(()=>normalizeLandscapeProfile({...profile('coast'),landPercent:0}));
 assert.throws(()=>normalizeLandscapeProfile({...profile('coast'),landPercent:100}));
 assert.equal(normalizeLandscapeProfile({...profile('land'),uniformity:0}).uniformity,0);
 assert.equal(normalizeLandscapeProfile({...profile('land'),uniformity:100}).uniformity,100);
});

test('sea structures meet exact cell quotas and preserve their physical landmasses on both grids',t=>{
 const rows=[];
 for(const kind of ['square','hex'])for(const size of [50,128,300])for(const structure of ['coast','islands','continent'])for(const landPercent of [25,50,75]){
  const r={width:size,height:size,seed:870414469,topology:{kind},landscape:profile(structure,landPercent)},a=mask(r),count=a.reduce((s,v)=>s+v,0),parts=components(a,r);
  assert.equal(count,Math.round(a.length*landPercent/100),`${kind}/${size}/${structure}/${landPercent}`);
  assert.equal(parts.length,structure==='islands'?3:1);assert.ok(parts.every(v=>v>=3));
  assert.equal(components(Uint8Array.from(a,v=>1-v),r).length,1,'the sea complement stays connected; no hidden sea cell becomes an inland lake');
  if(structure!=='coast')assert.ok(a.every((v,i)=>!(i<size||i>=a.length-size||i%size===0||i%size===size-1)||!v));
  rows.push({kind,size,structure,landPercent,count});
 }
 t.diagnostic(`${rows.length} exact coverage/connectivity cases`);
});

test('high-resolution island bays cannot trap sea cells and silently increase the actual land percentage',()=>{
 for(const kind of ['square','hex']){
  const r={width:300,height:300,seed:4018650511,topology:{kind},landscape:profile('islands')},a=mask(r);
  assert.equal(components(Uint8Array.from(a,v=>1-v),r).length,1);
  assert.equal(a.reduce((s,v)=>s+v,0),67500);assert.equal(components(a,r).length,3);
 }
});

test('user seed regressions preserve the requested observable ocean area after freshwater routing',()=>{
 for(const kind of ['square','hex'])for(const seed of [870414469,4018650511,742339477,1501711120])for(const structure of ['coast','islands','continent']){
  const r={width:80,height:64,seed,topology:{kind},landscape:profile(structure)},n=r.width*r.height,
   elevation=Array.from({length:n},(_,i)=>landscapeElevation(.3+.2*Math.sin(i*.07)**2,r,i%r.width,Math.floor(i/r.width))),
   water=surfaceWater({elevation,rainfall:Array(n).fill(1)},r.width,r.height,.36,{rivers:.5,lakes:.5,minLakeArea:2,riverWidth:1},r.topology,true);
  assert.equal(water.waterType.filter(v=>v!=='sea').length,Math.round(n*.75));
 }
});

test('coverage is immutable, deterministic and independent of cards and uniformity; land stays all land',()=>{
 for(const kind of ['square','hex'])for(const structure of ['coast','islands','continent','land']){
  const r={width:128,height:128,seed:4018650511,topology:{kind},landscape:profile(structure)},before=structuredClone(r),a=mask(r);
  assert.deepEqual(r,before);assert.deepEqual(a,mask({...r}));
  assert.deepEqual(a,mask({...r,landscape:{...r.landscape,uniformity:100,biomes:[{id:'f',type:'forest',percent:50}]}}));
  if(structure==='land')assert.ok(a.every(Boolean));
 }
});

test('impossible coverage rejects explicitly instead of clamping the requested sea fraction',()=>{
 for(const structure of ['continent','islands'])assert.throws(()=>mask({width:16,height:16,seed:42,topology:{kind:'square'},landscape:profile(structure,99)}),/дол|суш|мест|квот/i);
});
