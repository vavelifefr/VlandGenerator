import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAtlasRequest} from '../engine/api/atlas-catalog.mjs';
import {atlasSeed} from '../engine/core/atlas-landforms.mjs';
import {landscapeElevation} from '../engine/core/landscape-profile.mjs';
import {coastCoreWidth} from '../tools/verify-coast-correction.mjs';

// The 80x64 regression alone missed repeated narrow capes on large maps.
// Keep the opening scale proportional, and use real provider-derived seeds.
for(const kind of ['square','hex'])for(const seed of [7,1,0,29])test(kind+' coast300 '+seed+' retains broad capes at a regional scale',()=>{
 const width=300,height=300,r=normalizeAtlasRequest({schema:'vland.atlas.request',schemaVersion:1,width,height,seed,topology:{kind},layers:{above:0,underground:0},landscape:{structure:'coast',baseBiome:'meadow',biomes:[]}}),derived=atlasSeed(r,'surface','relief'),mask=Uint8Array.from({length:width*height},(_,i)=>+(landscapeElevation(.35,r,i%width,Math.floor(i/width),derived)>.36)),loss=coastCoreWidth(mask,width,height,r.topology).primary.lostFraction;
 assert.ok(loss<=.04,'Thin cape loss '+(100*loss).toFixed(2)+'% exceeds4%');
});
