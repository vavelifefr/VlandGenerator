import test from 'node:test';
import assert from 'node:assert/strict';
import {createRecipe,normalizeRecipe,generateBase,execute,editProject,materialize,exportRuntime,importProject,validateProject} from '../app/index.mjs';
import {seal} from '../app/project.mjs';
import {createSource,hash} from '../content/index.mjs';
import {LANDSCAPE_STRUCTURES,LANDSCAPE_BIOMES} from '../engine/core/landscape-profile.mjs';

const modes=['landscape','hexlandscape'];
async function recipe(mode,profile={structure:'land',baseBiome:'meadow'}){const r=await createRecipe(mode);Object.assign(r.generation,{width:32,height:32,layers:{above:0,underground:0},landscape:profile&&typeof profile==='object'&&!Array.isArray(profile)?{...profile,biomes:profile.biomes??[],landPercent:profile.landPercent??75,uniformity:profile.uniformity??50,coastErosion:profile.coastErosion??50}:profile});return r;}

test('new landscape defaults contain independent explicit structure and biome choices without competing base controls',async()=>{
 for(const mode of modes){const r=await createRecipe(mode);assert.deepEqual(r.generation.landscape,{structure:'land',baseBiome:'meadow',biomes:[],landPercent:75,uniformity:50,coastErosion:50});assert.equal(r.generation.preset,undefined);assert.equal(r.generation.terrain.water,undefined);assert.equal(r.generation.landforms,undefined);assert.equal(r.generation.climate?.temperature,undefined);assert.equal(r.generation.climate?.moisture,undefined);r.generation.landscape.structure='islands';assert.deepEqual((await createRecipe(mode)).generation.landscape,{structure:'land',baseBiome:'meadow',biomes:[],landPercent:75,uniformity:50,coastErosion:50});}
});

test('landscape recipes reject incomplete, unknown or malformed profiles before generation',async()=>{
 const bad=[null,[],{},'land',{structure:'land'},{baseBiome:'meadow'},{structure:'ocean',baseBiome:'meadow'},{structure:'land',baseBiome:'jungle'},{structure:['land'],baseBiome:'meadow'},{structure:'land',baseBiome:'meadow',extra:true}];
 for(const mode of modes)for(const value of bad){const r=await recipe(mode,value);assert.throws(()=>normalizeRecipe(r));await assert.rejects(()=>generateBase(r));}
});

test('profiles are scoped to landscape workspaces rather than changing other generators',async()=>{
 for(const mode of ['dungeon','tiers','sideview','caves','relief','settlements']){const r=await createRecipe(mode);assert.equal(r.generation.landscape,undefined);r.generation.landscape={structure:'land',baseBiome:'meadow'};assert.throws(()=>normalizeRecipe(r));}
});

test('landscape profile survives JSON export/import, context and runtime while edits leave its source immutable',async()=>{
 for(const mode of modes){const r=await recipe(mode,{structure:'coast',baseBiome:'forest'}),before=hash(r),p=await generateBase(r);assert.equal(hash(r),before);assert.deepEqual(p.source.request.landscape,r.generation.landscape);
  const [layer]=await materialize(p),source=createSource({id:'profile-event',category:'events',kind:'zone',layer,catalogId:'event'}),edited=await editProject(p,{type:'source.put',source});assert.equal(hash(edited.source),hash(p.source));assert.deepEqual(edited.recipe.generation.landscape,r.generation.landscape);
  const exported=await execute('export',{project:edited,format:'recipe'});assert.deepEqual(exported.generation.landscape,r.generation.landscape);assert.deepEqual(normalizeRecipe(JSON.stringify(exported)),exported);assert.deepEqual(await importProject(JSON.stringify(edited)),edited);
  const context=await execute('export',{project:edited,format:'llm-context'}),runtime=await exportRuntime(edited);assert.equal(context.project.mode,mode);assert.deepEqual(context.project.landscape,r.generation.landscape);assert.equal(context.validation.ok,true);assert.equal(context.layers[0].topology.kind,mode==='hexlandscape'?'hex':'square');assert.ok(context.layers[0].fields.biome.counts.some(x=>x.value==='forest'));assert.equal(runtime.mode,mode);assert.equal(runtime.validation.ok,true);assert.deepEqual(runtime.scene.map.layers[0].biome,(await materialize(edited))[0].biome);assert.deepEqual(runtime.initialState.entities,[]);
 }
});

test('changing profile metadata without rebuilding is diagnosed and blocks runtime export',async()=>{
 for(const mode of modes){const p=await generateBase(await recipe(mode)),changed=seal({...p,recipe:{...p.recipe,generation:{...p.recipe.generation,landscape:{structure:'coast',baseBiome:'desert'}}}});const report=await validateProject(changed);assert.equal(report.ok,false);assert.ok(report.errors.length);await assert.rejects(()=>exportRuntime(changed),{code:'INVALID_MAP'});assert.deepEqual(changed.source.request.landscape,{structure:'land',baseBiome:'meadow',biomes:[],landPercent:75,uniformity:50,coastErosion:50});}
});

test('native caves and relief stay deterministic and profile-free with valid physical layer transport',async()=>{
 // Native link kinds intentionally changed: teleports cannot bridge floors.
 // Verify the current 100x100 contract rather than pinning the former invalid link hash.
 for(const mode of ['caves','relief']){const r=await createRecipe(mode);Object.assign(r.generation,{width:100,height:100,layers:{above:0,underground:mode==='caves'?1:0}});const p=await generateBase(r),again=await generateBase(r);assert.equal(p.source.request.landscape,undefined);assert.equal(p.checksum,again.checksum);assert.deepEqual(p.source,again.source);assert.ok((await validateProject(p)).ok);assert.ok(p.source.links.every(link=>link.kind!=='teleport'||link.from.layerId===link.to.layerId));assert.equal((await execute('export',{project:p,format:'llm-context'})).project.landscape,undefined);}
});

test('every published structure and biome choice passes recipe validation in both landscape workspaces',async()=>{
 assert.equal(Object.keys(LANDSCAPE_STRUCTURES).length,4);assert.equal(Object.keys(LANDSCAPE_BIOMES).length,7);
 for(const mode of modes)for(const structure of Object.keys(LANDSCAPE_STRUCTURES))for(const baseBiome of Object.keys(LANDSCAPE_BIOMES)){const r=await recipe(mode,{structure,baseBiome});assert.deepEqual(normalizeRecipe(r).generation.landscape,{structure,baseBiome,biomes:[],landPercent:75,uniformity:50,coastErosion:50});}
});
