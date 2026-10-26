// Stateless verification of the existing server. Never launches it or uses saved projects/session APIs.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createRecipe,generateBase,execute} from '../app/index.mjs';
const reportName=process.argv.includes('--island-natural')?'island-natural-main':'sea-erosion-main',base='http://127.0.0.1:9670',report={ok:false,stateless:true,restart:false,files:[],cases:[]};
try{
 const health=await fetch(base+'/api/health',{signal:AbortSignal.timeout(5000)});assert.equal(health.status,200);assert.equal((await health.json()).ok,true);report.health=200;
 for(const file of ['Web/HTML/landscape.html','Web/HTML/hexlandscape.html','Web/HTML/ui/controls.mjs','Web/HTML/guide.html','Web/HTML/llm.html','engine/core/landscape-profile.mjs']){
  const response=await fetch(base+'/'+file,{signal:AbortSignal.timeout(5000)});assert.equal(response.status,200);assert.equal(await response.text(),await readFile(new URL('../'+file,import.meta.url),'utf8'),file+' current');report.files.push({file,status:200,current:true});
 }
 const post=async(operation,value,status=200)=>{const r=await fetch(base+'/api/'+operation,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value),signal:AbortSignal.timeout(65000)});assert.equal(r.status,status);return r.json();};
 for(const mode of ['landscape','hexlandscape'])for(const structure of ['coast','islands']){
  const recipe=await createRecipe(mode);Object.assign(recipe.generation,{width:100,height:100,landscape:{structure,baseBiome:'meadow',landPercent:75,coastErosion:100,uniformity:50,biomes:[]}});
  const local=await generateBase(recipe),remote=await post('generate-base',{recipe});assert.deepEqual(remote,local,'current main generation '+mode+'/'+structure);
  const job={project:local,format:'llm-context'};assert.deepEqual(await post('export',job),await execute('export',job));
  const invalid=structuredClone(recipe);invalid.generation.landscape.coastErosion=101;await post('generate-base',{recipe:invalid},400);
  report.cases.push({mode,structure,size:100,erosion:100,generationExact:true,contextExact:true,invalidErosionRejected:true,checksum:local.checksum});
 }
 report.ok=true;
}catch(error){report.error=error.message;report.cause=error.cause?.code??error.code;}finally{await writeFile(new URL('../evidence/'+reportName+'.json',import.meta.url),JSON.stringify(report,null,2)+'\n','utf8');console.log(JSON.stringify(report));}
if(!report.ok)process.exitCode=1;
