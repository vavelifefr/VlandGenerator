import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAtlasRequest} from '../engine/api/atlas-catalog.mjs';
import {atlasSeed} from '../engine/core/atlas-landforms.mjs';
import {landscapeElevation} from '../engine/core/landscape-profile.mjs';
import {shoreReversals} from './helpers/coast-rhythm.mjs';

test('regional rhythm distinguishes a repetitive cape comb from one broad natural feature',()=>{
 const w=128,h=128,mask=fn=>Uint8Array.from({length:w*h},(_,i)=>+fn(i%w,Math.floor(i/w))),
  comb=mask((x,y)=>x<64+24*Math.cos(y*Math.PI*6/128)),cape=mask((x,y)=>x<58+25*Math.exp(-(((y-72)/30)**2)));
 assert.ok(shoreReversals(comb,w,h).turns>=4);assert.equal(shoreReversals(cape,w,h).turns,1);
});
for(const kind of ['square','hex'])for(const [size,seed]of [[100,3275713831],[128,7],[300,7],[300,1],[300,29]])test(kind+' coast'+size+' '+seed+' has rare regional features rather than a repeating zigzag',()=>{
 const r=normalizeAtlasRequest({schema:'vland.atlas.request',schemaVersion:1,width:size,height:size,seed,topology:{kind},layers:{above:0,underground:0},landscape:{structure:'coast',baseBiome:'meadow',biomes:[]}}),derived=atlasSeed(r,'surface','relief'),mask=Uint8Array.from({length:size*size},(_,i)=>+(landscapeElevation(.35,r,i%size,Math.floor(i/size),derived)>.36)),rhythm=shoreReversals(mask,size,size);
 assert.ok(rhythm.turns<=2,'Repeated regional reversals: '+rhythm.turns+' exceeds2');
});
