import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {hash} from '../content/index.mjs';
const base=process.argv[2]??'http://127.0.0.1:9670',jobs=new URL('../.run/auto-transport-jobs/',import.meta.url);await mkdir(jobs,{recursive:true});
const post=async(op,body)=>{const r=await fetch(base+'/api/'+op,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),data=await r.json();assert.ok(r.ok,JSON.stringify(data));return data;};
const contract=await(await fetch(base+'/api/contract')).json();assert.equal(contract.automaticTransports.maxGroupsPerLayer,4);const rows=[];
for(const kind of ['dungeon','teleport','lift','stairs','mixed']){
 const sample=JSON.parse(await readFile(new URL('../evidence/auto-transports-'+kind+'-project.json',import.meta.url),'utf8')),project=await post('generate-base',{recipe:sample.recipe});assert.equal(hash(project.source),hash(sample.source));const report=await post('validate',{project});assert.ok(report.ok);const runtime=await post('runtime',{project});assert.ok(runtime.links.filter(t=>t.automatic).length);assert.ok(runtime.links.every(t=>[t.from,t.to].every(p=>Number.isInteger(p.x)&&Number.isInteger(p.y)&&p.layerId)));
 if(['dungeon','stairs'].includes(kind)){const file=new URL(kind+'-recipe.json',jobs);await writeFile(file,JSON.stringify(sample.recipe));const cli=JSON.parse(execFileSync(process.execPath,['cli.mjs','generate-base',fileURLToPath(file)],{encoding:'utf8',maxBuffer:12*1024*1024}));assert.equal(cli.checksum,project.checksum);await writeFile(new URL(kind+'-project.json',jobs),JSON.stringify(cli));const checked=JSON.parse(execFileSync(process.execPath,['cli.mjs','validate',fileURLToPath(new URL(kind+'-project.json',jobs))],{encoding:'utf8'}));assert.ok(checked.ok);}
 rows.push({kind,mode:project.recipe.mode,http:true,links:runtime.links.filter(t=>t.automatic).length,normalizedEndpoints:true,cli:['dungeon','stairs'].includes(kind)});
}
const invalid=JSON.parse(await readFile(new URL('../examples/automatic-access-recipe.json',import.meta.url),'utf8'));invalid.generation.autoTransports.types={teleport:0,lift:0,stairs:0};const rejected=await fetch(base+'/api/generate-base',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({recipe:invalid})});assert.equal(rejected.status,400);
const result={ok:true,httpCases:rows.length,cliCases:2,invalidWeightsRejected:true,contractDiscovery:true,rows};await writeFile(new URL('../evidence/auto-transports-http-cli.json',import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,rows:undefined}));
