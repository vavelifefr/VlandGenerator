// Synthetic JS/HTTP/CLI and offline JSON Schema QA; never live sessions/projects.
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createRecipe,generateBase,execute} from '../app/index.mjs';
import {createVlandServer} from '../server.mjs';
import {hash} from '../content/common.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),prefix='Vland-Settings-interface-',folder=await mkdtemp(path.join(tmpdir(),prefix));
const server=createVlandServer({root:folder}),rows=[],documents=[],negative=[],report={ok:false,syntheticOnly:true,liveSessionApiUsed:false,namedProjectsUsed:false,rows,negative};let listening=false;
const artifact=name=>path.join(root,'evidence','landscape-settings-'+name);
const post=async(operation,input)=>{const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/'+operation,{method:'POST',headers:{'Content-Type':'application/json',Connection:'close'},body:JSON.stringify(input),signal:AbortSignal.timeout(90000)});return{status:response.status,value:await response.json()};};
const cli=async(command,input)=>{const src=path.join(folder,'input.json'),dst=path.join(folder,'output.json');await writeFile(src,JSON.stringify(input));const result=spawnSync(process.execPath,[path.join(root,'cli.mjs'),command,src,dst],{encoding:'utf8',timeout:120000,maxBuffer:4096});assert.equal(result.status,0,result.stderr||result.stdout);return JSON.parse(await readFile(dst,'utf8'));};
try{
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});listening=true;
 for(const mode of ['landscape','hexlandscape']){
  const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/defaults?mode='+mode);assert.equal(response.status,200);const defaults=await response.json();assert.deepEqual(defaults,await createRecipe(mode));assert.equal(defaults.generation.width,128);
  for(const size of [50,300])for(const structure of ['coast','islands','continent']){
   const recipe=await createRecipe(mode);recipe.seed=870414469;Object.assign(recipe.generation,{width:size,height:size,landscape:{structure,baseBiome:'meadow',biomes:[{id:'forest-one',type:'forest',percent:20},{id:'forest-two',type:'forest',percent:15},{id:'mountains-one',type:'mountains',percent:25}],landPercent:75,uniformity:size===50?15:85}});
   const project=await generateBase(recipe),layer=project.source.layers[0];assert.equal(layer.fields.waterType.filter(v=>v!=='sea').length,Math.round(size*size*.75));assert.equal((await execute('validate',{project})).ok,true);
   const row={mode,size,structure,landPercent:75,uniformity:recipe.generation.landscape.uniformity,exactQuota:true,valid:true};
   if(size===300){documents.push({label:mode+'-'+structure+' recipe300',schema:'schemas/recipe.schema.json',value:project.recipe},{label:mode+'-'+structure+' native300',schema:'engine/schemas/atlas.schema.json',value:project.source});}
   if(structure==='coast'){
    const http=await post('generate-base',{recipe});assert.equal(http.status,200);assert.equal(hash(http.value),hash(project));assert.equal(hash(await cli('generate-base',recipe)),hash(project));
    const context=await execute('export',{project,format:'llm-context'});assert.deepEqual(context.project.landscape,recipe.generation.landscape);
    const runtime=await execute('export',{project,format:'runtime'});assert.equal(runtime.validation.ok,true);assert.deepEqual(runtime.initialState.entities,[]);
    const next=structuredClone(recipe);next.generation.landscape.landPercent=60;next.generation.landscape.uniformity=25;const job={project,recipe:next},rebuilt=await execute('landscape-rebuild',job),httpRebuilt=await post('landscape-rebuild',job);assert.equal(httpRebuilt.status,200);assert.equal(hash(httpRebuilt.value),hash(rebuilt));assert.equal(hash(await cli('landscape-rebuild',job)),hash(rebuilt));assert.equal(rebuilt.revision,project.revision+1);assert.equal(rebuilt.source.layers[0].fields.waterType.filter(v=>v!=='sea').length,Math.round(size*size*.6));
    Object.assign(row,{jsHttpCliExact:true,rebuildExact:true,llmContext:true,runtime:true});
    if(size===300)documents.push({label:mode+' context300',schema:'schemas/project-context.schema.json',value:context},{label:mode+' rebuild300',schema:'schemas/landscape-rebuild-request.schema.json',value:job});
   }
   rows.push(row);console.log(JSON.stringify(row));
  }
  for(const [field,value]of [['landPercent',0],['landPercent',100],['landPercent',75.5],['uniformity',-1],['uniformity',101],['uniformity','50']]){const recipe=await createRecipe(mode);recipe.generation.landscape[field]=value;const result=await post('generate-base',{recipe});assert.equal(result.status,400);assert.ok(result.value.error);negative.push({mode,field,value,rejected:true});}
 }
 const python=process.env.VLAND_SCHEMA_PYTHON;assert.ok(python,'Existing external JSON Schema QA interpreter required');
 const input=path.join(folder,'schema-data.json'),schemaReport=artifact('real-schemas.json');await writeFile(input,JSON.stringify({modes:['landscape','hexlandscape'],documents}));
 const qa=spawnSync(python,[path.join(root,'tools/verify-evolution-schemas.py'),'--data',input,'--report',schemaReport],{encoding:'utf8',timeout:300000,maxBuffer:1024*1024,env:{...process.env,PYTHONUTF8:'1'}});assert.equal(qa.status,0,qa.stderr||qa.stdout);report.schema=JSON.parse(await readFile(schemaReport,'utf8'));assert.equal(report.schema.ok,true);report.ok=true;
}catch(error){report.error={message:error.message,stack:error.stack};process.exitCode=1;}
finally{
 if(listening){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 const target=await realpath(folder),temporary=await realpath(tmpdir());assert.equal(path.dirname(target).toLowerCase(),temporary.toLowerCase());assert.ok(path.basename(target).startsWith(prefix));await rm(target,{recursive:true,force:true});report.qaCopyRemoved=true;report.finishedAt=new Date().toISOString();await writeFile(artifact('interfaces.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({ok:report.ok,cases:rows.length,negative:negative.length,schemaDocuments:report.schema?.documents,error:report.error?.message}));
}
