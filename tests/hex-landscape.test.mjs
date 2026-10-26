import test from 'node:test';
import assert from 'node:assert/strict';
import {createRecipe,normalizeRecipe,generateBase,importProject,materialize,exportRuntime,editProject,validateProject,execute,MODES,API_CONTRACT} from '../app/index.mjs';
import {seal} from '../app/project.mjs';
import {atlasSizeBudget} from '../app/generation-budget.mjs';
import {createSource} from '../content/sources.mjs';
import {atlasFingerprint} from '../engine/api/atlas.mjs';

async function recipe(mode){const r=await createRecipe(mode);Object.assign(r.generation,{width:32,height:32,layers:{above:0,underground:0}});return r;}
const hasNoPopulation=p=>p.source.layers.every(l=>!l.sites.length&&!l.deposits.length&&!l.fields.vegetation.some(Boolean)&&!l.fields.resource.some(Boolean));

test('hexlandscape is a separate workspace with independent fixed-grid defaults and natural budgets',async()=>{
 assert.equal(MODES.hexlandscape?.page,'hexlandscape.html');assert.equal(MODES.hexlandscape.name,'Гексагональный ландшафт');
 const square=await createRecipe('landscape'),hex=await createRecipe('hexlandscape');
 assert.equal(square.generation.topology.kind,'square');assert.equal(hex.generation.topology.kind,'hex');assert.deepEqual(hex.generation.layers,{above:0,underground:0});
 hex.generation.terrain.relief=0;assert.notEqual((await createRecipe('landscape')).generation.terrain.relief,0);assert.notEqual((await createRecipe('hexlandscape')).generation.terrain.relief,0);
 assert.ok(API_CONTRACT.automaticTransports.natural.modes.includes('hexlandscape'));
 assert.equal(atlasSizeBudget('hexlandscape',{width:256,height:256,layers:{above:0,underground:0}}).ok,true);
 assert.equal(atlasSizeBudget('hexlandscape',{width:256,height:256,layers:{above:0,underground:1}}).ok,false);
});

test('landscape modes reject the opposite explicit topology in recipes, generation and project import',async()=>{
 for(const[mode,wrong]of [['landscape','hex'],['hexlandscape','square']]){
  const r=await recipe(mode);r.generation.topology={kind:wrong};assert.throws(()=>normalizeRecipe(r),{code:'INVALID_GENERATION'});await assert.rejects(()=>generateBase(r),{code:'INVALID_GENERATION'});
  const valid=await generateBase(await recipe(mode)),invalid=seal({...valid,recipe:r});await assert.rejects(()=>importProject(invalid),{code:'INVALID_GENERATION'});
 }
});

test('omitted topology uses the selected landscape mode without changing the caller recipe',async()=>{
 for(const[mode,kind]of [['landscape','square'],['hexlandscape','hex']]){
  const r=await recipe(mode);delete r.generation.topology;const before=JSON.stringify(r),p=await generateBase(r);
  assert.equal(p.source.request.topology.kind,kind);assert.ok(p.source.layers.every(l=>l.topology.kind===kind));assert.equal(JSON.stringify(r),before);assert.deepEqual(await importProject(p),p);
 }
});

test('project import checks that a valid atlas snapshot belongs to its fixed-grid workspace',async()=>{
 const square=await generateBase(await recipe('landscape')),hex=await generateBase(await recipe('hexlandscape'));
 for(const[target,source]of [[square,hex.source],[hex,square.source]]){
  const swapped=seal({...target,source});await assert.rejects(()=>importProject(swapped),{code:'INVALID_SOURCE'});assert.equal((await validateProject(swapped)).ok,false);
 }
});

test('an atlas request without topology has native square semantics and never produces a TypeError on import',async()=>{
 const square=await generateBase(await recipe('landscape')),source=structuredClone(square.source);delete source.request.topology;source.fingerprint=atlasFingerprint(source);
 const omitted=seal({...square,source}),before=JSON.stringify(omitted);assert.deepEqual(await importProject(omitted),omitted);assert.equal(JSON.stringify(omitted),before);assert.equal(omitted.source.request.topology,undefined);
 const hexRecipe=await recipe('hexlandscape');delete hexRecipe.generation.topology;const wrongMode=seal({...omitted,recipe:hexRecipe});await assert.rejects(()=>importProject(wrongMode),{code:'INVALID_SOURCE'});
});

test('hex landscape keeps independent physical layers, shared editing and PNG/runtime roundtrip without implicit population',async()=>{
 const r=await recipe('hexlandscape');r.generation.layers.underground=2;r.generation.layerSettings={'cave-1':{depth:16,caves:{style:'karst',aquifers:0}},'cave-2':{depth:64,caves:{style:'lava-tubes'}}};
 const p=await generateBase(r),layers=await materialize(p);assert.deepEqual(layers.map(l=>l.z),[0,-16,-64]);assert.ok(layers.every(l=>l.topology.kind==='hex'));assert.ok(hasNoPopulation(p));assert.deepEqual(p.sources,[]);
 const source=createSource({id:'hex-event',kind:'zone',category:'events',layer:layers[0],catalogId:'event'}),edited=await editProject(p,{type:'source.put',source});assert.equal(edited.sources.length,1);assert.deepEqual(edited.source,p.source);assert.ok((await validateProject(edited)).ok);
 const runtime=await exportRuntime(edited);assert.equal(runtime.mode,'hexlandscape');assert.ok(runtime.scene.map.layers.every(l=>l.topology.kind==='hex'));assert.deepEqual(runtime.initialState.entities,[]);
 assert.deepEqual(await importProject(JSON.stringify(edited)),edited);const raster=await execute('raster-export',{project:edited,options:{scope:'all',scale:1}});assert.equal(raster.files.length,3);assert.ok(raster.files.every(f=>f.width>32));
});

test('caves and relief retain hex topology through the shared natural provider',async()=>{
 for(const mode of ['caves','relief']){const r=await recipe(mode);r.generation.topology={kind:'hex'};if(mode==='caves')r.generation.layers.underground=1;const p=await generateBase(r);assert.ok(p.source.layers.every(l=>l.topology.kind==='hex'));assert.ok(hasNoPopulation(p));assert.ok((await validateProject(p)).ok);assert.deepEqual(await importProject(p),p);}
});
