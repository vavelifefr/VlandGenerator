import test from 'node:test';
import assert from 'node:assert/strict';
import {cellColor} from '../app/raster.mjs';
import {terrainLegendEntries} from '../app/display-colors.mjs';
import {ATLAS_BIOMES} from '../engine/api/atlas-catalog.mjs';
import {deriveBiomes} from '../engine/core/atlas-biomes.mjs';
import {LANDSCAPE_BIOMES} from '../engine/core/landscape-profile.mjs';
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
test('default meadow and forest families use exactly two greens, even with fertile ground and transition metadata',()=>{
 const greens=new Set();for(const id of ['plains','forest','taiga','rainforest'])for(const trait of ['normal','fertile'])for(const strength of [0,.1,.25,.49])for(const channel of ['material','biome']){
  const layer={material:['grass'],biome:[id],solid:[0],traits:[trait],sourceFields:{secondaryBiome:[id==='plains'?'forest':'plains'],transitionStrength:[strength]}};greens.add(cellColor(layer,0,channel).join(','));
 }
 assert.deepEqual([...greens].sort(),[rgb('#78955c').join(','),rgb('#466f49').join(',')].sort());
 const entries=terrainLegendEntries({material:['grass','grass','grass','grass'],biome:['plains','forest','taiga','rainforest']});assert.deepEqual(entries.map(x=>x.name),['Луга','Лес']);
});
test('dry biomes and geographic boundary bands have exact shared colors in the normal material view',()=>{
 for(const id of ['wetland','desert','alpine','snow','volcanic','beach','foothills','floodplain','savanna','tundra','badlands']){
  const layer={material:[ATLAS_BIOMES[id].material],biome:[id],solid:[0],traits:['fertile'],sourceFields:{secondaryBiome:['forest'],transitionStrength:[.4]}};
  assert.deepEqual(cellColor(layer,0,'material'),rgb(ATLAS_BIOMES[id].color),id+' is a discrete palette entry');
 }
});
test('secondary metadata never creates RGB gradients; explicit material and primary biome colors remain exact',()=>{
 const layer={material:['grass'],biome:['plains'],solid:[0],traits:['fertile'],sourceFields:{secondaryBiome:['forest'],transitionStrength:[.45]}};
 assert.deepEqual(cellColor(layer,0,'biome',{biome:{forest:'#ff00ff'}}),rgb(ATLAS_BIOMES.plains.color));
 assert.deepEqual(cellColor(layer,0,'material',{material:{grass:'#112233'}}),[17,34,51]);
 assert.deepEqual(cellColor(layer,0,'biome',{biome:{plains:'#abcdef'}}),[171,205,239]);
});
function boundary(a,b,kind){const w=32,h=32,n=w*h,regions=Array.from({length:n},(_,i)=>i%w<16?a:b),fields={elevation:new Array(n).fill(.6),slope:new Array(n).fill(.01),humidity:new Array(n).fill(.6),temperature:new Array(n).fill(.5),waterType:new Array(n).fill('none'),biome:regions.map(type=>LANDSCAPE_BIOMES[type].biome),material:regions.map(type=>ATLAS_BIOMES[LANDSCAPE_BIOMES[type].biome].material)},r={width:w,height:h,topology:{kind},landscape:{baseBiome:a},biomes:{transitionWidth:3,coastWidth:0,foothillWidth:0},hydrology:{floodplainWidth:0}};deriveBiomes(fields,r,regions);return{fields,regions};}
test('biome boundaries create named geographic bands while preserving the interiors on both grids',()=>{
 for(const kind of ['square','hex'])for(const [a,b,band]of [['mountains','meadow','foothills'],['desert','meadow','savanna'],['swamp','forest','floodplain'],['snow','forest','tundra'],['volcanic','meadow','badlands']]){
  const {fields,regions}=boundary(a,b,kind);assert.ok(fields.biome.includes(band),kind+' '+a+'/'+b+' '+band);
  for(const type of [a,b]){const cells=regions.flatMap((v,i)=>v===type?[i]:[]);assert.ok(cells.filter(i=>fields.biome[i]===LANDSCAPE_BIOMES[type].biome).length>=cells.length*.65,'transition cannot swallow '+type);}
 }
});

test('biome view preserves the shared forest family palette after a manual material change',()=>{
 const layer={material:['rock'],biome:['taiga'],solid:[0],traits:['normal']},palette={biome:{forest:'#abcdef'}};
 assert.deepEqual(cellColor(layer,0,'biome',palette),[171,205,239]);
 assert.equal(terrainLegendEntries(layer,'biome',palette)[0].color,'#abcdef');
 assert.notDeepEqual(cellColor(layer,0,'material',palette),[171,205,239],'manual rock keeps its own material color');
});
