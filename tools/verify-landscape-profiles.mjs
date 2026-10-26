// Current profile matrix with an isolated stateless HTTP server and CLI files.
// Does not read/write the user's session or named projects.
import assert from 'node:assert/strict';
import {writeFile,readFile,mkdtemp,realpath,rm,access} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRecipe,normalizeRecipe,generateBase,validateProject,importProject,exportRuntime,execute} from '../app/index.mjs';
import {seal} from '../app/project.mjs';
import {hash} from '../content/common.mjs';
import {normalizeAtlasRequest} from '../engine/api/atlas-catalog.mjs';
import {LANDSCAPE_STRUCTURES,LANDSCAPE_BIOMES} from '../engine/core/landscape-profile.mjs';
import {gridNeighbors} from '../engine/core/topology.mjs';
import {createVlandServer} from '../server.mjs';

const modes=['landscape','hexlandscape'],structures=Object.keys(LANDSCAPE_STRUCTURES),biomes=Object.keys(LANDSCAPE_BIOMES),rows=[],interfaces=[],schemaDocuments=[];
const folder=await mkdtemp(path.join(tmpdir(),'Vland landscape profile QA ')),server=createVlandServer({root:folder}),cli=fileURLToPath(new URL('../cli.mjs',import.meta.url));let listening=false;
const output=path.join(folder,'preserved.json'),initial='Existing output\n';
async function recipe(mode,structure,baseBiome){const r=await createRecipe(mode);Object.assign(r.generation,{width:32,height:32,layers:{above:0,underground:0},landscape:{structure,baseBiome}});return r;}
function terrainSummary(project){
 const layer=project.source.layers.find(l=>l.id==='surface'),values=layer.fields.heightmap,w=layer.board.width,h=layer.board.height,sea=project.source.hydrology.seaLevel;
 assert.ok(values.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
 const seen=new Uint8Array(values.length),groups=[];for(let i=0;i<values.length;i++)if(values[i]>sea&&!seen[i]){const q=[i];seen[i]=1;for(let j=0;j<q.length;j++)for(const n of gridNeighbors(q[j],w,h,layer.topology))if(values[n]>sea&&!seen[n]){seen[n]=1;q.push(n);}groups.push(q.length);}
 const edges=[values.slice(0,w),values.slice(-w),values.filter((_,i)=>i%w===0),values.filter((_,i)=>i%w===w-1)],shape=project.recipe.generation.landscape.structure;
 if(shape==='land'){assert.ok(values.every(v=>v>sea));assert.equal(groups.length,1);}
 if(shape==='coast'){assert.equal(groups.length,1);assert.ok(edges.some(e=>e.every(v=>v>sea)));assert.ok(edges.some(e=>e.every(v=>v<sea)));}
 if(shape==='islands'){assert.equal(groups.length,3);assert.ok(edges.flat().every(v=>v<sea));}
 if(shape==='continent'){assert.equal(groups.length,1);assert.ok(groups[0]>values.length*.3);assert.ok(edges.flat().every(v=>v<sea));}
 assert.ok(layer.fields.flowTo.every((to,i)=>to<0||layer.fields.flowRank[to]<layer.fields.flowRank[i]));
 return{rawLandCells:values.filter(v=>v>sea).length,rawLandRegions:groups.length,seaCells:layer.fields.waterType.filter(v=>v==='sea').length,biomes:[...new Set(layer.fields.biome)]};
}
try{
 for(let attempt=0;attempt<16;attempt++){try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(20000+Math.floor(Math.random()*40000),'127.0.0.1',()=>{server.removeListener('error',reject);resolve();});});listening=true;break;}catch(e){if(e.code!=='EADDRINUSE')throw e;}}assert.ok(listening,'Own QA server started');
 const base='http://127.0.0.1:'+server.address().port,post=async(operation,input)=>{const response=await fetch(base+'/api/'+operation,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});assert.ok(response.ok,await response.clone().text());return response.json();};
 const cliCall=async(operation,job,{preserve=false}={})=>{const file=path.join(folder,'job.json');await writeFile(file,JSON.stringify(job),'utf8');const result=spawnSync(process.execPath,[cli,operation,file,...(preserve?[output]:[])],{encoding:'utf8',maxBuffer:16*1024*1024});if(result.error)throw result.error;return result;};
 for(const mode of modes)for(const structure of structures)for(const baseBiome of biomes){
  const r=await recipe(mode,structure,baseBiome),before=hash(r),project=await generateBase(r),profile={structure,baseBiome};assert.equal(hash(r),before);assert.deepEqual(project.source.request.landscape,profile);assert.deepEqual(normalizeAtlasRequest(project.source.request),project.source.request);
  assert.ok((await validateProject(project)).ok,mode+' '+structure+' '+baseBiome);assert.deepEqual(await importProject(JSON.stringify(project)),project);
  const runtime=await exportRuntime(project),context=await execute('export',{project,format:'llm-context'}),exported=await execute('export',{project,format:'recipe'});assert.deepEqual(normalizeRecipe(JSON.stringify(exported)),r);assert.deepEqual(context.project.landscape,profile);assert.equal(context.validation.ok,true);assert.equal(runtime.mode,mode);assert.deepEqual(runtime.initialState.entities,[]);assert.ok(runtime.scene.map.layers.every(l=>l.topology.kind===(mode==='hexlandscape'?'hex':'square')));
  schemaDocuments.push({label:mode+' '+structure+' '+baseBiome+' recipe',schema:'schemas/recipe.schema.json',value:r});
  const summary=terrainSummary(project),representative=structure===structures[biomes.indexOf(baseBiome)%structures.length];assert.ok(summary.biomes.includes(LANDSCAPE_BIOMES[baseBiome].biome),'Requested base biome missing: '+mode+' '+structure+' '+baseBiome);
  rows.push({mode,structure,baseBiome,size:32,validated:true,jsonRoundtrip:true,normalizedRequestIdempotent:true,...summary});
  if(representative){
   assert.equal(hash(await generateBase(r)),hash(project));assert.equal(hash(await post('generate-base',{recipe:r})),hash(project));
   const generated=await cliCall('generate-base',r);assert.equal(generated.status,0,generated.stderr);assert.equal(hash(JSON.parse(generated.stdout)),hash(project));
   for(const[format,expected]of [['project',project],['recipe',r],['runtime',runtime],['llm-context',context]])assert.equal(hash(await post('export',{project,format})),hash(expected));
   for(const[format,expected]of [['recipe',r],['runtime',runtime],['llm-context',context]]){const exported=await cliCall('export',{project,format});assert.equal(exported.status,0,exported.stderr);assert.equal(hash(JSON.parse(exported.stdout)),hash(expected));}
   schemaDocuments.push(...[['project',project],['runtime',runtime],['context',context]].map(([name,value])=>({label:mode+' '+structure+' '+baseBiome+' '+name,schema:'schemas/'+(name==='context'?'project-context':name)+'.schema.json',value})));
   interfaces.push({mode,structure,baseBiome,generateJsHttpCliExact:true,exportHttpFormats:4,exportCliFormats:3,inputUnchanged:true});
  }
 }
 await writeFile(output,initial,'utf8');let invalidProfiles=0;
 for(const mode of modes)for(const profile of [null,{},[],{structure:'land'},{structure:'ocean',baseBiome:'meadow'},{structure:'land',baseBiome:'meadow',extra:1}]){
  const r=await recipe(mode,'land','meadow');r.generation.landscape=profile;await assert.rejects(()=>generateBase(r));const response=await fetch(base+'/api/generate-base',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({recipe:r})});assert.equal(response.status,400);const error=(await response.json()).error,result=await cliCall('generate-base',r,{preserve:true});assert.equal(result.status,1);assert.equal(result.stdout,'');assert.equal(JSON.parse(result.stderr).error.code,error.code);assert.equal(await readFile(output,'utf8'),initial);invalidProfiles++;
 }
 let staleProfiles=0;
 for(const mode of modes){const project=await generateBase(await recipe(mode,'land','meadow')),changed=seal({...project,recipe:{...project.recipe,generation:{...project.recipe.generation,landscape:{structure:'coast',baseBiome:'desert'}}}});await assert.rejects(()=>exportRuntime(changed),{code:'INVALID_MAP'});const response=await fetch(base+'/api/runtime',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project:changed})});assert.equal(response.status,400);assert.equal((await response.json()).error.code,'INVALID_MAP');const cliResult=await cliCall('runtime',{project:changed},{preserve:true});assert.equal(cliResult.status,1);assert.equal(JSON.parse(cliResult.stderr).error.code,'INVALID_MAP');assert.equal(await readFile(output,'utf8'),initial);staleProfiles++;}
 await assert.rejects(access(path.join(folder,'.run/working-session.json')));
 const result={ok:true,modes,structures:structures.length,baseBiomes:biomes.length,jsMaps:rows.length,httpCliCases:interfaces.length,invalidProfileJsHttpCliCases:invalidProfiles,staleProfileJsHttpCliCases:staleProfiles,existingCliOutputPreserved:true,sessionApiUsed:false,namedProjectsUsed:false,externalAiCalls:0,rows,interfaces};
 await writeFile(new URL('../evidence/landscape-profile-schema-data.json',import.meta.url),JSON.stringify({modes,documents:schemaDocuments})+'\n','utf8');await writeFile(new URL('../evidence/landscape-profiles.json',import.meta.url),JSON.stringify(result,null,2)+'\n','utf8');console.log(JSON.stringify({...result,rows:undefined,interfaces:undefined}));
}catch(error){await writeFile(new URL('../evidence/landscape-profiles.json',import.meta.url),JSON.stringify({ok:false,message:error.message,rows,interfaces},null,2)+'\n','utf8');throw error;
}finally{if(listening){server.closeAllConnections();await new Promise(r=>server.close(r));}const target=await realpath(folder),parent=await realpath(tmpdir());assert.equal(path.dirname(target),parent);assert.ok(path.basename(target).startsWith('Vland landscape profile QA '));await rm(target,{recursive:true,force:true});}
