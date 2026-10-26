import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRecipe,execute} from '../app/index.mjs';

test('both landscape workspaces advertise canonical area and uniformity defaults',async()=>{
 for(const mode of ['landscape','hexlandscape']){
  const recipe=await createRecipe(mode),api=await execute('defaults',{mode});
  assert.equal(recipe.generation.landscape.landPercent,75);
  assert.equal(recipe.generation.landscape.uniformity,50);
  assert.deepEqual(api,recipe);
 }
 for(const mode of ['caves','relief'])assert.equal((await createRecipe(mode)).generation.landscape,undefined);
});
test('published native and workspace schemas describe the same landscape settings',async()=>{
 for(const path of ['engine/schemas/atlas-request.schema.json','schemas/generation-landscape.schema.json','schemas/generation-hexlandscape.schema.json']){
  const schema=JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8')),profile=schema.properties.landscape;
  assert.deepEqual(profile.properties.landPercent,{type:'integer',minimum:1,maximum:99,default:75},path);
  assert.deepEqual(profile.properties.uniformity,{type:'integer',minimum:0,maximum:100,default:50},path);
  assert.equal(profile.additionalProperties,false);
 }
});

test('LLM context schema preserves land coverage and shared uniformity',async()=>{const schema=JSON.parse(await readFile(new URL('../schemas/project-context.schema.json',import.meta.url),'utf8')),profile=schema.properties.project.properties.landscape;assert.deepEqual(profile.properties.landPercent,{type:'integer',minimum:1,maximum:99,default:75});assert.deepEqual(profile.properties.uniformity,{type:'integer',minimum:0,maximum:100,default:50});});
