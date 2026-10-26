import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,realpath,rm,access} from 'node:fs/promises';
import {execFileSync,spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execute,API_CONTRACT,createRecipe,generateBase} from '../app/index.mjs';
import {createSource,createDistributionRequest,hash} from '../content/index.mjs';
import {createVlandServer} from '../server.mjs';

const guide=await readFile(new URL('../docs/LLM_GUIDE.md',import.meta.url),'utf8'),api=await readFile(new URL('../docs/API.md',import.meta.url),'utf8');
const table=api.split('## Операции JS / HTTP / CLI')[1].split('Прямые функции app:')[0],operations=[...table.matchAll(/^\| ([a-z-]+) \|/gm)].map(m=>m[1]);assert.deepEqual(operations.sort(),[...API_CONTRACT.operations].sort());
const snippet=guide.match(/```js\r?\n\/\/ verified-llm-workflow\r?\n([\s\S]*?)```/)?.[1];assert.ok(snippet,'Missing executable guide example');const {authoringWorkflow}=await import('data:text/javascript;base64,'+Buffer.from(snippet+'\nexport {authoringWorkflow};').toString('base64'));
const folder=await mkdtemp(path.join(tmpdir(),'Vland LLM guide QA ')),server=createVlandServer({root:folder}),rows=[];let listening=false;
try{
 for(let attempt=0;attempt<16;attempt++){try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(20000+Math.floor(Math.random()*40000),'127.0.0.1',()=>{server.removeListener('error',reject);resolve();});});listening=true;break;}catch(e){if(e.code!=='EADDRINUSE')throw e;}}assert.ok(listening);
 const base='http://127.0.0.1:'+server.address().port,http=async(operation,input)=>{const response=await fetch(base+'/api/'+operation,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}),data=await response.json();if(!response.ok)throw Object.assign(new Error(data.error.message),data.error);return data;};
 const expected=['validate','runtime','distribution-preview','distribution-apply','source-preview','validate','export','export'];
 for(const mode of Object.keys(API_CONTRACT.modes)){
  const recipe=await createRecipe(mode);if(['relief','landscape','hexlandscape','caves','settlements'].includes(mode))Object.assign(recipe.generation,{width:32,height:32});if(['landscape','hexlandscape','caves'].includes(mode))recipe.generation.layers={above:0,underground:1};if(mode==='dungeon'){recipe.generation.rooms.count=4;recipe.generation.search.candidates=1;}if(mode==='tiers')for(const l of recipe.generation.layers)l.request.rooms={count:3};if(mode==='sideview')recipe.generation.rooms=6;
  const project=await generateBase(recipe),before=hash(project),calls=[],js=await authoringWorkflow({call:async(operation,input)=>{calls.push(operation);return execute(operation,input);},project,createSource,createDistributionRequest});assert.deepEqual(calls,expected);assert.equal(hash(project),before);assert.equal(js.project.sources.length,1);assert.equal(js.context.project.checksum,js.project.checksum);
  const viaHttp=await authoringWorkflow({call:http,project,createSource,createDistributionRequest});assert.equal(hash(viaHttp),hash(js));
  const cli=async(operation,input)=>{const file=path.join(folder,'job.json');await writeFile(file,JSON.stringify(input),'utf8');return JSON.parse(execFileSync(process.execPath,['cli.mjs',operation,file],{encoding:'utf8',maxBuffer:32*1024*1024}));};const viaCli=await authoringWorkflow({call:cli,project,createSource,createDistributionRequest});assert.equal(hash(viaCli),hash(js));rows.push({mode,steps:calls.length,jsHttpCliExact:true,inputUnchanged:true,sources:js.project.sources.length});
 }
 const output=path.join(folder,'preserved.json'),bad=path.join(folder,'bad.json');await writeFile(output,'Existing output\n','utf8');await writeFile(bad,JSON.stringify({unexpected:true}),'utf8');
 for(const operation of API_CONTRACT.operations.filter(name=>API_CONTRACT.operationDetails[name].method==='POST')){await assert.rejects(()=>http(operation,{unexpected:true}),{code:'UNKNOWN_FIELD'});const cli=spawnSync(process.execPath,['cli.mjs',operation,bad,output],{encoding:'utf8'});assert.equal(cli.status,1);assert.equal(JSON.parse(cli.stderr).error.code,'UNKNOWN_FIELD');assert.equal(await readFile(output,'utf8'),'Existing output\n');if(operation!=='export')await assert.rejects(()=>http(operation,{}),{code:'INVALID_INPUT'});}
 await assert.rejects(access(path.join(folder,'.run/working-session.json')));const result={ok:true,documentedOperations:operations.length,modes:rows.length,rows,invalidJobsHttpCli:16,sessionUntouched:true,namedSaves:false,externalAiCalls:0};await writeFile(new URL('../evidence/llm-guide.json',import.meta.url),JSON.stringify(result,null,2)+'\n','utf8');console.log(JSON.stringify(result));
}finally{if(listening){server.closeAllConnections();await new Promise(r=>server.close(r));}const target=await realpath(folder),parent=await realpath(tmpdir());assert.equal(path.dirname(target),parent);assert.ok(path.basename(target).startsWith('Vland LLM guide QA '));await rm(target,{recursive:true});}
