import test from 'node:test';
import assert from 'node:assert/strict';
import {generateAtlas,validateAtlas} from '../engine/api/atlas.mjs';
import {normalizeAtlasRequest} from '../engine/api/atlas-catalog.mjs';
import {surfaceFields} from '../engine/core/atlas-landforms.mjs';
import {LANDSCAPE_BIOMES,LANDSCAPE_STRUCTURES} from '../engine/core/landscape-profile.mjs';
import {gridNeighbors} from '../engine/core/topology.mjs';

const biomeFamily={meadow:['plains','tundra','savanna'],forest:['forest','taiga','rainforest'],swamp:['wetland'],desert:['desert','cold-desert'],snow:['snow','tundra'],mountains:['alpine','foothills','snow'],volcanic:['volcanic']};
const base={schema:'vland.atlas.request',schemaVersion:1,seed:71,width:32,height:32,layers:{above:0,underground:0},resources:{frequency:0,starter:false},ecology:{vegetation:0},structures:{density:0},events:{density:0,spawners:0}};
const request=(structure='land',baseBiome='meadow',kind='square',size=32,seed=42)=>({...structuredClone(base),seed,width:size,height:size,topology:{kind},landscape:{structure,baseBiome,landPercent:structure==='islands'?25:75,uniformity:50}});
const edge=(a,r)=>a.filter((_,i)=>i<r.width||i>=a.length-r.width||i%r.width===0||i%r.width===r.width-1);
function landComponents(a,r){const seen=new Uint8Array(a.length),groups=[];for(let i=0;i<a.length;i++)if(a[i]>.36&&!seen[i]){const q=[i];seen[i]=1;for(let k=0;k<q.length;k++)for(const j of gridNeighbors(q[k],r.width,r.height,r.topology))if(a[j]>.36&&!seen[j]){seen[j]=1;q.push(j);}groups.push(q);}return groups;}

test('native landscape normalization is strict, canonical before preset merge, immutable and idempotent',()=>{
 for(const [baseBiome,preset]of [['meadow','temperate'],['forest','temperate'],['swamp','temperate'],['desert','desert'],['snow','frozen'],['mountains','highlands'],['volcanic','volcanic']]){
  const input={...request('land',baseBiome),preset:'archipelago',climate:{temperature:0,moisture:0}},before=structuredClone(input),r=normalizeAtlasRequest(input);
  assert.equal(r.preset,preset);assert.equal(r.climate.temperature,LANDSCAPE_BIOMES[baseBiome].temperature);assert.equal(r.climate.moisture,LANDSCAPE_BIOMES[baseBiome].humidity);assert.deepEqual(normalizeAtlasRequest(r),r);assert.deepEqual(input,before);
  if(baseBiome==='volcanic')assert.equal(r.caves.lavaDepth,1);if(baseBiome==='mountains')assert.equal(r.terrain.terraces,6);
 }
 for(const landscape of [null,{},[],{structure:'land'},{structure:'random',baseBiome:'forest'},{structure:'land',baseBiome:'forest',extra:1}])assert.throws(()=>normalizeAtlasRequest({...base,landscape}));
 for(const extra of [{climate:{temperature:'hot'}},{climate:{moisture:2}},{terrain:{water:'none'}},{terrain:{terraces:-1}},{landforms:{pattern:'unknown'}},{preset:['temperate']},{preset:null}])assert.throws(()=>normalizeAtlasRequest({...request(),...extra}));
});

test('all 28 landscape choices keep underlying sea geometry, base identity and valid hydrology on small square and hex surfaces',()=>{
 for(const kind of ['square','hex'])for(const size of [16,32])for(const seed of [7,42])for(const structure of Object.keys(LANDSCAPE_STRUCTURES))for(const baseBiome of Object.keys(LANDSCAPE_BIOMES)){
  const r=normalizeAtlasRequest({...request(structure,baseBiome,kind,size,seed),biomes:{coastWidth:8,foothillWidth:8},hydrology:{floodplainWidth:8}}),{fields:f}=surfaceFields(r),label=[kind,size,seed,structure,baseBiome].join('/'),groups=landComponents(f.elevation,r);
  if(structure==='land')assert.ok(f.elevation.every(v=>v>.36),label+' no sea base');
  if(['islands','continent'].includes(structure)){assert.ok(edge(f.elevation,r).every(v=>v<.36),label+' sea frame');assert.ok(edge(f.waterType,r).every(v=>v==='sea'),label+' sea hydrology');}
  if(structure==='islands')assert.equal(groups.length,3,label+' three land cores');if(structure==='continent')assert.equal(groups.length,1,label+' single large core');
  const family=biomeFamily[baseBiome],dry=f.waterType.flatMap((v,i)=>v==='none'?[i]:[]);assert.ok(dry.length,label+' dry land');assert.ok(dry.some(i=>family.includes(f.biome[i])),label+' base biome remains');
  for(let i=0;i<f.flowTo.length;i++)assert.ok(f.flowTo[i]<0||f.flowRank[f.flowTo[i]]<f.flowRank[i],label+' acyclic flow');
  if(['desert','snow','volcanic'].includes(baseBiome))assert.ok(!f.biome.some(b=>['forest','rainforest','taiga','wetland'].includes(b)),label+' no contradictory biome');
 }
});

test('real atlases remain valid for every structure and biome with their own normalized requests',()=>{
 for(const kind of ['square','hex'])for(const size of [16,32])for(const seed of [7,42])for(const structure of Object.keys(LANDSCAPE_STRUCTURES))for(const baseBiome of Object.keys(LANDSCAPE_BIOMES)){
  const input=request(structure,baseBiome,kind,size,seed),before=structuredClone(input),label=[kind,size,seed,structure,baseBiome].join('/');let a;assert.doesNotThrow(()=>{a=generateAtlas(input);},label);
  const report=validateAtlas(a);assert.ok(report.ok,label+': '+report.errors?.join('; '));assert.deepEqual(normalizeAtlasRequest(a.request),a.request);assert.deepEqual(input,before);assert.ok(a.navigation.ok&&a.access.ok);
  assert.ok(a.layers[0].fields.biome.some(id=>biomeFamily[baseBiome].includes(id)),label+' visible base biome');
 }
});

test('profile generation keeps underground physical layers linked to their actual surface and deterministic',()=>{
 const input={...request('continent','volcanic','hex'),layers:{above:0,underground:2},layerSettings:{'cave-1':{depth:16,caves:{style:'karst'}},'cave-2':{depth:64,caves:{style:'lava-tubes'}}}},a=generateAtlas(input),b=generateAtlas(input);
 assert.equal(a.fingerprint,b.fingerprint);assert.ok(validateAtlas(a).ok);assert.deepEqual(a.layers.map(l=>l.z),[0,-16,-64]);assert.ok(a.layers.slice(1).every(l=>l.kind==='underground'));assert.ok(a.links.length>=2);assert.ok(a.navigation.ok&&a.access.ok);
});

test('profile-free native generation keeps its pre-integration checksum unchanged',()=>{
 const input={...structuredClone(base),layers:{above:0,underground:1}},a=generateAtlas(input);assert.equal(a.fingerprint,'67b41e2d');assert.ok(validateAtlas(a).ok);assert.ok(!Object.hasOwn(a.request,'landscape'));
});
