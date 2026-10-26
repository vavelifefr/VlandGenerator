import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {API_CONTRACT,execute,createRecipe,generateBase,recipeFromProject,editProject} from '../app/index.mjs';
import {createVlandServer} from '../server.mjs';

const cli=fileURLToPath(new URL('../cli.mjs',import.meta.url));
async function isolated(t){
 const temporary=await realpath(tmpdir()),folder=await mkdtemp(path.join(temporary,'Vland-rebuild-operation-')),server=createVlandServer({root:folder});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));const resolved=await realpath(folder);assert.equal(path.dirname(resolved),temporary);assert.ok(path.basename(resolved).startsWith('Vland-rebuild-operation-'));await rm(resolved,{recursive:true});});
 return{folder,base:'http://127.0.0.1:'+server.address().port};
}
const post=(base,job)=>fetch(base+'/api/landscape-rebuild',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(job)});

test('landscape-rebuild has one explicit public JS, HTTP and CLI job contract',async t=>{
 assert.ok(API_CONTRACT.operations.includes('landscape-rebuild'));const spec=API_CONTRACT.operationDetails['landscape-rebuild'];
 assert.deepEqual(spec.required,['project','recipe']);assert.deepEqual(spec.optional,[]);assert.equal(spec.path,'/api/landscape-rebuild');assert.equal(spec.requestSchema,'/schemas/landscape-rebuild-request.schema.json');
 const {base,folder}=await isolated(t),output=path.join(folder,'preserve.json'),jobFile=path.join(folder,'job.json');
 await writeFile(output,'Existing output\n','utf8');
 for(const [job,code]of [[{unexpected:true},'UNKNOWN_FIELD'],[{},'INVALID_INPUT'],[{project:{}},'INVALID_INPUT']]){
  await assert.rejects(execute('landscape-rebuild',job),error=>error.code===code);
  const response=await post(base,job);assert.equal(response.status,400);assert.equal((await response.json()).error.code,code);
  await writeFile(jobFile,JSON.stringify(job),'utf8');const command=spawnSync(process.execPath,[cli,'landscape-rebuild',jobFile,output],{encoding:'utf8'});
  assert.equal(command.status,1);assert.equal(JSON.parse(command.stderr).error.code,code);assert.equal(command.stdout,'');assert.equal(await readFile(output,'utf8'),'Existing output\n');
 }
 assert.match(spawnSync(process.execPath,[cli,'help'],{encoding:'utf8'}).stdout,/landscape-rebuild/);
});

for(const mode of ['landscape','hexlandscape'])test(mode+': rebuild results agree across JS, HTTP and CLI',async t=>{
 const {base,folder}=await isolated(t),initial=await createRecipe(mode);Object.assign(initial.generation,{width:32,height:32,layers:{above:0,underground:0}});
 let project=await generateBase(initial);project=await editProject(project,{type:'field',layerId:project.source.layers[0].id,x:1,y:1,field:'fertility',value:.33});
 const recipe=recipeFromProject(project);recipe.generation.landscape.baseBiome='forest';const job={project,recipe},expected=await execute('landscape-rebuild',job);
 const response=await post(base,job);assert.equal(response.status,200);assert.deepEqual(await response.json(),expected);
 const input=path.join(folder,'job.json'),output=path.join(folder,'project.json');await writeFile(input,JSON.stringify(job),'utf8');
 const command=spawnSync(process.execPath,[cli,'landscape-rebuild',input,output],{encoding:'utf8',timeout:30000});assert.equal(command.status,0,command.stderr);assert.deepEqual(JSON.parse(await readFile(output,'utf8')),expected);
 assert.deepEqual(expected.edits,project.edits);assert.equal(expected.revision,project.revision+1);
});
