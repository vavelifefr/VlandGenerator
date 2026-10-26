import test from 'node:test';
import assert from 'node:assert/strict';
import {createRecipe,generateBase} from '../app/index.mjs';
import {normalizeAtlasRequest} from '../engine/api/atlas-catalog.mjs';
import {surfaceFields} from '../engine/core/atlas-landforms.mjs';
import {surfaceWater,watershed} from '../engine/core/atlas-water.mjs';
import {gridDistance} from '../engine/core/topology.mjs';
import {LANDSCAPE_STRUCTURES,LANDSCAPE_BIOMES} from '../engine/core/landscape-profile.mjs';
import {hash} from '../content/index.mjs';

const modes=['landscape','hexlandscape'];
const settings={rivers:1,lakes:.6,riverWidth:2,minLakeArea:4};
const synthetic=()=>({elevation:Array.from({length:1024},(_,i)=>.48+((i*19)%31)*.0001),rainfall:new Array(1024).fill(1)});
const boundary=(i,w,h)=>i%w===0||i%w===w-1||i<w||i>=w*(h-1);
async function request(mode,biome='meadow',hydrology={}){const r=await createRecipe(mode);Object.assign(r.generation,{width:64,height:64,layers:{above:0,underground:0},landscape:{structure:'land',baseBiome:biome}});Object.assign(r.generation.hydrology,hydrology);if(biome==='mountains')delete r.generation.terrain;return normalizeAtlasRequest({schema:'vland.atlas.request',schemaVersion:1,...r.generation});}
function gaps(f,T,w,h,interior=false){return f.waterType.flatMap((t,i)=>t==='river'&&f.drainage[i]>=T&&f.flowTo[i]>=0&&f.waterType[f.flowTo[i]]==='none'&&(!interior||!boundary(f.flowTo[i],w,h))?[{from:i,to:f.flowTo[i]}]:[]);}

test('profile streams reach their dry boundary outlet on both grids without changing the flow graph',async()=>{
 for(const mode of modes){const r=await request(mode,'meadow',{riverWidth:1}),{fields:f,riverThreshold:T}=surfaceFields(r),flow=watershed(f.elevation,64,64,f.rainfall,r.topology);assert.deepEqual(gaps(f,T,64,64),[],mode);assert.deepEqual(f.flowTo,flow.flowTo);assert.deepEqual(f.flowRank,flow.flowRank);const ends=f.waterType.flatMap((t,i)=>t==='river'&&f.flowTo[i]===-1?[i]:[]);assert.ok(ends.length>0,mode+' has river outlets');for(const i of ends){assert.ok(boundary(i,64,64));assert.ok(f.flowTo.some((j,k)=>j===i&&f.waterType[k]==='river'&&f.drainage[k]>=T));}}
});

test('removing undersized lakes retains strong river channels, rather than a dry gap or a restored lake',async()=>{
 for(const mode of modes){const small=await request(mode,'mountains',{minLakeArea:4,riverWidth:1}),large=structuredClone(small);large.hydrology.minLakeArea=128;const a=surfaceFields(small),b=surfaceFields(large);assert.ok(a.fields.waterType.includes('lake'),mode);assert.ok(b.fields.waterType.filter(x=>x==='lake').length<a.fields.waterType.filter(x=>x==='lake').length);assert.deepEqual(gaps(b.fields,b.riverThreshold,64,64,true),[],mode);for(let i=0;i<4096;i++)if(a.fields.waterType[i]==='sea')assert.equal(b.fields.waterType[i],'sea');}
});

test('profile width one is exactly the strong river core, without an automatic extra bank',()=>{
 for(const kind of ['square','hex']){const f=synthetic(),topology={kind},water=surfaceWater(f,32,32,.36,{...settings,riverWidth:1},topology,true);for(let i=0;i<1024;i++)if(water.waterType[i]==='river')assert.ok(water.drainage[i]>=water.riverThreshold,kind+' extra bank '+i);}
});

test('profile widening stays within width minus one neighbor layers and never replaces sea or retained lakes',()=>{
 for(const kind of ['square','hex']){const f=wetFixture(),topology={kind};const core=surfaceWater(f,32,32,.36,{...settings,riverWidth:1},topology,true),cores=core.waterType.flatMap((t,i)=>t==='river'?[i]:[]);assert.ok(core.waterType.includes('sea'));assert.ok(core.waterType.includes('lake'));let grew=false;for(const width of [2,3,5]){const wide=surfaceWater(f,32,32,.36,{...settings,riverWidth:width},topology,true);assert.deepEqual(wide.flowTo,core.flowTo);for(let i=0;i<1024;i++)if(wide.waterType[i]==='river'&&core.waterType[i]!=='river'){grew=true;const p={x:i%32,y:Math.floor(i/32)};assert.ok(cores.some(j=>gridDistance(p,{x:j%32,y:Math.floor(j/32)},topology)<=width-1));}for(let i=0;i<1024;i++)if(['sea','lake'].includes(core.waterType[i])){assert.equal(wide.waterType[i],core.waterType[i]);assert.equal(wide.waterDepth[i],core.waterDepth[i]);}}assert.ok(grew,kind+' width affects the mask');}
});

