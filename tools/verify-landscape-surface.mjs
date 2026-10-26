// Fresh synthetic recipes only: this matrix never opens a user project,
// authored fixture, named save or the live working-session API/file.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,realpath,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createRecipe,generateBase,validateProject,execute,materialize} from '../app/index.mjs';
import {createVlandServer} from '../server.mjs';
import {LANDSCAPE_STRUCTURES} from '../engine/core/landscape-profile.mjs';
import {gridNeighbors} from '../engine/core/topology.mjs';
import {hash} from '../content/common.mjs';
import {rasterizeLayer,encodePNG} from '../app/raster.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)),modes=['landscape','hexlandscape'],sizes=[50,100,200,300],structures=Object.keys(LANDSCAPE_STRUCTURES);
const rows=[],interfaces=[],images=[],documents=[],repeatCases=[],started=new Date().toISOString(),temporary=await realpath(tmpdir()),folder=await mkdtemp(path.join(temporary,'Vland-Surface-matrix-'));
const server=createVlandServer({root:folder});let listening=false,coreChecked=false;
const artifact=name=>path.join(root,'evidence','landscape-surface-'+name);
const schemaOnly=process.argv.includes('--schema-only');
const card=(id,type,percent)=>({id,type,percent});
const profiles={
 land:{baseBiome:'mountains',biomes:[card('forest-west','forest',18),card('meadows','meadow',12),card('wetlands','swamp',8),card('forest-east','forest',7)]},
 coast:{baseBiome:'forest',biomes:[card('meadows','meadow',25),card('wetlands','swamp',10),card('drylands','desert',8),card('forest-east','forest',5)]},
 islands:{baseBiome:'meadow',biomes:[card('forest-west','forest',25),card('highlands','mountains',18),card('wetlands','swamp',7),card('forest-east','forest',10)]},
 continent:{baseBiome:'mountains',biomes:[card('forest-west','forest',20),card('meadows','meadow',20),card('wetlands','swamp',10),card('snowlands','snow',10),card('forest-east','forest',5)]}
};
function hydroAndShape(source){
 const layer=source.layers.find(l=>l.id==='surface');assert.ok(layer,'Surface layer exists');
 const f=layer.fields,w=layer.board.width,h=layer.board.height,n=w*h,sea=source.hydrology.seaLevel,bed=f.heightmap??f.elevation;
 for(const field of ['elevation','heightmap','humidity','temperature','slope','waterDepth','flowTo','flowRank'])assert.equal(f[field]?.length,n,field+' length');
 for(let i=0;i<n;i++){
  for(const field of ['elevation','heightmap','humidity','temperature','slope','waterDepth'])assert.ok(Number.isFinite(f[field][i]),field+' finite '+i);
  const j=f.flowTo[i];if(j<0)continue;
  assert.ok(Number.isInteger(j)&&j<n,'Valid flow endpoint');assert.ok(gridNeighbors(i,w,h,layer.topology).includes(j),'Flow follows grid adjacency');
  assert.ok(f.flowRank[j]<f.flowRank[i],'Acyclic downstream flow');
  if(['river','lake'].includes(f.waterType[i])&&['river','lake','sea'].includes(f.waterType[j]))assert.ok(bed[i]+f.waterDepth[i]+.000002>=bed[j]+f.waterDepth[j],'Freshwater static head does not climb downstream');
 }
 const seen=new Uint8Array(n),groups=[];
 for(let i=0;i<n;i++)if(bed[i]>sea&&!seen[i]){const q=[i];seen[i]=1;for(let k=0;k<q.length;k++)for(const j of gridNeighbors(q[k],w,h,layer.topology))if(bed[j]>sea&&!seen[j]){seen[j]=1;q.push(j);}groups.push(q.length);}
 groups.sort((a,b)=>b-a);const structure=source.request.landscape.structure,edge=bed.filter((_,i)=>i<w||i>=n-w||i%w===0||i%w===w-1);
 if(structure==='land'){assert.equal(groups.length,1);assert.equal(f.waterType.filter(v=>v==='sea').length,0);}
 if(structure==='coast')assert.equal(groups.length,1);
 if(structure==='continent'){assert.equal(groups.length,1);assert.ok(edge.every(v=>v<sea));}
 if(structure==='islands'){assert.equal(groups.length,3);assert.ok(edge.every(v=>v<sea));}
 const counts=field=>{const tally={};for(const value of field)tally[value]=(tally[value]??0)+1;return tally;},sorted=[...bed].sort((a,b)=>a-b);
 return{groups,biomes:counts(f.biome),water:counts(f.waterType),dryCells:f.waterType.filter(v=>v==='none').length,height:{min:sorted[0],q10:sorted[Math.floor(n*.1)],median:sorted[Math.floor(n*.5)],q90:sorted[Math.floor(n*.9)],max:sorted.at(-1)},transitionCells:f.transitionStrength?.filter(v=>v>0).length??0};
}
async function raster(project,size,structure,channel='biome'){
 const [layer]=await materialize(project),bytes=encodePNG(rasterizeLayer(layer,{channel,scale:2,transparent:false})),name=project.recipe.mode+'-'+size+'-'+structure+'-'+channel+'.png';
 assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);await writeFile(artifact(name),bytes);images.push({mode:project.recipe.mode,size,structure,channel,file:'landscape-surface-'+name,bytes:bytes.length});
}
const addDocument=(label,schema,value)=>documents.push({label,schema,value});
async function checkSchemas(manifest){
 if(!process.env.VLAND_SCHEMA_PYTHON)return null;
 const input=path.join(folder,'schema-data.json'),report=artifact('real-schemas.json');await writeFile(input,JSON.stringify(manifest),'utf8');
 const qa=spawnSync(process.env.VLAND_SCHEMA_PYTHON,[path.join(root,'tools/verify-evolution-schemas.py'),'--data',input,'--report',report],{encoding:'utf8',timeout:300000,maxBuffer:2*1024*1024,cwd:root,env:{...process.env,PYTHONUTF8:'1'}});assert.equal(qa.status,0,qa.stderr||qa.stdout);const schema=JSON.parse(await readFile(report,'utf8'));assert.ok(schema.ok);return schema;
}
try{
 if(schemaOnly){
  assert.ok(process.env.VLAND_SCHEMA_PYTHON,'Schema-only requires VLAND_SCHEMA_PYTHON');
  const manifest=JSON.parse(gunzipSync(await readFile(artifact('schema-data.json.gz'))).toString('utf8')),schema=await checkSchemas(manifest),previous=JSON.parse(await readFile(artifact('matrix.json'),'utf8'));
  assert.equal(previous.coreChecked,true,'The map/interface/raster matrix must already be complete');await access(artifact('preview.html'));
  Object.assign(previous,{ok:true,realMaps:previous.rows.length,interfaceCases:previous.interfaces.length,images:previous.artifacts.length,schemaDocuments:schema.documents,schemaChecked:true,schemaRechecked:new Date().toISOString()});for(const key of ['error','stack','failed'])delete previous[key];
  await writeFile(artifact('matrix.json'),JSON.stringify(previous,null,2)+'\n','utf8');console.log(JSON.stringify({schemaOnly:true,ok:true,documents:schema.documents}));
 }else{
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});listening=true;
 const base='http://127.0.0.1:'+server.address().port;
 for(const mode of modes)for(const size of sizes)for(const structure of structures){
  const recipe=await createRecipe(mode);Object.assign(recipe.generation,{width:size,height:size,layers:{above:0,underground:0},landscape:{structure,...structuredClone(profiles[structure])}});
  const before=hash(recipe),start=performance.now(),project=await generateBase(recipe),generated=performance.now(),validation=await validateProject(project),validated=performance.now();
  assert.equal(hash(recipe),before,'Input recipe remains immutable');assert.ok(validation.ok,[mode,size,structure,...validation.errors].join(' '));assert.deepEqual(project.recipe.generation.landscape,recipe.generation.landscape);
  const summary=hydroAndShape(project.source),row={mode,size,structure,seed:recipe.seed,profile:project.recipe.generation.landscape,generateMs:Math.round(generated-start),validateMs:Math.round(validated-generated),checksum:project.checksum,valid:true,...summary};rows.push(row);
  if(size===50||size===300)await raster(project,size,structure);
  if(size===100&&structure==='land')await raster(project,size,structure,'elevation');
  if(structure==='land'&&(size===50||size===300)){
   // A fresh socket avoids pooled keep-alive expiry while CPU generation blocks
   // this QA process. The worker/server itself remains independent.
   const response=await fetch(base+'/api/generate-base',{method:'POST',headers:{'Content-Type':'application/json',Connection:'close'},body:JSON.stringify({recipe})});assert.equal(response.status,200,await response.clone().text());assert.equal(hash(await response.json()),hash(project),'HTTP matches JS');
   const input=path.join(folder,'recipe.json'),output=path.join(folder,'project.json');await writeFile(input,JSON.stringify(recipe),'utf8');
   const cli=spawnSync(process.execPath,[path.join(root,'cli.mjs'),'generate-base',input,output],{encoding:'utf8',timeout:60000,maxBuffer:4096});assert.equal(cli.status,0,cli.stderr);assert.equal(hash(JSON.parse(await readFile(output,'utf8'))),hash(project),'CLI matches JS');
   const context=await execute('export',{project,format:'llm-context'}),runtime=await execute('export',{project,format:'runtime'});assert.deepEqual(context.project.landscape,project.recipe.generation.landscape);assert.ok(runtime.validation.ok);assert.deepEqual(runtime.initialState.entities,[]);
   const rebuilt=await execute('landscape-rebuild',{project,recipe});assert.equal(rebuilt.revision,project.revision+1);assert.deepEqual(rebuilt.recipe.generation.landscape,recipe.generation.landscape);
   interfaces.push({mode,size,jsHttpCliExact:true,llmContext:true,runtime:true,rebuild:true});
   if(size===300){addDocument(mode+'300 recipe','schemas/recipe.schema.json',project.recipe);addDocument(mode+'300 native','engine/schemas/atlas.schema.json',project.source);addDocument(mode+'300 context','schemas/project-context.schema.json',context);addDocument(mode+'300 rebuild job','schemas/landscape-rebuild-request.schema.json',{project,recipe});}
  }
  console.log(JSON.stringify({mode,size,structure,generateMs:row.generateMs,validateMs:row.validateMs,completed:rows.length,total:32}));
 }
 // Explicitly repeat a biome ten times and exercise the seventh profile too.
 for(const mode of modes){const recipe=await createRecipe(mode);Object.assign(recipe.generation,{width:50,height:50,layers:{above:0,underground:0},landscape:{structure:'land',baseBiome:'volcanic',biomes:Array.from({length:10},(_,i)=>card('forest-'+i,'forest',3))}});const project=await generateBase(recipe),validation=await validateProject(project);assert.ok(validation.ok,validation.errors.join(' '));assert.equal(project.recipe.generation.landscape.biomes.length,10);hydroAndShape(project.source);repeatCases.push({mode,tenRepeatedCards:true,baseBiome:'volcanic',valid:true});}
 const manifest={modes,documents};await writeFile(artifact('schema-data.json.gz'),gzipSync(JSON.stringify(manifest)));
 assert.equal(rows.length,32);assert.equal(interfaces.length,4);assert.equal(images.filter(i=>i.channel==='biome').length,16);assert.equal(images.filter(i=>i.channel==='elevation').length,2);
 await assert.rejects(access(path.join(folder,'.run','working-session.json')));
 const figures=images.map(i=>'<figure><figcaption>'+i.mode+' · '+i.structure+' · '+i.size+'×'+i.size+' · '+i.channel+'</figcaption><img loading="lazy" alt="'+i.mode+' '+i.structure+' '+i.size+' '+i.channel+'" src="'+i.file+'"></figure>');
 const html='<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Surface — проверка ландшафта</title><style>body{background:#101a1e;color:#def;font:14px system-ui;margin:18px}section{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px;max-width:1500px}figure{margin:0}img{width:100%;image-rendering:pixelated;background:#15262d}figcaption{padding:7px}@media(max-width:700px){section{grid-template-columns:1fr 1fr}}</style><h1>Процедурный Surface: обе сетки и формы</h1><p>Seed42. Явные повторяемые карточки биомов с процентами от суши. Канал «Биомы» использует реальные первичные ID и переходы; серые карты показывают высоты. Изображения — результат существующего общего PNG-экспорта, без художественной обработки.</p><section>'+figures.join('')+'</section></html>';
 await writeFile(artifact('preview.html'),html,'utf8');
 coreChecked=true;const schema=await checkSchemas(manifest);
 const result={ok:true,coreChecked,started,finished:new Date().toISOString(),realMaps:rows.length,repeatCases,interfaceCases:interfaces.length,schemaDocuments:schema?.documents??0,schemaChecked:!!schema,images:images.length,sessionApiUsed:false,namedProjectsUsed:false,authoredFixturesUsed:false,rows,interfaces,artifacts:images};await writeFile(artifact('matrix.json'),JSON.stringify(result,null,2)+'\n','utf8');
 console.log(JSON.stringify({...result,rows:undefined,interfaces:undefined,artifacts:undefined}));
 }
}catch(error){await writeFile(artifact(schemaOnly?'schema-recheck-failure.json':'matrix.json'),JSON.stringify({ok:false,coreChecked,started,failed:new Date().toISOString(),error:error.message,stack:error.stack,repeatCases,rows,interfaces,artifacts:images},null,2)+'\n','utf8');throw error;}
finally{
 if(listening){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 const resolved=await realpath(folder);assert.equal(path.dirname(resolved),temporary);assert.ok(path.basename(resolved).startsWith('Vland-Surface-matrix-'));await rm(resolved,{recursive:true});
}
