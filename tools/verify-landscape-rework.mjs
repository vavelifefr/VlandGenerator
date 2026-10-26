// Fresh synthetic inputs only. Stateless isolated HTTP/CLI and temporary schema
// documents; never the user's session, projects or authored example files.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createRecipe,generateBase,validateProject,execute,materialize} from '../app/index.mjs';
import {normalizeAtlasRequest} from '../engine/api/atlas-catalog.mjs';
import {surfaceFields} from '../engine/core/atlas-landforms.mjs';
import {LANDSCAPE_STRUCTURES,LANDSCAPE_BIOMES} from '../engine/core/landscape-profile.mjs';
import {gridNeighbors} from '../engine/core/topology.mjs';
import {createVlandServer} from '../server.mjs';
import {hash} from '../content/common.mjs';
import {rasterizeLayer,encodePNG} from '../app/raster.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)),rows=[],allSix=[],interfaces=[],cards=[],documents=[],modes=['landscape','hexlandscape'];
const folder=await mkdtemp(path.join(tmpdir(),'Vland landscape rework QA ')),server=createVlandServer({root:folder});let listening=false;
const checks=(f,w,h,topology)=>{for(let i=0;i<f.flowTo.length;i++)if(f.flowTo[i]>=0){assert.ok(f.flowRank[f.flowTo[i]]<f.flowRank[i]);if(['river','lake'].includes(f.waterType[i])&&['river','lake','sea'].includes(f.waterType[f.flowTo[i]])){const j=f.flowTo[i],bed=f.heightmap??f.elevation;assert.ok(bed[i]+f.waterDepth[i]+.000002>=bed[j]+f.waterDepth[j],'static water head');}}
 const seen=new Uint8Array(w*h),groups=[];for(let i=0;i<seen.length;i++)if((f.heightmap??f.elevation)[i]>.36&&!seen[i]){const q=[i];seen[i]=1;for(let k=0;k<q.length;k++)for(const j of gridNeighbors(q[k],w,h,topology))if((f.heightmap??f.elevation)[j]>.36&&!seen[j]){seen[j]=1;q.push(j);}groups.push(q.length);}return groups;};