test('profile rivers zero stays river free through lake filtering and widening, retaining ocean and large lakes',()=>{
 for(const kind of ['square','hex']){const topology={kind},f=synthetic();f.elevation[0]=.2;for(let y=12;y<20;y++)for(let x=12;x<20;x++)f.elevation[y*32+x]=.4;const before=hash(f),a=surfaceWater(f,32,32,.36,{...settings,rivers:0,riverWidth:5,minLakeArea:4},topology,true),b=surfaceWater(f,32,32,.36,{...settings,rivers:0,riverWidth:5,minLakeArea:128},topology,true);assert.equal(hash(f),before);assert.ok(!a.waterType.includes('river'));assert.ok(!b.waterType.includes('river'));assert.equal(a.waterType[0],'sea');assert.equal(b.waterType[0],'sea');assert.ok(a.waterType.includes('lake'));assert.ok(b.waterType.filter(t=>t==='lake').length<a.waterType.filter(t=>t==='lake').length);const dry=surfaceWater(f,32,32,.36,{...settings,rivers:0,lakes:0,minLakeArea:1},topology,true);assert.ok(!dry.waterType.includes('river'));assert.ok(!dry.waterType.includes('lake'));assert.equal(dry.waterType[0],'sea');}
});

test('native requests without a landscape profile retain their observed water output exactly',()=>{
 const expected={square:'9d265866',hex:'7551b78a'};for(const kind of ['square','hex']){const f=synthetic(),a=surfaceWater(f,32,32,.36,settings,{kind}),b=surfaceWater(f,32,32,.36,settings,{kind},false);assert.equal(hash(a),expected[kind]);assert.deepEqual(a,b);}
});

test('real profile river corrections preserve native navigation and access in both workspaces',async()=>{
 for(const mode of modes){const r=await createRecipe(mode);Object.assign(r.generation,{width:64,height:64,layers:{above:0,underground:0}});const p=await generateBase(r);assert.equal(p.source.navigation.ok,true);assert.equal(p.source.access.ok,true);assert.deepEqual(p.source.request.landscape,r.generation.landscape);}
});

function wetFixture(){return{elevation:Array.from({length:1024},(_,i)=>{const x=i%32,y=Math.floor(i/32);return y>=29?.35:x>=12&&x<20&&y>=12&&y<20?.2:.46+(31-y)*.004+Math.abs(x-15.5)*.009;}),rainfall:new Array(1024).fill(1)};}
const wetHead=(f,w,i)=>f.elevation[i]+w.waterDepth[i];

test('profile freshwater fills to a shared conditioned head while retaining sea, masks, flow and width',()=>{
 for(const kind of ['square','hex']){const f=wetFixture(),topology={kind},water=surfaceWater(f,32,32,.36,{...settings,riverWidth:3,minLakeArea:1},topology,true),native=surfaceWater(f,32,32,.36,{...settings,riverWidth:3,minLakeArea:1},topology,false);assert.ok(water.waterType.includes('river'));assert.ok(water.waterType.includes('lake'));assert.ok(water.waterType.includes('sea'));assert.deepEqual(water.flowTo,native.flowTo);assert.deepEqual(water.drainage,native.drainage);for(let i=0;i<1024;i++){if(water.waterType[i]==='sea')assert.equal(water.waterDepth[i],native.waterDepth[i]);if(['river','lake'].includes(water.waterType[i]))assert.ok(Math.abs(wetHead(f,water,i)-Math.max(.4,water.filledElevation[i]+.035))<=.000001,kind+' freshwater head '+i);}}
});

test('profile water levels do not rise along wet flow through widened rivers, lake exits or sea contacts',()=>{
 for(const kind of ['square','hex']){const f=wetFixture(),water=surfaceWater(f,32,32,.36,{...settings,riverWidth:3,minLakeArea:1},{kind},true),contacts=new Set();let banks=0;for(let i=0;i<1024;i++){const j=water.flowTo[i];if(water.waterType[i]==='river'&&water.drainage[i]<water.riverThreshold)banks++;if(j>=0&&water.waterType[i]!=='none'&&water.waterType[j]!=='none'){const pair=water.waterType[i]+'>'+water.waterType[j];contacts.add(pair);assert.ok(wetHead(f,water,j)<=wetHead(f,water,i)+.000001,kind+' '+pair+' '+i+'>'+j);}}assert.ok(banks>0,kind+' includes widened banks');assert.ok(contacts.has('river>lake'),kind+' lake inlet');assert.ok(contacts.has('lake>river'),kind+' lake outlet');assert.ok(contacts.has('river>sea'),kind+' sea mouth');}
});

