import test from 'node:test';
import assert from 'node:assert/strict';
import {generateAtlas,validateAtlas} from '../engine/api/atlas.mjs';
import {normalizeAtlasRequest} from '../engine/api/atlas-catalog.mjs';
import {createRecipe,generateBase,validateProject,exportRuntime} from '../app/index.mjs';
import {seal} from '../app/project.mjs';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createVlandServer} from '../server.mjs';

const request={schema:'vland.atlas.request',schemaVersion:1,seed:713,width:32,height:32,layers:{above:0,underground:2},autoTransports:{enabled:false},resources:{frequency:0},ecology:{vegetation:0},structures:{density:0},events:{density:0,spawners:0}};
test('individual underground settings retain depth, style and independent generation in the public project',async()=>{
 const recipe=await createRecipe('landscape');Object.assign(recipe.generation,{width:32,height:32,layers:{above:0,underground:2},layerSettings:{'cave-1':{depth:16,caves:{style:'karst',openness:.6,aquifers:0}},'cave-2':{depth:64,caves:{style:'lava-tubes',aquifers:.6}}}});
 const project=await generateBase(recipe);assert.ok((await validateProject(project)).ok);
 assert.deepEqual(project.source.layers.map(l=>l.z),[0,-16,-64]);
 assert.deepEqual(project.source.request.layerSettings,recipe.generation.layerSettings);
 assert.equal(project.source.layers[1].fields.waterType.includes('groundwater'),false);
 const runtime=await exportRuntime(project);assert.ok(runtime.validation.ok);assert.deepEqual(runtime.scene.map.layers.map(l=>l.z),[0,-16,-64]);
 const changed=structuredClone(project);changed.recipe.generation.layerSettings['cave-1'].depth=24;assert.equal((await validateProject(seal(changed))).ok,false,'Changed settings cannot misrepresent the immutable generated source');
});
test('layer settings reject missing layers, unknown fields, invalid cave options and reversed depths',()=>{
 for(const layerSettings of [{'cave-3':{depth:96}},{surface:{depth:1}},{'cave-1':{invalid:1}},{'cave-1':{caves:{style:'unknown'}}},{'cave-1':{caves:{openness:.9}}},{'cave-1':{depth:64},'cave-2':{depth:16}}])assert.throws(()=>normalizeAtlasRequest({...request,layerSettings}));
});
test('changing the second underground layer preserves surface fields and determinism',()=>{
 const a=generateAtlas({...request,layerSettings:{'cave-2':{caves:{style:'tunnels',aquifers:0}}}}),b=generateAtlas({...request,layerSettings:{'cave-2':{caves:{style:'chambers',aquifers:1}}}});
 assert.ok(validateAtlas(a).ok);assert.ok(validateAtlas(b).ok);
 for(const field of ['heightmap','humidity','temperature','waterType'])assert.deepEqual(a.layers[0].fields[field],b.layers[0].fields[field],field);
 assert.notDeepEqual(a.layers[2].fields.waterType,b.layers[2].fields.waterType);
 assert.equal(generateAtlas({...request,layerSettings:{'cave-2':{caves:{style:'tunnels',aquifers:0}}}}).fingerprint,a.fingerprint);
});
test('individual layer settings have matching JS, HTTP and CLI generation and validation',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'Vland layer interfaces ')),server=createVlandServer({root});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const recipe=await createRecipe('landscape');Object.assign(recipe.generation,{width:32,height:32,layers:{above:0,underground:1},layerSettings:{'cave-1':{depth:32,caves:{style:'karst',aquifers:0}}}});
  const expected=await generateBase(recipe),response=await fetch('http://127.0.0.1:'+server.address().port+'/api/generate-base',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({recipe})});assert.equal(response.status,200);assert.deepEqual(await response.json(),expected);
  await writeFile(path.join(root,'recipe.json'),JSON.stringify(recipe),'utf8');const cli=fileURLToPath(new URL('../cli.mjs',import.meta.url));execFileSync(process.execPath,[cli,'generate-base','recipe.json','project.json'],{cwd:root});assert.deepEqual(JSON.parse(await readFile(path.join(root,'project.json'),'utf8')),expected);
  const report=JSON.parse(execFileSync(process.execPath,[cli,'validate','project.json'],{cwd:root,encoding:'utf8'}));assert.ok(report.ok);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});}
});
test('custom physical depths keep native deposit strata integral and within the declared schema',()=>{
 const atlas=generateAtlas({...request,resources:{frequency:3},layerSettings:{'cave-1':{depth:16},'cave-2':{depth:64}}}),deposits=atlas.layers.flatMap(l=>l.deposits);
 assert.ok(deposits.length>0);assert.ok(deposits.every(d=>Number.isInteger(d.depth)&&d.depth>=0&&d.depth<=6));assert.ok(validateAtlas(atlas).ok);
});
