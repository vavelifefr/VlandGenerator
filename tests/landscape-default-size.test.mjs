import test from 'node:test';
import assert from 'node:assert/strict';
import {createRecipe,execute,generateBase,materialize} from '../app/index.mjs';
import {defaults as naturalDefaults} from '../app/modes/natural.mjs';

test('landscape API defaults generate a 128 by 128 surface on both grids',async()=>{
 for(const [mode,kind] of [['landscape','square'],['hexlandscape','hex']]){
  const recipe=await execute('defaults',{mode});
  assert.deepEqual([recipe.generation.width,recipe.generation.height],[128,128],mode);
  assert.deepEqual(recipe,await createRecipe(mode),'UI and API share the same recipe');
  const project=await generateBase(recipe),layers=await materialize(project);
  assert.equal(layers.length,1);
  assert.deepEqual([layers[0].width,layers[0].height],[128,128]);
  assert.equal(layers[0].material.length,128*128);
  assert.equal(project.source.request.topology.kind,kind);
 }
});

test('the landscape size change does not alter Chunk, relief or native defaults',async()=>{
 assert.deepEqual([naturalDefaults.width,naturalDefaults.height],[80,64]);
 for(const mode of ['caves','relief']){
  const recipe=await createRecipe(mode);
  assert.deepEqual([recipe.generation.width,recipe.generation.height],[80,64],mode);
 }
});
