import test from 'node:test';
import assert from 'node:assert/strict';
import {FIELDS} from '../Web/HTML/ui/controls.mjs';
test('landscape forms expose four structures and seven biomes as required choices without competing controls',()=>{
 for(const mode of ['landscape','hexlandscape']){
  const fields=FIELDS[mode].flatMap(g=>g[1]),structure=fields.find(f=>f.path==='landscape.structure'),biome=fields.find(f=>f.path==='landscape.baseBiome');
  assert.ok(structure?.required,'Structure required in '+mode);assert.ok(biome?.required,'Base biome required in '+mode);
  assert.deepEqual(structure.options.filter(([id])=>id).map(([id])=>id),['land','coast','islands','continent']);assert.deepEqual(biome.options.filter(([id])=>id).map(([id])=>id),['meadow','forest','swamp','desert','snow','mountains','volcanic']);
  for(const path of ['preset','terrain.water','climate.temperature','climate.moisture'])assert.ok(!fields.some(f=>f.path===path),'No competing '+path);
  assert.ok(!fields.some(f=>f.path.startsWith('landforms.')),'No competing form controls');
 }
 for(const mode of ['caves','relief'])assert.ok(!FIELDS[mode].flatMap(g=>g[1]).some(f=>f.path.startsWith('landscape.')),'Profile restricted to landscape workspaces');
});
