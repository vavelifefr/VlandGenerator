// node examples/automatic-transports.mjs [output-directory] [mixed|teleport|lift|stairs|dungeon]
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRecipe,generateBase,validateProject,exportRuntime} from '../app/index.mjs';
export async function automaticExample(kind='mixed'){
 if(!['mixed','teleport','lift','stairs','dungeon'].includes(kind))throw new Error('Choose mixed, teleport, lift, stairs or dungeon.');
 const recipe=await createRecipe(kind==='dungeon'?'dungeon':'tiers');recipe.seed=4147868664;
 const settings={maxGroups:3,maxRoomsPerGroup:3,chance:1,travelCost:2},configure=g=>{g.rooms={...g.rooms,count:10};g.layout={...g.layout,allowDisconnected:true,preset:'branches',loopChance:0};g.search={candidates:1};};
 if(recipe.mode==='dungeon'){configure(recipe.generation);recipe.generation.layout.transports=settings;}
 else{for(const layer of recipe.generation.layers)configure(layer.request);recipe.generation.autoTransports={...settings,landingSize:1,types:kind==='mixed'?{teleport:1,lift:1,stairs:1}:{[kind]:1}};}
 const project=await generateBase(recipe),validation=await validateProject(project);if(!validation.ok)throw new Error(validation.errors.join(' '));return{recipe,project,runtime:await exportRuntime(project),validation};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const data=await automaticExample(process.argv[3]??'mixed'),directory=process.argv[2];if(directory){await mkdir(directory,{recursive:true});for(const [kind,value]of Object.entries(data))await writeFile(path.join(directory,'automatic-access-'+kind+'.json'),JSON.stringify(value,null,2)+'\n');}
 console.log(JSON.stringify({ok:data.validation.ok,mode:data.project.recipe.mode,automaticLinks:data.runtime.links.filter(t=>t.automatic).length}));
}
