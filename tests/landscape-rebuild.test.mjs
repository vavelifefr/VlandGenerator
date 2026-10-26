import test from 'node:test';
import assert from 'node:assert/strict';
import {rebuildLandscape} from '../app/landscape-rebuild.mjs';
import {createRecipe,generateBase,editProject,materialize,contentScene,recipeFromProject,seal,validateProject} from '../app/project.mjs';
import {createSource} from '../content/sources.mjs';
import {analyzeSource} from '../content/generate.mjs';

async function sample(mode='landscape'){
 const recipe=await createRecipe(mode);Object.assign(recipe.generation,{width:32,height:32,layers:{above:0,underground:0}});
 return generateBase(recipe);
}

for(const mode of ['landscape','hexlandscape'])test(mode+': rebuild retains authored catalog, sources and cell overrides atomically',async()=>{
 let project=await sample(mode);const layer=(await materialize(project))[0];
 const catalog=structuredClone(project.catalog);catalog[0].name='Собственное описание';project=await editProject(project,{type:'catalog',catalog});
 project=await editProject(project,{type:'source.put',source:createSource({id:'manual-events',category:'events',layer,catalogId:'event'})});
 project=await editProject(project,{type:'field',layerId:layer.id,x:2,y:2,field:'fertility',value:.42});
 const recipe=recipeFromProject(project);recipe.generation.landscape.baseBiome='forest';const before=structuredClone(project),draft=structuredClone(recipe);
 const next=await rebuildLandscape(project,recipe);
 assert.deepEqual(project,before);assert.deepEqual(recipe,draft);
 for(const field of ['catalog','sources','transitions','edits']){assert.deepEqual(next[field],project[field]);assert.notEqual(next[field],project[field]);}
 assert.equal(next.revision,project.revision+1);assert.notEqual(next.checksum,project.checksum);assert.equal(next.recipe.generation.landscape.baseBiome,'forest');
 assert.equal((await materialize(next))[0].fertility[2*layer.width+2],.42);assert.ok((await validateProject(next)).ok);
 next.sources[0].name='Changed result';assert.equal(project.sources[0].name,'Источник появления');
});

test('automatic rebuild refuses unrelated pending generation, seed and mode changes',async()=>{
 const project=await sample(),before=structuredClone(project);
 for(const change of [r=>r.seed++,r=>r.mode='hexlandscape',r=>r.generation.width++,r=>r.generation.terrain.relief=.2,r=>r.generation.layers.underground=1]){
  const recipe=recipeFromProject(project);change(recipe);
  await assert.rejects(rebuildLandscape(project,recipe),error=>error.code==='REBUILD_SETTINGS_CONFLICT');
 }
 const other=await createRecipe('dungeon');await assert.rejects(rebuildLandscape(project,other),error=>error.code==='REBUILD_SETTINGS_CONFLICT');
 assert.deepEqual(project,before);
});

test('rebuild validates the entire submitted recipe instead of silently ignoring unknown fields',async()=>{
 const project=await sample(),recipe=recipeFromProject(project);
 await assert.rejects(rebuildLandscape(project,{...recipe,unexpected:true}),error=>error.code==='UNKNOWN_FIELD');
 await assert.rejects(rebuildLandscape(project,{...recipe,title:''}),error=>error.code==='INVALID_TITLE');
});

test('conflicting preserved overrides cancel rebuild instead of silently dropping edits',async()=>{
 const original=await sample(),layer=(await materialize(original))[0],point=layer.spawn;
 const project=seal({...original,edits:[{layerId:layer.id,x:point.x,y:point.y,surface:'wall',trait:'normal'}],revision:1}),before=structuredClone(project),recipe=recipeFromProject(project);
 recipe.generation.landscape.baseBiome='forest';
 await assert.rejects(rebuildLandscape(project,recipe),error=>error.code==='REBUILD_CONFLICT'&&Array.isArray(error.details)&&error.details.length>0);
 assert.deepEqual(project,before);assert.equal(project.edits.length,1);
});

test('rebuild preserves an authored transport pair and its exact bound source points',async()=>{
 let project=await sample();const layer=(await materialize(project))[0],scene=await contentScene(project),search=createSource({id:'search',category:'objects',layer,catalogId:'portal'});
 const mask=analyzeSource({...scene,sources:[search]},search.id).eligibleMask,points=mask.runs.flatMap(([y,x,n])=>Array.from({length:n},(_,i)=>({x:x+i,y})));
 assert.ok(points.length>=2);
 points.sort((a,b)=>Math.abs(a.x-layer.spawn.x)+Math.abs(a.y-layer.spawn.y)-Math.abs(b.x-layer.spawn.x)-Math.abs(b.y-layer.spawn.y));
 const from=points[0],to=points[1],source=createSource({id:'manual-portal',kind:'spawner',category:'objects',layer,catalogId:'portal',...from});
 source.limits={maxAlive:1,batchSize:1,total:1,populationId:null};project=await editProject(project,{type:'source.put',source});
 project=await editProject(project,{type:'transport.connect',fromSourceId:source.id,target:{layerId:layer.id,...to}});
 const before=structuredClone(project),next=await rebuildLandscape(project,recipeFromProject(project));
 assert.equal(next.transitions.length,1);assert.deepEqual(next.transitions,before.transitions);assert.deepEqual(next.sources,before.sources);assert.ok((await validateProject(next)).transitions.ok);assert.deepEqual(project,before);
});
