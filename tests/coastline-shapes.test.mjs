import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAtlasRequest} from '../engine/api/atlas-catalog.mjs';
import {atlasSeed} from '../engine/core/atlas-landforms.mjs';
import {landscapeElevation} from '../engine/core/landscape-profile.mjs';
import {coastlineMetrics} from '../tools/verify-coastlines.mjs';
import {shoreReversals} from './helpers/coast-rhythm.mjs';

function sample(kind,size,structure,seed,biomes=[],landPercent=75,coastErosion=50){
 const r=normalizeAtlasRequest({schema:'vland.atlas.request',schemaVersion:1,width:size,height:size,seed,topology:{kind},layers:{above:0,underground:0},landscape:{structure,baseBiome:'meadow',biomes,landPercent,uniformity:50,coastErosion}}),shapeSeed=atlasSeed(r,'surface','relief');
 const mask=Uint8Array.from({length:size*size},(_,i)=>+(landscapeElevation(.35,r,i%size,Math.floor(i/size),shapeSeed)>.36));
 return {r,mask,metrics:coastlineMetrics(mask,{width:size,height:size,topology:r.topology})};
}

for(const structure of ['coast','islands','continent'])test(structure==='coast'?'coast has sparse regional features without a repeated zigzag':structure==='islands'?'island erosion adds connected regional inlets beyond the smooth zero-erosion cores':'continent has regional inlets and peninsulas on both coarse scales instead of only smooth lobes',()=>{
 if(structure==='coast'){
  // Latest user correction rejects the prior mandatory sequence of bays.
  // More concavity/bays is not better: a few broad features must dominate.
  for(const kind of ['square','hex'])for(const size of [100,300])for(const seed of [7,42,2026]){
   const {mask}=sample(kind,size,structure,seed);assert.ok(shoreReversals(mask,size,size).turns<=2,'coast repeats dominant capes/inlets');
  }
  return;
 }
 if(structure==='islands'){
  // Smooth islands at0 are intentional. Compare requested maximum erosion
  // with that baseline; the former mandatory concavity at default50 belonged
  // to the superseded branching-island shape.
  const rows=[];for(const kind of ['square','hex'])for(const size of [100,300])for(const seed of [7,42,2026])rows.push({zero:sample(kind,size,structure,seed,[],25,0).metrics,high:sample(kind,size,structure,seed,[],25,100).metrics});
  for(const factor of [2,4]){
   const mean=(level,key)=>rows.reduce((sum,row)=>sum+row[level].scales[factor][key],0)/rows.length;
   assert.ok(mean('high','concavity')>mean('zero','concavity')+.03,'island erosion adds coarse-scale concavity at scale'+factor);
   assert.ok(mean('high','deepBayFraction')>mean('zero','deepBayFraction')+.01,'island erosion adds externally connected bays at scale'+factor);
  }
  return;
 }
 // Continent inlets are assessed at maximum requested erosion;0 intentionally has none.
 const rows=[];for(const kind of ['square','hex'])for(const size of [100,300])for(const seed of [7,42,2026])rows.push(sample(kind,size,structure,seed,[],structure==='islands'?25:45,structure==='continent'?100:50).metrics);
 for(const factor of [2,4]){
  const mean=key=>rows.reduce((sum,row)=>sum+row.scales[factor][key],0)/rows.length;
  assert.ok(mean('concavity')>=(structure==='islands'?.20:.18),structure+' regional concavity at scale'+factor+': '+mean('concavity'));
  if(structure!=='coast')assert.ok(mean('deepBayFraction')>=.06,structure+' externally connected deep bays at scale'+factor+': '+mean('deepBayFraction'));
 }
});

test('coastline construction keeps physical topology, fixed edges and biome-card stability at all requested sizes',()=>{
 for(const kind of ['square','hex'])for(const size of [50,100,200,300])for(const structure of ['coast','islands','continent']){
  const {mask,metrics}=sample(kind,size,structure,42),area=metrics.nativeLandCells/(size*size);assert.equal(metrics.nativeComponents,structure==='islands'?3:1);
  assert.equal(area,.75,'default sea structures keep exactly75% land');
  if(structure==='islands'){assert.ok(area>=.08,'islands retain usable total land');assert.ok(metrics.smallestComponent>=size*size*.01,'each island retains a usable core');}
  if(structure==='coast')assert.ok(area>=.3&&area<=.75,'coast retains usable land and sea');
  if(structure!=='coast')assert.ok(metrics.seaFrame);else{
   const edges=[Array.from(mask.subarray(0,size)),Array.from(mask.subarray(mask.length-size)),Array.from(mask).filter((_,i)=>i%size===0),Array.from(mask).filter((_,i)=>i%size===size-1)],land=edge=>edge.every(Boolean),sea=edge=>edge.every(v=>!v);
   assert.ok(land(edges[0])&&sea(edges[1])||sea(edges[0])&&land(edges[1])||land(edges[2])&&sea(edges[3])||sea(edges[2])&&land(edges[3]));
  }
  // Use an independent request so a cached geometry cannot hide an accidental
  // dependence on the biome cards.
  assert.deepEqual(sample(kind,size,structure,42,[{id:'trees',type:'forest',percent:40}]).mask,mask);
 }
});
