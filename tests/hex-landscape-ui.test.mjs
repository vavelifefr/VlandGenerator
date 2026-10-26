import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {FIELDS} from '../Web/HTML/ui/controls.mjs';
test('landscape pages present separate fixed grids while caves and relief retain a grid choice',()=>{
 for(const mode of ['landscape','hexlandscape']){assert.ok(FIELDS[mode]?.length,'Controls for '+mode);assert.ok(!FIELDS[mode].flatMap(g=>g[1]).some(f=>f.path==='topology.kind'),'Grid belongs to chosen workspace '+mode);}
 for(const mode of ['caves','relief'])assert.ok(FIELDS[mode].flatMap(g=>g[1]).some(f=>f.path==='topology.kind'),'Independent grid choice '+mode);
 assert.deepEqual(FIELDS.hexlandscape,FIELDS.landscape);
});
test('generated home and hex workspace expose the separate editor at canonical Web URLs',async()=>{
 const home=await readFile(new URL('../Web/index.html',import.meta.url),'utf8'),page=await readFile(new URL('../Web/HTML/hexlandscape.html',import.meta.url),'utf8');
 assert.ok(home.includes('/Web/HTML/hexlandscape.html'));assert.ok(page.includes('data-mode="hexlandscape"'));assert.ok(page.includes('Гексагональный ландшафт'));assert.ok(page.includes('ui/workbench.mjs'));
});
test('published generation schemas distinguish fixed landscape grids from flexible relief/caves',async()=>{
 for(const[mode,kind]of [['landscape','square'],['hexlandscape','hex']]){const schema=JSON.parse(await readFile(new URL('../schemas/generation-'+mode+'.schema.json',import.meta.url),'utf8'));assert.deepEqual(schema.properties.topology.properties.kind,{const:kind});}
 for(const mode of ['relief','caves']){const schema=JSON.parse(await readFile(new URL('../schemas/generation-'+mode+'.schema.json',import.meta.url),'utf8'));assert.deepEqual(schema.properties.topology.properties.kind.enum,['square','hex']);}
});
