import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAtlasRequest} from '../engine/api/atlas-catalog.mjs';
import {atlasSeed} from '../engine/core/atlas-landforms.mjs';
import {landscapeElevation} from '../engine/core/landscape-profile.mjs';
import {gridNeighbors} from '../engine/core/topology.mjs';

// Opening at 4.7% of the short map side removes narrow artificial horns,
// while retaining broad capes. No golden mask or pixel-perimeter threshold.
export function narrowCapeLoss(mask,w,h,topology){
 let opened=mask.slice();const radius=Math.max(2,Math.round(Math.min(w,h)*.047));
 for(let n=0;n<radius;n++)opened=opened.map((v,i)=>v&&gridNeighbors(i,w,h,topology).every(j=>opened[j])?1:0);
 for(let n=0;n<radius;n++)opened=opened.map((v,i)=>mask[i]&&(v||gridNeighbors(i,w,h,topology).some(j=>opened[j]))?1:0);
 return mask.reduce((n,v,i)=>n+(v&&!opened[i]),0)/mask.reduce((n,v)=>n+v,0);
}
for(const kind of ['square','hex'])for(const seed of [870414469,4018650511,742339477,1501711120])test(kind+' coast '+seed+' retains broad capes rather than repeated thin horns',()=>{
 const w=80,h=64,r=normalizeAtlasRequest({schema:'vland.atlas.request',schemaVersion:1,width:w,height:h,seed,topology:{kind},layers:{above:0,underground:0},landscape:{structure:'coast',baseBiome:'meadow',biomes:[]}}),derived=atlasSeed(r,'surface','relief'),mask=Uint8Array.from({length:w*h},(_,i)=>+(landscapeElevation(.35,r,i%w,Math.floor(i/w),derived)>.36)),lost=narrowCapeLoss(mask,w,h,r.topology);
 assert.ok(lost<=.04,'narrow-cape land loss '+(lost*100).toFixed(2)+'% exceeds4%');
});