test('profile flat bed one retains a positive freshwater depth without capping its internal head at one',()=>{
 for(const kind of ['square','hex']){const f={elevation:new Array(1024).fill(1),rainfall:new Array(1024).fill(1)},water=surfaceWater(f,32,32,.36,{...settings,riverWidth:1},{kind},true);assert.ok(water.waterType.includes('river'));for(let i=0;i<1024;i++)if(water.waterType[i]==='river')assert.equal(water.waterDepth[i],.035);}
});

test('normalized profile matrix keeps final wet flow levels monotone, depths bounded and navigation accessible',async()=>{
 const cases=[];for(const mode of modes){for(const size of [16,32])for(const structure of Object.keys(LANDSCAPE_STRUCTURES))for(const baseBiome of Object.keys(LANDSCAPE_BIOMES))cases.push({mode,size,structure,baseBiome});for(const [structure,baseBiome] of [['land','meadow'],['coast','forest'],['islands','meadow'],['continent','mountains']])cases.push({mode,size:64,structure,baseBiome});cases.push({mode,size:64,structure:'land',baseBiome:'mountains',minLakeArea:128});}
 for(const c of cases){const r=await createRecipe(c.mode);Object.assign(r.generation,{width:c.size,height:c.size,layers:{above:0,underground:0},landscape:{structure:c.structure,baseBiome:c.baseBiome,landPercent:c.structure==='islands'&&c.size===16?25:75,uniformity:50}});if(c.minLakeArea){delete r.generation.terrain;r.generation.hydrology.minLakeArea=c.minLakeArea;}const a=(await generateBase(r)).source,label=JSON.stringify(c);assert.equal(a.navigation.ok,true,label);assert.equal(a.access.ok,true,label);for(const l of a.layers){const f=l.fields;for(let i=0;i<f.waterType.length;i++){assert.ok(f.waterDepth[i]>=0&&f.waterDepth[i]<=1,label+' depth '+i);if(f.waterType[i]!=='none')assert.ok(f.waterDepth[i]>0,label+' wet depth '+i);if(['river','lake'].includes(f.waterType[i]))assert.ok(Math.max(.4,f.filledElevation[i]+.035)-f.heightmap[i]<=1,label+' required unclamped depth '+i);const j=f.flowTo[i];if(j>=0&&f.waterType[i]!=='none'&&f.waterType[j]!=='none'){assert.ok(f.heightmap[j]+f.waterDepth[j]<=f.heightmap[i]+f.waterDepth[i]+.000001,label+' hydrology uphill '+i+'>'+j);if(!f.bridge[i]&&!f.bridge[j])assert.ok(f.elevation[j]+f.waterDepth[j]<=f.elevation[i]+f.waterDepth[i]+.000001,label+' nonbridge wet uphill '+i+'>'+j);}}}}
});


test('generated bridge water level uses the immutable bed rather than its navigation deck elevation',async()=>{
 // A real second physical layer requests a landing and approach. These fixed
 // synthetic cases actually construct raised decks after the island rework.
 for(const [mode,seed]of [['landscape',6],['hexlandscape',2]]){
  const r=await createRecipe(mode);r.seed=seed;Object.assign(r.generation,{width:16,height:16,layers:{above:0,underground:1},landscape:{structure:'islands',baseBiome:'mountains',landPercent:25,coastErosion:50,uniformity:50}});
  const a=(await generateBase(r)).source,f=a.layers[0].fields,raw=surfaceFields(a.request).fields,changed=f.bridge.flatMap((value,i)=>value&&f.elevation[i]!==f.heightmap[i]?[i]:[]);
  assert.equal(a.layers.length,2);assert.equal(a.navigation.ok,true);assert.equal(a.access.ok,true);assert.ok(changed.length>=2,mode+' fixture contains real raised decks');
  for(const i of changed){assert.equal(f.heightmap[i],raw.elevation[i]);assert.equal(f.waterDepth[i],raw.waterDepth[i]);assert.ok(Math.abs(f.heightmap[i]+f.waterDepth[i]-.4)<=.000001);}
  const uphillDeck=changed.find(i=>{const j=f.flowTo[i];return j>=0&&f.bridge[j]&&f.elevation[j]+f.waterDepth[j]>f.elevation[i]+f.waterDepth[i]+.000001;});
  assert.notEqual(uphillDeck,undefined,'deck elevation plus water depth is not a hydrology head');const to=f.flowTo[uphillDeck];assert.ok(f.heightmap[to]+f.waterDepth[to]<=f.heightmap[uphillDeck]+f.waterDepth[uphillDeck]+.000001);
 }
});