const add=(label,schema,value)=>documents.push({label,schema,value});
try{
 // Every category is deliberately selected on a small board; no category is
 // silently inferred from the selected base. Repeat with independent seeds.
 for(const kind of ['square','hex'])for(const structure of Object.keys(LANDSCAPE_STRUCTURES))for(const baseBiome of Object.keys(LANDSCAPE_BIOMES))for(const seed of [7,42]){
  const additionalBiomes=Object.keys(LANDSCAPE_BIOMES).filter(id=>id!==baseBiome),r=normalizeAtlasRequest({schema:'vland.atlas.request',schemaVersion:1,width:50,height:50,seed,topology:{kind},landscape:{structure,baseBiome,additionalBiomes}}),{fields:f}=surfaceFields(r),counts=Object.fromEntries(Object.entries(LANDSCAPE_BIOMES).map(([id,v])=>[id,f.biome.filter(b=>b===v.biome).length]));
  const label=[kind,structure,baseBiome,seed].join('/');for(const id of additionalBiomes)assert.ok(counts[id]>0,label+' selected '+id);assert.ok(additionalBiomes.every(id=>counts[baseBiome]>=counts[id]),label+' dominant base');checks(f,50,50,r.topology);allSix.push({kind,structure,baseBiome,seed,counts});
 }
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));listening=true;const base='http://127.0.0.1:'+server.address().port;
 for(const mode of modes)for(const size of [50,100,200,300])for(const structure of Object.keys(LANDSCAPE_STRUCTURES)){
  const r=await createRecipe(mode),profile=structure==='islands'?{structure,baseBiome:'forest',additionalBiomes:['meadow','swamp','mountains']}:{structure,baseBiome:'mountains',additionalBiomes:['meadow','forest','swamp']};
  Object.assign(r.generation,{width:size,height:size,layers:{above:0,underground:0},landscape:profile});const before=hash(r),start=performance.now(),p=await generateBase(r);assert.equal(hash(r),before);assert.ok((await validateProject(p)).ok);const layer=p.source.layers[0],groups=checks(layer.fields,size,size,layer.topology);if(structure==='islands')assert.equal(groups.length,3);if(structure==='continent')assert.equal(groups.length,1);
  const counts=Object.fromEntries(Object.entries(LANDSCAPE_BIOMES).map(([id,v])=>[id,layer.fields.biome.filter(b=>b===v.biome).length]));for(const id of profile.additionalBiomes)assert.ok(counts[id]>0,[mode,size,structure,id].join('/'));
  rows.push({mode,size,structure,profile:p.recipe.generation.landscape,generateMs:Math.round(performance.now()-start),checksum:p.checksum,groups,counts,valid:true});
  if(size===50||size===300){const [view]=await materialize(p),image=encodePNG(rasterizeLayer(view,{channel:'biome',scale:2,transparent:false}));cards.push('<figure><figcaption>'+mode+' · '+structure+' · '+size+'×'+size+'</figcaption><img alt="'+mode+' '+structure+' '+size+'" src="data:image/png;base64,'+Buffer.from(image).toString('base64')+'"></figure>');}
  if(structure==='land'&&[50,300].includes(size)){
   // CPU-heavy synchronous local generation shares this process with the QA
   // server. Use a fresh connection after those idle periods, not a pooled
   // socket whose keep-alive timer could not run while the event loop was busy.
   const response=await fetch(base+'/api/generate-base',{method:'POST',headers:{'Content-Type':'application/json',Connection:'close'},body:JSON.stringify({recipe:r})});assert.equal(response.status,200);assert.equal(hash(await response.json()),hash(p));
   const input=path.join(folder,'recipe.json'),output=path.join(folder,'project.json');await writeFile(input,JSON.stringify(r));const cli=spawnSync(process.execPath,[path.join(root,'cli.mjs'),'generate-base',input,output],{encoding:'utf8',timeout:45000,maxBuffer:2048});assert.equal(cli.status,0,cli.stderr);assert.equal(hash(JSON.parse(await readFile(output,'utf8'))),hash(p));
   const context=await execute('export',{project:p,format:'llm-context'}),runtime=await execute('export',{project:p,format:'runtime'});assert.deepEqual(context.project.landscape,p.recipe.generation.landscape);assert.ok(runtime.validation.ok);
   interfaces.push({mode,size,httpCliExact:true,context:true,runtime:true});
   if(size===300){add(mode+'300 recipe','schemas/recipe.schema.json',p.recipe);add(mode+'300 source','engine/schemas/atlas.schema.json',p.source);add(mode+'300 context','schemas/project-context.schema.json',context);}
  }
 }
 let schema=null;if(process.env.VLAND_SCHEMA_PYTHON){const input=path.join(folder,'schema-data.json'),report=path.join(root,'evidence/landscape-rework-real-schemas.json');await writeFile(input,JSON.stringify({modes,documents}));const qa=spawnSync(process.env.VLAND_SCHEMA_PYTHON,[path.join(root,'tools/verify-evolution-schemas.py'),'--data',input,'--report',report],{encoding:'utf8',timeout:300000,maxBuffer:2*1024*1024,cwd:root});assert.equal(qa.status,0,qa.stderr);schema=JSON.parse(await readFile(report,'utf8'));assert.ok(schema.ok);}
 const html='<!doctype html><html lang="ru"><meta charset="utf-8"><title>Реворк ландшафта</title><style>body{background:#101a1e;color:#def;font:14px system-ui;margin:18px}section{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px;max-width:1200px}figure{margin:0}img{width:100%;image-rendering:pixelated;background:#15262d}figcaption{padding:7px}@media(max-width:600px){section{grid-template-columns:1fr 1fr}}</style><h1>Связные формы и выбранные территории</h1><p>Seed42. Зелёный — леса/луга, тёмный зелёный — болота, серый — горы, белый — снежные вершины. Отображение общего канала «Биомы», с реками и навигационными проходами.</p><section>'+cards.join('')+'</section></html>';
 await writeFile(path.join(root,'evidence/landscape-rework-preview.html'),html);const result={ok:true,smallAllSix:allSix.length,realMaps:rows.length,httpCliCases:interfaces.length,schemaDocuments:schema?.documents??0,rows,allSix,interfaces,sessionApiUsed:false,namedSaves:false};await writeFile(path.join(root,'evidence/landscape-rework.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({...result,rows:undefined,allSix:undefined,interfaces:undefined}));
}catch(error){await writeFile(path.join(root,'evidence/landscape-rework.json'),JSON.stringify({ok:false,error:error.message,rows,allSix,interfaces},null,2));throw error;}
finally{if(listening){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}const target=await realpath(folder),parent=await realpath(tmpdir());assert.equal(path.dirname(target),parent);assert.ok(path.basename(target).startsWith('Vland landscape rework QA '));await rm(target,{recursive:true,force:true});}
