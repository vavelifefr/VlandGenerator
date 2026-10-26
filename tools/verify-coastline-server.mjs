// Read-only delivery checks plus fresh in-memory synthetic jobs. No session or
// named-project endpoints; no start/stop and no user browser interaction.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createRecipe,generateBase} from '../app/index.mjs';
import {hash} from '../content/common.mjs';
const base='http://127.0.0.1:9670',result={ok:false,started:new Date().toISOString(),static:[],cases:[],sessionApiUsed:false,namedProjectsUsed:false,restart:false};
async function get(url){return fetch(base+url,{signal:AbortSignal.timeout(10000)});}
try{
 const health=await get('/api/health');assert.equal(health.status,200);assert.equal((await health.json()).ok,true);result.health=200;
 for(const file of ['Web/index.html','Web/HTML/landscape.html','Web/HTML/hexlandscape.html','Web/HTML/chunk.html','Web/HTML/ui/controls.mjs','Web/HTML/ui/workbench.mjs','engine/core/landscape-profile.mjs']){const response=await get('/'+file);assert.equal(response.status,200,file);assert.equal(await response.text(),await readFile(new URL('../'+file,import.meta.url),'utf8'),file+' current served bytes');result.static.push({file,status:200,current:true});}
 assert.equal((await get('/Web/HTML/caves.html')).status,404);result.oldPage=404;
 const defaults=await get('/api/defaults?mode=caves');assert.equal(defaults.status,200);assert.equal((await defaults.json()).title,'Чанк');result.chunkDefaultsCurrent=true;
 for(const mode of ['landscape','hexlandscape']){const recipe=await createRecipe(mode);recipe.seed=7319;Object.assign(recipe.generation,{width:50,height:50,layers:{above:0,underground:0},landscape:{structure:'coast',baseBiome:'meadow',biomes:[{id:'forest',type:'forest',percent:20}]}});const local=await generateBase(recipe),response=await fetch(base+'/api/generate-base',{method:'POST',headers:{'Content-Type':'application/json',Connection:'close'},body:JSON.stringify({recipe}),signal:AbortSignal.timeout(65000)});assert.equal(response.status,200);const served=await response.json();assert.equal(hash(served),hash(local),'Main server uses current '+mode+' generation');result.cases.push({mode,size:50,checksum:served.checksum,jsHttpExact:true});}
 result.ok=true;
}catch(error){result.error=error.message;process.exitCode=1;}
finally{result.finished=new Date().toISOString();await writeFile(new URL('../evidence/coastline-server.json',import.meta.url),JSON.stringify(result,null,2)+'\n','utf8');console.log(JSON.stringify(result));}
