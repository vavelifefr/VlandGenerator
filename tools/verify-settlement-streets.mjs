import assert from 'node:assert/strict';
import {writeFile,readFile,mkdtemp,rm,realpath} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {generateSettlement,validateSettlement} from '../engine/api/settlements.mjs';
import {generateAtlas} from '../engine/api/atlas.mjs';
import {createRecipe,generateBase,exportRuntime} from '../app/index.mjs';
import {hash} from '../content/common.mjs';
const rows=[],started=Date.now(),districts=process.argv.includes('--districts');
for(const seed of [7,42,71,713])for(const type of ['town','village'])for(const pattern of ['organic','grid','radial','ribbon'])for(const streetWidth of [1,3,4]){
 const city=generateSettlement({seed,type,pattern,streetWidth,width:48,height:40,buildingDensity:.9,terrain:{water:.35,relief:.9},...(districts?{neighborhoods:{minArea:16,maxArea:80},quarters:{minArea:80,maxArea:320}}:{})}),fields=city.atlas.layers[0].fields,base=generateAtlas(city.atlas.request).layers[0].fields;
 assert.ok(validateSettlement(city).ok);for(const n of city.neighborhoods)assert.ok(n.area>=city.request.neighborhoods.minArea&&n.area<=city.request.neighborhoods.maxArea);for(const q of city.quarters)assert.ok(q.area>=city.request.quarters.minArea&&q.area<=city.request.quarters.maxArea);
 for(let i=0;i<fields.road.length;i++)if(fields.road[i]){assert.notEqual(base.biome[i],'cliffs');assert.equal(base.obstacle[i],0);assert.ok(fields.waterType[i]==='none'||fields.waterType[i]==='river'&&fields.road[i]==='bridge'||fields.waterType[i]==='sea'&&fields.road[i]==='pier');}
 rows.push({seed,type,pattern,streetWidth,neighborhoods:city.neighborhoods.length,quarters:city.quarters.length,parcels:city.parcels.length,streets:city.streets.length,riverCells:fields.road.filter(v=>v==='bridge').length,pierCells:fields.road.filter(v=>v==='pier').length,checksum:city.fingerprint});
}
for(const size of [32,160]){const city=generateSettlement({width:size,height:size,seed:71,streetWidth:4,blockSize:8,buildingDensity:1});assert.ok(validateSettlement(city).ok);for(const n of city.neighborhoods)assert.ok(n.area>=city.request.neighborhoods.minArea&&n.area<=city.request.neighborhoods.maxArea);for(const q of city.quarters)assert.ok(q.area>=city.request.quarters.minArea&&q.area<=city.request.quarters.maxArea);rows.push({size,neighborhoods:city.neighborhoods.length,quarters:city.quarters.length,parcels:city.parcels.length,streets:city.streets.length,checksum:city.fingerprint});}
const recipe=await createRecipe('settlements');Object.assign(recipe.generation,{width:48,height:40,terrain:{water:.35,relief:.9}});recipe.seed=42;const project=await generateBase(recipe),runtime=await exportRuntime(project);assert.ok(project.source.atlas.layers[0].fields.road.includes('bridge'));assert.deepEqual(runtime.navigation[0].streets,project.source.streets);
const folder=await mkdtemp(path.join(tmpdir(),'Vland street CLI '));let cli=false,http=false;
try{
 await writeFile(path.join(folder,'recipe.json'),JSON.stringify(recipe),'utf8');const cliProject=JSON.parse(execFileSync(process.execPath,['cli.mjs','generate-base',path.join(folder,'recipe.json')],{maxBuffer:16*1024*1024}));assert.equal(hash(cliProject),hash(project));
 await writeFile(path.join(folder,'project.json'),JSON.stringify(project),'utf8');const cliRuntime=JSON.parse(execFileSync(process.execPath,['cli.mjs','runtime',path.join(folder,'project.json')],{maxBuffer:16*1024*1024}));assert.equal(hash(cliRuntime),hash(runtime));cli=true;
 const target=process.argv.find(a=>a.startsWith('--http='))?.slice(7);if(target){const u=new URL(target);assert.equal(u.hostname,'127.0.0.1');assert.notEqual(u.port,'9670','Use an isolated server for QA');const post=async(operation,job)=>{const r=await fetch(u.origin+'/api/'+operation,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(job)});assert.ok(r.ok,await r.clone().text());return r.json();};assert.equal(hash(await post('generate-base',{recipe})),hash(project));assert.equal(hash(await post('runtime',{project})),hash(runtime));http=true;}
}finally{const absolute=await realpath(folder),parent=await realpath(tmpdir());assert.equal(path.dirname(absolute),parent);assert.ok(path.basename(absolute).startsWith('Vland street CLI '));await rm(absolute,{recursive:true});}
const protectedBefore=JSON.parse(await readFile(new URL('../evidence/map-ui.json',import.meta.url),'utf8')).protectedFiles,{createHash}=await import('node:crypto');for(const[file,sha]of Object.entries(protectedBefore))assert.equal(createHash('sha256').update(await readFile(new URL('../'+file,import.meta.url))).digest('hex'),sha,'Protected input '+file);
const result={ok:true,maps:rows.length,elapsedMs:Date.now()-started,cli,http,deterministic:hash(await generateBase(recipe))===hash(project),protectedFiles:Object.keys(protectedBefore).length,rows};await writeFile(new URL('../evidence/settlement-'+(districts?'districts':'streets')+'.json',import.meta.url),JSON.stringify(result,null,2)+'\n','utf8');console.log(JSON.stringify({...result,rows:undefined}));
