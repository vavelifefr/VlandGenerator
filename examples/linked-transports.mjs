// Runnable without packages: node examples/linked-transports.mjs [output-directory]
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRecipe,generateBase,materialize,contentScene,editProject,exportRuntime,resolveTransition} from '../app/index.mjs';
import {createSource,analyzeSource,planSpawns,commitSpawnPlan} from '../content/index.mjs';

export async function linkedExample(){
 const recipe=await createRecipe('tiers');recipe.seed=42;
 for(const layer of recipe.generation.layers){layer.request.rooms={...layer.request.rooms,count:3};layer.request.search={...layer.request.search,candidates:1};}
 let project=await generateBase(recipe);const layers=await materialize(project),first=layers[0],second=layers[1];
 async function find(layer){const scene=await contentScene(project),search=createSource({id:'search',category:'objects',layer,catalogId:'portal'}),mask=analyzeSource({...scene,sources:[...scene.sources,search]},search.id).eligibleMask;
  const points=mask.runs.flatMap(([y,x,n])=>Array.from({length:n},(_,i)=>({x:x+i,y})));points.sort((a,b)=>Math.abs(a.x-layer.spawn.x)+Math.abs(a.y-layer.spawn.y)-Math.abs(b.x-layer.spawn.x)-Math.abs(b.y-layer.spawn.y));if(!points.length)throw new Error('No compatible portal point.');return points[0];
 }
 const source=createSource({id:'portal-a',name:'Первый телепорт',kind:'spawner',category:'objects',layer:first,catalogId:'portal',...await find(first)});source.limits={maxAlive:1,batchSize:1,total:1,populationId:null};
 project=await editProject(project,{type:'source.put',source});
 project=await editProject(project,{type:'transport.connect',fromSourceId:source.id,target:{layerId:second.id,...await find(second)},bidirectional:true,travelCost:2});
 const runtime=await exportRuntime(project),plan=planSpawns(runtime.scene,runtime.initialState),state=commitSpawnPlan(runtime.scene,runtime.initialState,plan); // Example host accepts both points.
 const link=runtime.links.find(t=>t.origin==='editor'),hop=resolveTransition(runtime,state,link.id,source.id);if(!hop.ok)throw new Error(hop.reason);
 return{project,runtime,state,hop};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=await linkedExample(),directory=process.argv[2];if(directory){await mkdir(directory,{recursive:true});for(const [name,data]of Object.entries(result))await writeFile(path.join(directory,'linked-transports-'+name+'.json'),JSON.stringify(data,null,2)+'\n');}
 console.log(JSON.stringify({ok:result.hop.ok,from:result.hop.from.layerId,to:result.hop.destination.layerId,travelCost:result.hop.travelCost,links:result.project.transitions.length}));
}
