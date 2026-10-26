import {MODES} from '../app/contracts.mjs';
import {writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {smallProject,smallRecipe} from '../tests/helpers.mjs';
import {generateBase,materialize,contentScene,editProject,exportRuntime,validateProject,previewDistribution,applyDistribution} from '../app/index.mjs';
import {createSource,hash,analyzeSource,createSpawnState,planSpawns,commitSpawnPlan,updateSpawnState,createDistributionRequest,serializeScene} from '../content/index.mjs';
import {createDemo} from '../examples/content-workflow.mjs';
const rows=[];await mkdir(new URL('../evidence/',import.meta.url),{recursive:true});
const surface100=process.argv.includes('--surface-100');
async function contentProject(mode,seed){
 if(!surface100||!['landscape','hexlandscape','caves','relief'].includes(mode))return smallProject(mode,seed);
 const recipe=await smallRecipe(mode,seed);recipe.generation.width=recipe.generation.height=100;
 if(['landscape','hexlandscape'].includes(mode))Object.assign(recipe.generation.landscape,{structure:seed===42?'islands':'coast',coastErosion:100});
 return generateBase(recipe);
}
for(const mode of Object.keys(MODES))for(const seed of [7,42,2026]){
 let project=await contentProject(mode,seed);const nativeHash=hash(project.source);let operations=0;
 for(const category of ['objects','items','resources','flora','fauna','events']){
  let scene=await contentScene(project),chosen=null;const ids={objects:['portal'],items:['chest'],resources:['crystal','iron'],flora:['mushroom','shrub'],fauna:['guard','beast'],events:['event']}[category];
  for(const catalogId of ids)for(const layer of scene.map.layers){const s=createSource({id:'qa-'+category+'-zone',category,layer,catalogId,seed}),a=analyzeSource({...scene,sources:[...scene.sources,s]},s.id);if(!chosen&&a.rules.some(r=>r.eligibleCells))chosen={s,a};}
  if(!chosen){const catalog=structuredClone(project.catalog),entry=catalog.find(e=>e.id===ids[0]);entry.constraints={requiresWalkable:true,requiresEmptyTile:true};project=await editProject(project,{type:'catalog',catalog});scene=await contentScene(project);for(const layer of scene.map.layers){const s=createSource({id:'qa-'+category+'-zone',category,layer,catalogId:entry.id,seed}),a=analyzeSource({...scene,sources:[...scene.sources,s]},s.id);if(!chosen&&a.rules.some(r=>r.eligibleCells))chosen={s,a,customConstraints:true};}}
  assert.ok(chosen,mode+' '+category+' no floor');const {s,a}=chosen;s.rules[0].quantity={mode:'count',min:2,max:2,density:1};s.limits={maxAlive:3,batchSize:1,total:5,populationId:null};project=await editProject(project,{type:'source.put',source:s});const r=a.eligibleMask.runs[0],point={...structuredClone(s),id:'qa-'+category+'-spawner',kind:'spawner',area:{x:r[1],y:r[0],radius:2},schedule:{...s.schedule,repeat:'cycle',interval:3}};project=await editProject(project,{type:'source.put',source:point});operations+=2;
 }
 let scene=await contentScene(project),state=createSpawnState(scene),plan=planSpawns(scene,state);state=commitSpawnPlan(scene,state,plan);const created=state.entities.length;assert.ok(created>=6);const dead=state.entities.filter(e=>e.origin.sourceId.endsWith('spawner')).map(e=>e.id);state=updateSpawnState(scene,state,{removeIds:dead});state=commitSpawnPlan(scene,state,planSpawns(scene,state,{clock:{seconds:10,turns:0}}));assert.ok(Object.values(state.records).every(r=>r.created<=5));
 const source=project.sources.find(s=>s.category==='items'&&s.kind==='spawner'),request=createDistributionRequest(source);request.placement.count=2;const distribution=await previewDistribution(project,request);assert.ok(distribution.validation.ok);project=await applyDistribution(project,distribution);assert.equal(hash(project.source),nativeHash);const validation=await validateProject(project);assert.ok(validation.ok,validation.errors.join(' '));const runtime=await exportRuntime(project);assert.deepEqual(runtime.initialState.entities,[]);rows.push({mode,seed,layers:scene.map.layers.length,sources:project.sources.length,operations,firstBatch:created,afterReplacement:state.entities.length,valid:true});
 if(seed===42){for(const[k,v]of [['project',project],['runtime',runtime],['state',state],['plan',plan],['distribution-preview',distribution],['scene',JSON.parse(serializeScene(scene))]])await writeFile(new URL('../evidence/content-'+mode+'-'+k+'-schema-data.json',import.meta.url),JSON.stringify(v));}
}
const demo=await createDemo();assert.equal(demo.summary.categories.length,6);assert.equal(demo.summary.initialEntities,0);const result={ok:true,maps:rows.length,modes:Object.keys(MODES).length,sourceOperations:rows.reduce((n,r)=>n+r.operations,0),rows,demo:demo.summary};await writeFile(new URL('../evidence/content-verification.json',import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
