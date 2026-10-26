import test from 'node:test';
import assert from 'node:assert/strict';
import {createRecipe,generateBase,materialize,exportRuntime,editProject,validateProject} from '../app/index.mjs';
import {MODES} from '../app/contracts.mjs';
import {createSource} from '../content/sources.mjs';

test('relief is a separate square-grid workspace with one physical surface and editable height fields',async()=>{
 assert.equal(MODES.relief?.page,'relief.html');const recipe=await createRecipe('relief');Object.assign(recipe.generation,{width:32,height:32});
 assert.deepEqual(recipe.generation.layers,{above:0,underground:0});assert.equal(recipe.generation.topology.kind,'square');
 const project=await generateBase(recipe),layers=await materialize(project);assert.equal(layers.length,1);assert.equal(layers[0].kind,'surface');assert.deepEqual(project.sources,[]);
 const edited=await editProject(project,{type:'terrain.stroke',layerId:'surface',field:'biome',value:'plains',cells:[{x:8,y:8}]});assert.ok((await validateProject(edited)).ok);assert.deepEqual(edited.source,project.source);assert.ok((await exportRuntime(edited)).validation.ok);
});
test('relief participates in the shared content editor and rejects hidden physical slices',async()=>{
 const recipe=await createRecipe('relief');Object.assign(recipe.generation,{width:32,height:32});const project=await generateBase(recipe),[layer]=await materialize(project);
 const source=createSource({id:'relief-source',name:'Рельеф · события',kind:'zone',category:'events',layer,catalogId:'event',seed:42});const edited=await editProject(project,{type:'source.put',source});assert.ok((await validateProject(edited)).ok);assert.equal(edited.sources.length,1);
 recipe.generation.layers.underground=1;await assert.rejects(generateBase(recipe));
});
