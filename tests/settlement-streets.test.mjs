import test from 'node:test';
import assert from 'node:assert/strict';
import {generateSettlement,validateSettlement} from '../engine/api/settlements.mjs';
import {generateAtlas} from '../engine/api/atlas.mjs';

test('settlement streets preserve sea and cliffs, and label only river crossings as bridges',()=>{
 for(const seed of [7,42,713]){
  const city=generateSettlement({seed,width:48,height:40,terrain:{water:.35,relief:.9}}),layer=city.atlas.layers[0],original=generateAtlas(city.atlas.request).layers[0];
  assert.ok(validateSettlement(city).ok);
  for(let i=0;i<layer.fields.road.length;i++)if(layer.fields.road[i]){
   assert.notEqual(original.fields.biome[i],'cliffs','Street through original cliff '+seed+':'+i);
   assert.equal(original.fields.obstacle[i],0,'Street through original rock '+seed+':'+i);
   if(original.fields.waterType[i]==='sea')assert.equal(layer.fields.road[i],'pier','Sea street must be a short pier');
   else if(original.fields.waterType[i]!=='none')assert.equal(original.fields.waterType[i],'river','No lake bridges');
   if(layer.fields.road[i]==='bridge')assert.equal(layer.fields.waterType[i],'river');
  }
 }
});
test('street metadata follows the actual cell path instead of a segment across blocked terrain',()=>{
 const city=generateSettlement({seed:42,width:48,height:40,pattern:'organic',terrain:{water:.3,relief:.8}});
 for(const street of city.streets){assert.ok(street.path?.length>=2,'Street must expose its actual path');assert.deepEqual(street.from,street.path[0]);assert.deepEqual(street.to,street.path.at(-1));for(let i=1;i<street.path.length;i++)assert.equal(Math.abs(street.path[i].x-street.path[i-1].x)+Math.abs(street.path[i].y-street.path[i-1].y),1);}
});

test('settlement validation rejects forged street geometry even with a fresh checksum',async()=>{
 const {fingerprint}=await import('../engine/api/identity.mjs'),city=generateSettlement({seed:71,width:48,height:40});
 for(const mutate of [s=>s.path[1]={x:0,y:0},s=>s.width=5,s=>s.rank='unknown',s=>s.to={x:0,y:0}]){const copy=structuredClone(city);mutate(copy.streets[0]);copy.fingerprint=fingerprint({...copy,fingerprint:undefined});assert.equal(validateSettlement(copy).ok,false);}
});

test('the full documented settlement size range uses its single physical layer budget',()=>{
 for(const size of [32,160])assert.ok(validateSettlement(generateSettlement({width:size,height:size,buildingDensity:0,pattern:'ribbon'})).ok);
 assert.throws(()=>generateSettlement({width:301,height:300}));
});
