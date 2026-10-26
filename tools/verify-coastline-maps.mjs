// Current coastline-stage integration only. Fresh recipes, private ephemeral
// server root; never read user projects, authored examples or live .run.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,realpath,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createRecipe,generateBase,validateProject,execute,materialize} from '../app/index.mjs';
import {createVlandServer} from '../server.mjs';
import {gridNeighbors} from '../engine/core/topology.mjs';
import {applyLandscapeRegions} from '../engine/core/landscape-regions.mjs';
import {atlasSeed} from '../engine/core/atlas-landforms.mjs';
import {ATLAS_BIOMES} from '../engine/api/atlas-catalog.mjs';
import {hash} from '../content/common.mjs';
import {rasterizeLayer,encodePNG} from '../app/raster.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)),modes=['landscape','hexlandscape'],sizes=[50,100,200,300],structures=['coast','islands','continent'];
const coastOnly=process.argv.includes('--coast-only'),prefix=coastOnly?'coast-correction':'coastline';
const cases=coastOnly?modes.flatMap(mode=>[...sizes.filter(size=>size===50||size===300).map(size=>({mode,size,width:size,height:size,structure:'coast',seed:42})),...[870414469,4018650511,742339477,1501711120].map(seed=>({mode,size:80,width:80,height:64,structure:'coast',seed}))]):modes.flatMap(mode=>sizes.flatMap(size=>structures.map(structure=>({mode,size,width:size,height:size,structure,seed:42}))));
const artifact=name=>path.join(root,'evidence',prefix+'-'+name),rows=[],interfaces=[],images=[],documents=[],controls=[],started=new Date().toISOString();
const temporary=await realpath(tmpdir()),folder=await mkdtemp(path.join(temporary,'Vland-Coast-matrix-')),server=createVlandServer({root:folder});let listening=false;
const card=(id,type,percent)=>({id,type,percent});
const profiles={
 coast:{baseBiome:'forest',biomes:[card('meadows','meadow',25),card('wetlands','swamp',10),card('drylands','desert',8),card('forest-east','forest',5)]},
 islands:{baseBiome:'meadow',biomes:[card('forest-west','forest',25),card('highlands','mountains',18),card('wetlands','swamp',7),card('forest-east','forest',10)]},
 continent:{baseBiome:'mountains',biomes:[card('forest-west','forest',20),card('meadows','meadow',20),card('wetlands','swamp',10),card('snowlands','snow',10),card('forest-east','forest',5)]}
};
function summary(source){
 const layer=source.layers.find(l=>l.id==='surface');assert.ok(layer);const f=layer.fields,w=layer.board.width,h=layer.board.height,n=w*h,bed=f.heightmap??f.elevation,sea=source.hydrology.seaLevel;
 for(const field of ['elevation','heightmap','humidity','temperature','slope','waterDepth','flowTo','flowRank'])assert.equal(f[field]?.length,n,field+' length');
 for(let i=0;i<n;i++){
  for(const field of ['elevation','heightmap','humidity','temperature','slope','waterDepth'])assert.ok(Number.isFinite(f[field][i]),field+' finite '+i);
  assert.equal(f.material[i],ATLAS_BIOMES[f.biome[i]].material,'Biome/material consistency');
  const j=f.flowTo[i];if(j<0)continue;assert.ok(Number.isInteger(j)&&j<n);assert.ok(gridNeighbors(i,w,h,layer.topology).includes(j),'Adjacent flow');assert.ok(f.flowRank[j]<f.flowRank[i],'Acyclic flow');
  if(['river','lake'].includes(f.waterType[i])&&['river','lake','sea'].includes(f.waterType[j]))assert.ok(bed[i]+f.waterDepth[i]+.000002>=bed[j]+f.waterDepth[j],'Freshwater head cannot climb downstream');
 }
 const seen=new Uint8Array(n),groups=[];
 for(let i=0;i<n;i++)if(bed[i]>sea&&!seen[i]){const q=[i];seen[i]=1;for(let at=0;at<q.length;at++)for(const j of gridNeighbors(q[at],w,h,layer.topology))if(bed[j]>sea&&!seen[j]){seen[j]=1;q.push(j);}groups.push(q.length);}
 groups.sort((a,b)=>b-a);assert.equal(groups.length,source.request.landscape.structure==='islands'?3:1,'Dry physical components');
 if(source.request.landscape.structure!=='coast')for(let i=0;i<n;i++)if(i<w||i>=n-w||i%w===0||i%w===w-1)assert.ok(bed[i]<sea,'Sea frame');
 const count=values=>{const result={};for(const value of values)result[value]=(result[value]??0)+1;return result;};
 // The public native document stores contextual biome IDs, not the private
 // territory labels. Exercise allocation on its final dry mask separately;
 // do not present these counts as exact final contextual biome percentages.
 const copy=structuredClone(f),labels=applyLandscapeRegions(copy,source.request,atlasSeed(source.request,'surface','relief')),dry=[];
 for(let i=0;i<n;i++)if(f.waterType[i]==='none')dry.push(i);
 const territories=count(dry.map(i=>labels[i])),profile=source.request.landscape,shares={[profile.baseBiome]:100-profile.biomes.reduce((s,c)=>s+c.percent,0)};
 for(const c of profile.biomes)shares[c.type]=(shares[c.type]??0)+c.percent;
 for(const [type,share]of Object.entries(shares)){const numberOfParts=profile.biomes.filter(c=>c.type===type).length+(type===profile.baseBiome?1:0);assert.ok(Math.abs((territories[type]??0)-dry.length*share/100)<=numberOfParts,type+' requested dry quota');}
 assert.equal(Object.values(territories).reduce((a,b)=>a+b,0),dry.length);assert.deepEqual(copy.elevation,f.elevation);assert.deepEqual(copy.waterType,f.waterType);
 return{groups,geometricLandFraction:groups.reduce((a,b)=>a+b,0)/n,dryCells:dry.length,biomes:count(f.biome),water:count(f.waterType),territorySolverOnFinalDryMask:territories,transitionCells:f.transitionStrength.filter(v=>v>0).length};
}
async function raster(project,size,structure,channel){
 const [layer]=await materialize(project),bytes=encodePNG(rasterizeLayer(layer,{channel,scale:2,transparent:false})),suffix=coastOnly&&size===80?'80x64-seed'+project.recipe.seed:String(size),name=project.recipe.mode+'-'+suffix+'-'+structure+'-'+channel+'.png';
 assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);await writeFile(artifact(name),bytes);images.push({mode:project.recipe.mode,size,width:layer.width,height:layer.height,seed:project.recipe.seed,structure,channel,file:prefix+'-'+name,bytes:bytes.length});
}
try{
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});listening=true;const base='http://127.0.0.1:'+server.address().port;
 for(const {mode,size,width,height,structure,seed}of cases){
  const recipe=await createRecipe(mode);recipe.seed=seed;Object.assign(recipe.generation,{width,height,layers:{above:0,underground:0},landscape:{structure,...structuredClone(profiles[structure])}});
  const before=hash(recipe),start=performance.now(),project=await generateBase(recipe),generated=performance.now(),validation=await validateProject(project),validated=performance.now();assert.equal(hash(recipe),before);assert.ok(validation.ok,JSON.stringify({mode,size,structure,errors:validation.errors}));assert.deepEqual(project.recipe.generation.landscape,recipe.generation.landscape);
  const row={mode,size,width,height,structure,seed:recipe.seed,profile:structuredClone(recipe.generation.landscape),generateMs:Math.round(generated-start),validateMs:Math.round(validated-generated),checksum:project.checksum,valid:true,...summary(project.source)};rows.push(row);
  if(coastOnly||size===50||size===300)for(const channel of ['biome','material'])await raster(project,size,structure,channel);
  if(size===300)for(const [label,schema,value]of [['recipe','schemas/recipe.schema.json',project.recipe],['native','engine/schemas/atlas.schema.json',project.source]])documents.push({label:mode+'-'+structure+'-300-'+label,schema,value});
  if(!coastOnly&&structure==='islands'&&(size===50||size===300)||coastOnly&&size===300){
   const empty=structuredClone(recipe);empty.generation.landscape.biomes=[];const plain=await generateBase(empty),a=project.source.layers.find(l=>l.id==='surface').fields,b=plain.source.layers.find(l=>l.id==='surface').fields;
   for(const field of ['elevation','heightmap','waterType','waterDepth','flowTo','flowRank'])assert.deepEqual(a[field],b[field],'Cards cannot change physical '+field);controls.push({mode,size,biomeCardsDoNotChangeGeometryOrHydrology:true});
  }
  if(structure==='coast'&&(size===50||size===300)){
   const response=await fetch(base+'/api/generate-base',{method:'POST',headers:{'Content-Type':'application/json',Connection:'close'},body:JSON.stringify({recipe})});assert.equal(response.status,200,await response.clone().text());assert.equal(hash(await response.json()),hash(project),'HTTP exact JS');
   const input=path.join(folder,'recipe.json'),output=path.join(folder,'project.json');await writeFile(input,JSON.stringify(recipe),'utf8');const cli=spawnSync(process.execPath,[path.join(root,'cli.mjs'),'generate-base',input,output],{encoding:'utf8',timeout:120000,maxBuffer:4096});assert.equal(cli.status,0,cli.stderr);assert.equal(hash(JSON.parse(await readFile(output,'utf8'))),hash(project),'CLI exact JS');
   const context=await execute('export',{project,format:'llm-context'}),runtime=await execute('export',{project,format:'runtime'});assert.deepEqual(context.project.landscape,recipe.generation.landscape);assert.ok(runtime.validation.ok);assert.deepEqual(runtime.initialState.entities,[]);
   const rebuilt=await execute('landscape-rebuild',{project,recipe});assert.equal(rebuilt.revision,project.revision+1);assert.deepEqual(rebuilt.recipe.generation.landscape,recipe.generation.landscape);interfaces.push({mode,size,jsHttpCliExact:true,llmContext:true,runtime:true,rebuild:true});
   if(size===300){documents.push({label:mode+'-300-context',schema:'schemas/project-context.schema.json',value:context},{label:mode+'-300-rebuild-job',schema:'schemas/landscape-rebuild-request.schema.json',value:{project,recipe}});}
  }
  console.log(JSON.stringify({mode,size,width,height,structure,seed,generateMs:row.generateMs,validateMs:row.validateMs,completed:rows.length,total:cases.length}));
 }
 assert.equal(rows.length,cases.length);assert.equal(interfaces.length,4);assert.equal(images.length,24);assert.equal(controls.length,coastOnly?2:4);await assert.rejects(access(path.join(folder,'.run','working-session.json')));
 const manifest={modes,documents};await writeFile(artifact('schema-data.json.gz'),gzipSync(JSON.stringify(manifest)));
 assert.ok(process.env.VLAND_SCHEMA_PYTHON,'Real300 schema QA requires the existing VLAND_SCHEMA_PYTHON');const input=path.join(folder,'schema-data.json'),report=artifact('real-schemas.json');await writeFile(input,JSON.stringify(manifest),'utf8');const qa=spawnSync(process.env.VLAND_SCHEMA_PYTHON,[path.join(root,'tools/verify-evolution-schemas.py'),'--data',input,'--report',report],{encoding:'utf8',timeout:300000,maxBuffer:2*1024*1024,cwd:root,env:{...process.env,PYTHONUTF8:'1'}});assert.equal(qa.status,0,qa.stderr||qa.stdout);const schema=JSON.parse(await readFile(report,'utf8'));assert.ok(schema.ok);
 const html='<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Естественные берега — реальные карты</title><style>body{background:#101a1e;color:#def;font:14px system-ui;margin:18px}section{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px;max-width:1600px}figure{margin:0}img{width:100%;image-rendering:pixelated}figcaption{padding:7px}@media(max-width:700px){section{grid-template-columns:1fr 1fr}}</style><h1>Берега: реальные Surface карты</h1><p>Обе сетки; 50/300 и в coast-only восемь пользовательских80×64. Настоящие каналы «Биомы» и «Материал» общего PNG экспорта, без обработки.</p><section>'+images.map(i=>'<figure><figcaption>'+i.mode+' · '+i.width+'×'+i.height+' · seed'+i.seed+' · '+i.structure+' · '+i.channel+'</figcaption><img loading="lazy" src="'+i.file+'" alt="'+i.mode+' '+i.structure+' '+i.channel+'"></figure>').join('')+'</section></html>';await writeFile(artifact('preview.html'),html,'utf8');
 // Previous completed Surface QA already captured identical seed42 profiles.
 // Reuse only those existing biome PNGs; no historical engine or regeneration.
 const priorPrefix=coastOnly?'coastline':'landscape-surface',prior=JSON.parse(await readFile(path.join(root,'evidence',priorPrefix+'-matrix.json'),'utf8')),pairs=[];
 const priorRecipes=coastOnly?JSON.parse(gunzipSync(await readFile(path.join(root,'evidence','coastline-schema-data.json.gz'))).toString('utf8')).documents.filter(d=>d.schema==='schemas/recipe.schema.json').map(d=>d.value):[];
 for(const image of images.filter(i=>(i.channel==='biome'||coastOnly&&i.channel==='material')&&i.width===i.height&&(!coastOnly||i.size===300))){
  const old=prior.rows.find(r=>r.mode===image.mode&&r.size===image.size&&r.structure===image.structure);assert.ok(old);assert.equal(old.seed,42);const priorProfile=old.profile??priorRecipes.find(recipe=>recipe.mode===image.mode&&recipe.generation.landscape.structure===image.structure)?.generation.landscape;assert.deepEqual(priorProfile,{structure:image.structure,...profiles[image.structure]});
  const before=priorPrefix+'-'+image.mode+'-'+image.size+'-'+image.structure+'-'+image.channel+'.png';await access(path.join(root,'evidence',before));pairs.push('<article><h2>'+image.mode+' · '+image.size+' · '+image.structure+'</h2><div><figure><figcaption>До</figcaption><img src="'+before+'" alt="До"></figure><figure><figcaption>После</figcaption><img src="'+image.file+'" alt="После"></figure></div></article>');
 }
 await writeFile(artifact('map-comparison.html'),'<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Surface: до и после берегов</title><style>body{background:#101a1e;color:#def;font:14px system-ui;margin:18px}main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px;max-width:1600px}article div{display:grid;grid-template-columns:1fr 1fr;gap:10px}figure{margin:0}img{width:100%;image-rendering:pixelated}h2{font-size:16px}@media(max-width:800px){main{grid-template-columns:1fr}}</style><h1>Карты до и после берегов</h1><p>Идентичные seed42, размеры, сетки и карточки. «До» — сохранённые PNG предыдущей проверенной матрицы; «после» — текущая генерация. Coast-only: сравнение биомов и материалов300; полная матрица: сравнение биомов50/300.</p><main>'+pairs.join('')+'</main></html>','utf8');
 const result={ok:true,started,finished:new Date().toISOString(),realMaps:rows.length,geometryHydrologyControls:controls.length,interfaceCases:interfaces.length,images:images.length,schemaDocuments:schema.documents,schemaNegativeControls:schema.negativeControls,sessionApiUsed:false,namedProjectsUsed:false,authoredFixturesUsed:false,rows,controls,interfaces,artifacts:images};await writeFile(artifact('matrix.json'),JSON.stringify(result,null,2)+'\n','utf8');console.log(JSON.stringify({...result,rows:undefined,controls:undefined,interfaces:undefined,artifacts:undefined}));
}catch(error){await writeFile(artifact('matrix.json'),JSON.stringify({ok:false,started,failed:new Date().toISOString(),error:error.message,stack:error.stack,rows,controls,interfaces,artifacts:images},null,2)+'\n','utf8');throw error;}
finally{if(listening){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}const resolved=await realpath(folder);assert.equal(path.dirname(resolved),temporary);assert.ok(path.basename(resolved).startsWith('Vland-Coast-matrix-'));await rm(resolved,{recursive:true});}
