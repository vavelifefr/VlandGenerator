// Portable Surface verification in a fresh owned copy. No authored-file hashes.
import assert from 'node:assert/strict';
import {appendFile,cp,lstat,mkdir,mkdtemp,readFile,readdir,realpath,rm,stat,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';

const root=fileURLToPath(new URL('../',import.meta.url));
const coastlines=process.argv.includes('--coastlines'),reportName=process.argv.includes('--biome-confirmation')?'biome-confirmation-portable':process.argv.includes('--meadow-forest')?'meadow-forest-portable':process.argv.includes('--settings')?'landscape-settings-portable':coastlines?'coastline-portable':'landscape-surface-portable',tempPrefix=coastlines?'Vland-Coast-portable-':'Vland-Surface-portable-';
const evidence=path.join(root,'evidence'),reportFile=path.join(evidence,reportName+'.json'),logFile=path.join(evidence,reportName+'.log');
await mkdir(evidence,{recursive:true});await writeFile(logFile,'Vland '+(coastlines?'Coastline':'Surface')+' portable verification\n','utf8');
const result={ok:false,startedAt:new Date().toISOString(),node:process.version,phases:[],sourceAudit:'No hashes or content audits of authored examples/fixtures; standard tests may use their static fixtures.',excluded:['projects','.run','evidence','.git'],syntheticOnly:true,cleanup:{attempted:false,removed:false}};
let temp,copy,server;
const save=()=>writeFile(reportFile,JSON.stringify(result,null,2)+'\n','utf8');
const log=async value=>{await appendFile(logFile,value+'\n','utf8');console.log(value);};
async function phase(name,fn){await log('START '+name);const start=performance.now();const value=await fn();result.phases.push({name,ok:true,elapsedMs:Math.round(performance.now()-start),...value});await save();await log('PASS '+name);return value;}
async function run(args,{cwd=copy,timeout=180000,capture=false,quiet=false}={}){
 return new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{cwd,windowsHide:true,stdio:['ignore','pipe','pipe']}),chunks=[];let timer;
 const collect=data=>{chunks.push(data);};child.stdout.on('data',collect);child.stderr.on('data',collect);child.once('error',error=>{clearTimeout(timer);reject(error);});
 child.once('close',async(code,signal)=>{clearTimeout(timer);const text=Buffer.concat(chunks).toString('utf8');try{if(!quiet)await appendFile(logFile,'\n$ node '+args.join(' ')+'\n'+text+'\n','utf8');if(code!==0)reject(Object.assign(Error('Command failed: node '+args.join(' ')+' (exit '+code+', signal '+signal+')'),{output:text.slice(-6000)}));else resolve(capture?text:{exitCode:code});}catch(error){reject(error);}});
 timer=setTimeout(()=>child.kill(),timeout);
 });
}
async function walk(folder){const found=[];for(const entry of await readdir(folder,{withFileTypes:true})){if(['examples','fixtures','tests','evidence','projects','.run','.git'].includes(entry.name))continue;const file=path.join(folder,entry.name);if(entry.isSymbolicLink())throw Error('Unexpected symbolic link in production copy: '+path.relative(copy,file));if(entry.isDirectory())found.push(...await walk(file));else if(entry.isFile())found.push(file);}return found;}
async function jsonFile(file,value){await writeFile(path.join(copy,file),JSON.stringify(value)+'\n','utf8');}
async function commandJSON(command,input,output){await run(['cli.mjs',command,input,output]);return JSON.parse(await readFile(path.join(copy,output),'utf8'));}
async function post(base,operation,value){const response=await fetch(base+'/api/'+operation,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value),signal:AbortSignal.timeout(65000)}),json=await response.json();assert.equal(response.status,200,operation+': '+JSON.stringify(json.error));return json;}
try{
 await phase('fresh-copy',async()=>{
  const parent=await realpath(tmpdir());temp=await mkdtemp(path.join(parent,tempPrefix));copy=path.join(temp,'VlandGenerator');await mkdir(copy);
  for(const entry of await readdir(root,{withFileTypes:true})){if(result.excluded.includes(entry.name))continue;assert.ok(!entry.isSymbolicLink(),'No copied root symlinks');await cp(path.join(root,entry.name),path.join(copy,entry.name),{recursive:true,dereference:false});}
  for(const excluded of result.excluded)await assert.rejects(()=>stat(path.join(copy,excluded)),{code:'ENOENT'});
  result.copy=copy;return{outsideProject:!path.resolve(copy).startsWith(path.resolve(root)+path.sep),excludedConfirmed:true};
 });
 await phase('node-full-suite',async()=>{const output=await run(['--test'],{timeout:300000,capture:true});const lines=output.split(/\r?\n/),find=name=>Number(lines.find(line=>new RegExp('(?:#|ℹ) '+name+' ').test(line))?.match(new RegExp(name+' (\\d+)'))?.[1]??NaN),tests=find('tests'),pass=find('pass'),fail=find('fail');assert.ok(Number.isFinite(tests)&&tests>0,'Observed Node test count');assert.equal(fail,0);assert.equal(pass,tests);return{tests,pass,fail};});
 await phase('production-js-and-imports',async()=>{
  const files=(await walk(copy)).filter(file=>/\.(?:mjs|js)$/.test(file));let relativeImports=0;
  for(let offset=0;offset<files.length;offset+=6)await Promise.all(files.slice(offset,offset+6).map(async file=>{
   await run(['--check',path.relative(copy,file)],{timeout:30000,quiet:true});
   const source=await readFile(file,'utf8');for(const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)['"](\.[^'"]+)['"]/g)){const target=path.resolve(path.dirname(file),match[1]);assert.ok(target.startsWith(copy+path.sep),'Import stays in copy: '+path.relative(copy,file));assert.ok((await stat(target)).isFile(),'Resolved relative import: '+path.relative(copy,target));relativeImports++;}
  }));
  return{syntaxModules:files.length,relativeImports,authoredExamplesAndFixturesRead:false};
 });
 await phase('synthetic-js-cli-http-square-hex',async()=>{
  const app=await import(pathToFileURL(path.join(copy,'app/index.mjs'))),{createVlandServer}=await import(pathToFileURL(path.join(copy,'server.mjs')));server=createVlandServer({root:copy});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port,base='http://127.0.0.1:'+port;
  const health=await fetch(base+'/api/health'),home=await fetch(base+'/'),contract=await fetch(base+'/api/contract');assert.equal(health.status,200);assert.equal(home.status,200);assert.ok((await home.text()).includes('landscape.html'));assert.ok((await contract.json()).operations.includes('landscape-rebuild'));
  await mkdir(path.join(copy,'.qa-portable'));const cases=[];
  for(const mode of ['landscape','hexlandscape']){
   const start=performance.now(),recipe=await app.createRecipe(mode);recipe.seed=82421;recipe.title='Synthetic portable Surface '+mode;Object.assign(recipe.generation,{width:50,height:50,layers:{above:0,underground:0},landscape:{structure:'coast',baseBiome:'meadow',landPercent:75,uniformity:15,biomes:[{id:'forest-one',type:'forest',percent:20},{id:'forest-two',type:'forest',percent:10},{id:'swamp-one',type:'swamp',percent:15}]}});
   const prefix='.qa-portable/'+mode,local=await app.generateBase(recipe);assert.equal((await app.validateProject(local)).ok,true);await jsonFile(prefix+'-recipe.json',recipe);
   const cli=await commandJSON('generate-base',prefix+'-recipe.json',prefix+'-project.json'),http=await post(base,'generate-base',{recipe});assert.deepEqual(cli,local,'CLI generate matches copied JS');assert.deepEqual(http,local,'HTTP generate matches copied JS');assert.equal(local.source.layers[0].board.width,50);assert.equal(local.source.layers[0].board.height,50);
   assert.equal(local.source.layers[0].fields.waterType.filter(v=>v!=='sea').length,1875);const updated=structuredClone(recipe);updated.generation.landscape.landPercent=60;updated.generation.landscape.uniformity=85;updated.generation.landscape.biomes[0].percent=25;updated.generation.landscape.biomes.push({id:'desert-one',type:'desert',percent:12.5});const job={project:local,recipe:updated};await jsonFile(prefix+'-rebuild.json',job);
   const rebuilt=await app.execute('landscape-rebuild',job),cliRebuilt=await commandJSON('landscape-rebuild',prefix+'-rebuild.json',prefix+'-rebuilt.json'),httpRebuilt=await post(base,'landscape-rebuild',job);assert.deepEqual(cliRebuilt,rebuilt,'CLI rebuild matches copied JS');assert.deepEqual(httpRebuilt,rebuilt,'HTTP rebuild matches copied JS');assert.equal(rebuilt.source.layers[0].fields.waterType.filter(v=>v!=='sea').length,1500);assert.equal(rebuilt.revision,local.revision+1);assert.deepEqual(rebuilt.recipe.generation.landscape,updated.generation.landscape);assert.equal((await app.validateProject(rebuilt)).ok,true);
   const cliValidation=JSON.parse(await run(['cli.mjs','validate',prefix+'-rebuilt.json'],{capture:true}));assert.equal(cliValidation.ok,true);assert.equal((await post(base,'validate',{project:rebuilt})).ok,true);
   const context=await app.execute('export',{project:rebuilt,format:'llm-context'});assert.deepEqual(context.project.landscape,updated.generation.landscape);cases.push({mode,size:50,topology:local.source.request.topology.kind,repeatedCards:true,decimalShare:true,generateExact:true,rebuildExact:true,validationJsCliHttp:true,contextParity:true,landPercent75to60:true,uniformity15to85:true,elapsedMs:Math.round(performance.now()-start)});
  }
  return{ephemeralPort:port,health:200,home:200,cases,liveSessionApiUsed:false,namedProjectApiUsed:false};
 });
 result.ok=true;
}catch(error){result.ok=false;result.error={message:error.message,stack:error.stack,output:error.output};await log('FAIL '+error.message);}
finally{
 if(server){server.closeIdleConnections?.();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 if(temp){
  const resolved=path.resolve(temp),parent=await realpath(tmpdir()),info=await lstat(resolved);assert.equal(path.dirname(resolved).toLowerCase(),parent.toLowerCase(),'Owned temp stays directly below system temp');assert.ok(path.basename(resolved).startsWith(tempPrefix));assert.ok(!info.isSymbolicLink(),'Cleanup target is not a symlink');assert.equal((await realpath(resolved)).toLowerCase(),resolved.toLowerCase(),'Cleanup target realpath matches owned root');
  result.cleanup.attempted=true;try{await rm(resolved,{recursive:true,force:true});result.cleanup.removed=true;}catch(error){result.ok=false;result.cleanup.error=error.message;await log('CLEANUP FAILED '+error.message);}
 }
 result.finishedAt=new Date().toISOString();await save();await log(JSON.stringify({ok:result.ok,phases:result.phases,cleanup:result.cleanup,error:result.error?.message}));
}
if(!result.ok)process.exitCode=1;
