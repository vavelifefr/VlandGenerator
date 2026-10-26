import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {linkedExample} from '../examples/linked-transports.mjs';
import {hash} from '../content/index.mjs';
const base=process.argv[2]??'http://127.0.0.1:9670',evidence=new URL('../evidence/',import.meta.url),jobs=new URL('../.run/map-linking-cli/',import.meta.url);await mkdir(jobs,{recursive:true});
const post=async(op,input)=>{const r=await fetch(base+'/api/'+op,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}),v=await r.json();if(!r.ok)throw new Error(JSON.stringify(v));return v;};
const contract=await(await fetch(base+'/api/contract')).json();assert.ok(contract.operations.includes('transition-resolve'));assert.ok(contract.editOperations.includes('transport.connect'));
const browser=JSON.parse(await readFile(new URL('map-linking-browser.json',evidence),'utf8')),rows=[];assert.ok(browser.ok&&browser.complete);assert.equal(browser.results.length,30);
for(const id of browser.savedIds){const response=await fetch(base+'/api/projects/'+id);assert.ok(response.ok);const project=(await response.json()).project,validation=await post('validate',{project});assert.ok(validation.ok,validation.errors.join(' '));assert.equal(project.transitions.length,3);assert.ok(validation.transitions.reports.every(r=>r.ok));const runtime=await post('runtime',{project});assert.equal(runtime.links.filter(t=>t.origin==='editor').length,3);
 if(!rows.some(r=>r.mode===project.recipe.mode)){await writeFile(new URL('map-linking-'+project.recipe.mode+'-project.json',evidence),JSON.stringify(project));await writeFile(new URL('map-linking-'+project.recipe.mode+'-runtime.json',evidence),JSON.stringify(runtime));}
 rows.push({mode:project.recipe.mode,id,links:3,validated:true,runtime:true});
}
const sample=await linkedExample(),sourceHash=hash(sample.project.source),link=sample.project.transitions[0],operation={type:'transport.connect',fromSourceId:link.fromSourceId,toSourceId:link.toSourceId,bidirectional:false,travelCost:4},project=await post('edit',{project:sample.project,operation});assert.equal(hash(project.source),sourceHash);const runtime=await post('runtime',{project}),plan=await post('runtime-plan',{scene:runtime.scene,state:runtime.initialState}),state=await post('runtime-commit',{scene:runtime.scene,state:runtime.initialState,plan});
const job={runtime,state,linkId:link.id,fromSourceId:link.fromSourceId},hop=await post('transition-resolve',job);assert.ok(hop.ok);assert.equal(hop.travelCost,4);assert.equal((await post('transition-resolve',{...job,fromSourceId:link.toSourceId})).code,'DIRECTION');assert.equal((await post('transition-resolve',{...job,state:runtime.initialState})).code,'NOT_READY');
const disabled=await post('runtime-update',{scene:runtime.scene,state,operation:{disabledSourceIds:[link.toSourceId]}});assert.equal((await post('transition-resolve',{...job,state:disabled})).code,'NOT_READY');
await writeFile(new URL('resolve-job.json',jobs),JSON.stringify(job));await writeFile(new URL('edit-job.json',jobs),JSON.stringify({project:sample.project,operation}));
const cliResolve=JSON.parse(execFileSync(process.execPath,['cli.mjs','transition-resolve',fileURLToPath(new URL('resolve-job.json',jobs))],{encoding:'utf8'}));assert.deepEqual(cliResolve,hop);
const cliEdited=JSON.parse(execFileSync(process.execPath,['cli.mjs','edit',fileURLToPath(new URL('edit-job.json',jobs))],{encoding:'utf8'}));assert.deepEqual(cliEdited,project);
const result={ok:true,uiCases:browser.results.length,httpProjects:rows.length,httpModes:5,authorLinks:rows.length*3,httpEdit:true,httpResolve:true,cliEdit:true,cliResolve:true,directionChecked:true,notReadyChecked:true,disabledChecked:true,geometryUnchanged:true,rows};await writeFile(new URL('map-linking-http-cli.json',evidence),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,rows:undefined}));
