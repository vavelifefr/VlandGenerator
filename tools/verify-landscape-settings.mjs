// Generated synthetic recipes only; no saved projects, authored examples,
// fixtures, browser sessions or live server data are used by this audit.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createRecipe,generateBase,validateProject,materialize} from '../app/index.mjs';
import {gridNeighbors} from '../engine/core/topology.mjs';
import {hash} from '../content/common.mjs';
import {encodePNG,rasterizeLayer} from '../app/raster.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)),artifact=name=>path.join(root,'evidence','landscape-settings-'+name),started=new Date().toISOString();
const forms=['land','coast','islands','continent'],sizes=[50,100,128,200,300],modes=['landscape','hexlandscape'];
const rows=[],images=[],controls=[],repeats=[],pending=new Map(),masks=new Map();
const seeds={land:7,coast:3275713831,islands:42,continent:2026};
const biomes=[{id:'forest-west',type:'forest',percent:20},{id:'forest-east',type:'forest',percent:10},{id:'mountains',type:'mountains',percent:25},{id:'wetlands',type:'swamp',percent:10}];
function spec(mode,size,structure,landPercent=75,uniformity=50){const key=[mode,size,structure,landPercent,uniformity].join('/');if(!pending.has(key))pending.set(key,{key,mode,size,structure,landPercent,uniformity});}
for(const mode of modes)for(const size of sizes)for(const structure of forms)spec(mode,size,structure);
for(const mode of modes)for(const structure of forms){for(const uniformity of [0,100])for(const size of [128,300])spec(mode,size,structure,75,uniformity);if(structure!=='land')for(const percent of [25,50])spec(mode,128,structure,percent);}
function components(mask,width,height,topology){const seen=new Uint8Array(mask.length),sizes=[];for(let i=0;i<mask.length;i++)if(mask[i]&&!seen[i]){const queue=[i];seen[i]=1;for(let at=0;at<queue.length;at++)for(const j of gridNeighbors(queue[at],width,height,topology))if(mask[j]&&!seen[j]){seen[j]=1;queue.push(j);}sizes.push(queue.length);}return sizes.sort((a,b)=>b-a);}
function checkSource(project,item){
 const layer=project.source.layers.find(l=>l.id==='surface');assert.ok(layer);const f=layer.fields,w=layer.board.width,h=layer.board.height,n=w*h,sea=project.source.hydrology.seaLevel,bed=f.heightmap??f.elevation,mask=Uint8Array.from(bed,v=>+(v>sea)),landCells=mask.reduce((sum,v)=>sum+v,0),expected=item.structure==='land'?n:Math.round(n*item.landPercent/100);
 assert.equal(landCells,expected,item.key+' exact immutable geological quota');assert.equal(f.waterType.filter(v=>v==='sea').length,n-expected,item.key+' visible ocean complement');
 const groups=components(mask,w,h,layer.topology),oceanGroups=components(Uint8Array.from(mask,v=>1-v),w,h,layer.topology);assert.equal(groups.length,item.structure==='islands'?3:1,item.key+' landmass components');assert.equal(oceanGroups.length,item.structure==='land'?0:1,item.key+' external sea connected');
 if(['islands','continent'].includes(item.structure))assert.ok(mask.every((v,i)=>!(i<w||i>=n-w||i%w===0||i%w===w-1)||!v),'sea frame');
 const shapeKey=[item.mode,item.size,item.structure,item.landPercent].join('/'),seaHash=hash(Array.from(mask));if(masks.has(shapeKey))assert.equal(seaHash,masks.get(shapeKey),'uniformity does not alter the sea geometry');else masks.set(shapeKey,seaHash);
 for(const field of ['elevation','heightmap','humidity','temperature','waterDepth','flowRank','flowTo','drainage','basin'])assert.equal(f[field]?.length,n,field+' length');
 let rivers=0,lakes=0,heads=0;const incoming=new Uint8Array(n);
 for(let i=0;i<n;i++){
  for(const field of ['elevation','heightmap','humidity','temperature','waterDepth','drainage'])assert.ok(Number.isFinite(f[field][i]),field+' finite');
  assert.ok(f.waterDepth[i]>=0&&f.waterDepth[i]<=1,'depth bounded');if(f.waterType[i]==='river')rivers++;if(f.waterType[i]==='lake')lakes++;
  const j=f.flowTo[i];if(j<0)continue;assert.ok(Number.isInteger(j)&&j<n);assert.ok(gridNeighbors(i,w,h,layer.topology).includes(j),'actual topology flow');assert.ok(f.flowRank[j]<f.flowRank[i],'acyclic drainage');
  if(f.waterType[i]==='river'&&f.waterType[j]==='river')incoming[j]=1;
  if(['river','lake'].includes(f.waterType[i])&&['river','lake','sea'].includes(f.waterType[j]))assert.ok(bed[j]+f.waterDepth[j]<=bed[i]+f.waterDepth[i]+.000002,'wet downstream head never climbs');
 }
 for(let i=0;i<n;i++)if(f.waterType[i]==='river'&&!incoming[i])heads++;
 assert.deepEqual(project.recipe.generation.landscape.biomes,biomes,'chosen repeating cards preserved');assert.equal(project.sources.length,0,'no automatic source content');assert.equal(project.revision,0);
 return{landCells,expectedLandCells:expected,oceanCells:n-landCells,landGroups:groups,seaGroups:oceanGroups.length,seaHash,riverCells:rivers,lakeCells:lakes,visibleRiverHeads:heads};
}
async function capture(project,item){
 if(![128,300].includes(item.size)||item.landPercent!==75)return;
 const [layer]=await materialize(project);
 for(const channel of ['biome','elevation']){const file=`landscape-settings-${item.mode}-${item.size}-${item.structure}-u${item.uniformity}-${channel}.png`,bytes=encodePNG(rasterizeLayer(layer,{channel,scale:2,transparent:false}));await writeFile(path.join(root,'evidence',file),bytes);images.push({...item,channel,file,bytes:bytes.length});}
}
async function report(error){const result={ok:!error,started,finished:new Date().toISOString(),actualMaps:rows.length,plannedMaps:pending.size,defaults:{landPercent:75,uniformity:50},baselineMatrix:{modes,sizes,forms},rows,controls,repeats,images,...(error?{error:error.message,stack:error.stack}:{})};await writeFile(artifact('matrix.json'),JSON.stringify(result,null,2)+'\n','utf8');return result;}
try{
 for(const item of pending.values()){
  const recipe=await createRecipe(item.mode);recipe.seed=seeds[item.structure];Object.assign(recipe.generation,{width:item.size,height:item.size,layers:{above:0,underground:0},landscape:{structure:item.structure,baseBiome:'meadow',landPercent:item.landPercent,uniformity:item.uniformity,biomes:structuredClone(biomes)}});
  const before=hash(recipe),start=performance.now(),project=await generateBase(recipe),generated=performance.now(),validation=await validateProject(project),validated=performance.now();assert.equal(hash(recipe),before,'caller recipe immutable');assert.ok(validation.ok,item.key+' '+JSON.stringify(validation.errors));
  const row={...item,seed:recipe.seed,checksum:project.checksum,generateMs:Math.round(generated-start),validateMs:Math.round(validated-generated),navigationValid:true,...checkSource(project,item)};rows.push(row);await capture(project,item);
  if(item.size===128&&item.structure==='coast'&&item.uniformity!==50||item.size===300&&item.structure==='islands'&&item.uniformity===100){const again=await generateBase(recipe);assert.equal(again.checksum,project.checksum,'repeat determinant');repeats.push({key:item.key,checksum:project.checksum,exact:true});}
  if(item.size===128&&item.structure==='land'&&item.uniformity!==50){const dryRecipe=structuredClone(recipe);dryRecipe.generation.hydrology={...dryRecipe.generation.hydrology,rivers:0,lakes:0};const dry=await generateBase(dryRecipe);assert.ok(!dry.source.layers[0].fields.waterType.includes('river'),'rivers0 respected');assert.ok((await validateProject(dry)).ok);controls.push({mode:item.mode,uniformity:item.uniformity,riversDisabled:true,valid:true});}
  console.log(JSON.stringify({done:rows.length,total:pending.size,...item,generateMs:row.generateMs,validateMs:row.validateMs}));
 }
 const articles=modes.flatMap(mode=>[128,300].flatMap(size=>forms.map(structure=>'<article><h2>'+mode+' · '+size+'×'+size+' · '+structure+' · seed '+seeds[structure]+'</h2>'+['biome','elevation'].map(channel=>'<div class="row">'+[0,50,100].map(u=>{const image=images.find(i=>i.mode===mode&&i.size===size&&i.structure===structure&&i.uniformity===u&&i.channel===channel);return'<figure><figcaption>Равномерность '+u+' · '+channel+'</figcaption><img loading="lazy" src="'+image.file+'" alt="'+structure+' '+channel+' '+u+'"></figure>';}).join('')+'</div>').join('')+'</article>')));
 await writeFile(artifact('comparison.html'),'<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Ландшафт: доля суши и равномерность</title><style>body{background:#101a1e;color:#def;font:14px system-ui;margin:20px}main{max-width:1600px}article{margin-bottom:32px}h2{font-size:17px}.row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}figure{margin:8px 0}img{width:100%;image-rendering:pixelated}@media(max-width:650px){.row{grid-template-columns:1fr}}</style><h1>Готовые карты: равномерность 0 / 50 / 100</h1><p>Свежие синтетические проекты; те же seed и карточки. Для форм с морем75% геологической суши, море25%. Внутренние реки и озёра включены в площадь суши. Сверху биомы, снизу высота. Здесь показаны реальные готовые карты обеих сеток128×128 и300×300.</p><main>'+articles.join('')+'</main></html>','utf8');
 const result=await report();console.log(JSON.stringify({ok:result.ok,actualMaps:rows.length,controls:controls.length,repeats:repeats.length,images:images.length}));
}catch(error){await report(error);throw error;}
