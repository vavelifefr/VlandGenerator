// Actual-provider QA using new synthetic RAM recipes only. No authored data,
// named project, working session, main server or desktop is accessed.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRecipe,generateBase,validateProject,materialize} from '../app/index.mjs';
import {hash} from '../content/common.mjs';
import {gridNeighbors} from '../engine/core/topology.mjs';
import {rasterizeLayer,encodePNG} from '../app/raster.mjs';
import {coastlineMetrics} from './verify-coastlines.mjs';
import {coastCoreWidth} from './verify-coast-correction.mjs';
import {shoreReversals} from '../tests/helpers/coast-rhythm.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const natural=process.argv.includes('--island-natural'),prefix=natural?'island-natural-':'sea-erosion-',artifact=name=>path.join(root,'evidence',prefix+name);
const sizes=[100,300],modes=['landscape','hexlandscape'],structures=natural?['islands']:['coast','islands'],erosions=[0,50,100];
const cards=[{id:'woodland',type:'forest',percent:25},{id:'ridge',type:'mountains',percent:25},{id:'wet-valley',type:'swamp',percent:10}];
const specs=structures.flatMap(structure=>modes.flatMap(mode=>sizes.flatMap(size=>erosions.map(coastErosion=>({structure,mode,size,coastErosion,seed:42})))));
specs.push(...structures.flatMap(structure=>modes.map(mode=>({structure,mode,size:300,coastErosion:100,seed:7,holdout:true}))));

function groups(mask,w,h,topology){
 const seen=new Uint8Array(mask.length),out=[];
 for(let i=0;i<mask.length;i++)if(mask[i]&&!seen[i]){
  const queue=[i];seen[i]=1;
  for(let at=0;at<queue.length;at++)for(const j of gridNeighbors(queue[at],w,h,topology))if(mask[j]&&!seen[j]){seen[j]=1;queue.push(j);}
  out.push(queue);
 }
 return out.sort((a,b)=>b.length-a.length);
}
function coastEdges(mask,w,h){
 const edges=[mask.subarray(0,w),mask.subarray(mask.length-w),Uint8Array.from({length:h},(_,y)=>mask[y*w]),Uint8Array.from({length:h},(_,y)=>mask[y*w+w-1])];
 const dry=edge=>edge.every(Boolean),sea=edge=>edge.every(v=>!v);
 return dry(edges[0])&&sea(edges[1])||sea(edges[0])&&dry(edges[1])||dry(edges[2])&&sea(edges[3])||sea(edges[2])&&dry(edges[3]);
}
function inspect(project,spec){
 const layer=project.source.layers.find(l=>l.id==='surface');assert.ok(layer,'Generated surface exists');
 const f=layer.fields,w=layer.board.width,h=layer.board.height,n=w*h,sea=project.source.hydrology.seaLevel,bed=f.heightmap??f.elevation;
 assert.equal(w,spec.size);assert.equal(h,spec.size);
 assert.ok(project.source.navigation.ok,'Generated navigation');assert.ok(project.source.access.ok,'Generated access');
 assert.equal(project.sources.length,0);assert.equal(project.edits.length,0);assert.equal(project.revision,0);
 assert.deepEqual(project.recipe.generation.landscape.biomes,spec.controlCards??cards,'Confirmed biome cards preserved');
 const mask=Uint8Array.from(bed,v=>+(v>sea)),landCells=mask.reduce((sum,v)=>sum+v,0),seaCells=f.waterType.filter(v=>v==='sea').length;
 assert.equal(landCells,Math.round(n*.75),'Exact geological land quota includes inland freshwater');assert.equal(seaCells,n-landCells,'Visible sea is the exact complement');
 const landGroups=groups(mask,w,h,layer.topology),seaGroups=groups(Uint8Array.from(mask,v=>1-v),w,h,layer.topology);
 assert.equal(landGroups.length,spec.structure==='islands'?3:1,'Required native land components');assert.equal(seaGroups.length,1,'External sea connected');
 if(spec.structure==='islands')assert.ok(mask.every((v,i)=>!(i<w||i>=n-w||i%w===0||i%w===w-1)||!v),'Sea frame around islands');
 else assert.ok(coastEdges(mask,w,h),'Coast has opposing entirely dry and sea edges');
 for(const field of ['elevation','heightmap','humidity','temperature','waterDepth','flowRank','flowTo','drainage','basin'])assert.equal(f[field]?.length,n,field+' length');
 let boundary=0;
 for(let i=0;i<n;i++){
  for(const field of ['elevation','heightmap','humidity','temperature','waterDepth','drainage'])assert.ok(Number.isFinite(f[field][i]),field+' finite');
  assert.ok(f.waterDepth[i]>=0&&f.waterDepth[i]<=1,'Water depth bounded');
  if(mask[i])for(const j of gridNeighbors(i,w,h,layer.topology))boundary+=!mask[j];
  const j=f.flowTo[i];if(j<0)continue;
  assert.ok(Number.isInteger(j)&&j<n,'Bounded downstream index');assert.ok(gridNeighbors(i,w,h,layer.topology).includes(j),'Physical downstream neighbour');
  assert.ok(f.flowRank[j]<f.flowRank[i],'Acyclic surface drainage');
  if(['river','lake'].includes(f.waterType[i])&&['river','lake','sea'].includes(f.waterType[j]))assert.ok(bed[j]+f.waterDepth[j]<=bed[i]+f.waterDepth[i]+.000002,'Wet downstream water level does not climb');
 }
 const coreWidths=landGroups.map((cells,index)=>{
  const one=new Uint8Array(n);for(const i of cells)one[i]=1;
  const width=coastCoreWidth(one,w,h,layer.topology);
  assert.ok(width.primary.lostFraction<=.04,`${spec.structure}/${spec.mode}/${spec.size}/${spec.seed}/${spec.coastErosion} core${index}: thin-loss ${width.primary.lostFraction}`);
  return{index,landCells:cells.length,...width};
 });
 const shape=coastlineMetrics(mask,{width:w,height:h,topology:layer.topology});
 const rhythm=spec.structure==='coast'?shoreReversals(mask,w,h):null;
 return{mask,report:{landCells,seaCells,riverCells:f.waterType.filter(v=>v==='river').length,lakeCells:f.waterType.filter(v=>v==='lake').length,landComponents:landGroups.map(g=>g.length),seaComponents:seaGroups.length,seaHash:hash(Array.from(mask)),boundary,coreWidths,maxThinLoss:Math.max(...coreWidths.map(c=>c.primary.lostFraction)),shape,...(rhythm?{shoreTurns:rhythm.turns,shoreRange:rhythm.range}:{}),sourceNavigation:true,sourceAccess:true}};
}
async function capture(project,spec,mask,images){
 const [layer]=await materialize(project),stem=[spec.structure,spec.mode,spec.size,'seed'+spec.seed,'erosion'+spec.coastErosion].join('-'),out={};
 for(const channel of ['silhouette','material','elevation']){
  const view=channel==='silhouette'?{...layer,solid:Array(mask.length).fill(0),traits:Array(mask.length).fill('normal'),biome:Array.from(mask,v=>v?'plains':'ocean'),material:Array.from(mask,v=>v?'grass':'sea'),water:Array.from(mask,v=>v?'none':'sea')}:layer;
  const file=prefix+stem+'-'+channel+'.png',bytes=encodePNG(rasterizeLayer(view,{channel:channel==='silhouette'?'biome':channel,scale:spec.size===100?3:2,transparent:false}));
  await writeFile(path.join(root,'evidence',file),bytes);out[channel]=file;images.push({file,bytes:bytes.length,...spec,channel});
 }
 return out;
}
function comparison(rows){
 const title={coast:'Суша с берегом моря',islands:'Острова'};
 const section=r=>'<figure><figcaption>Эрозия '+r.coastErosion+' · потери тонкой суши '+(r.maxThinLoss*100).toFixed(2)+'%</figcaption><img loading="lazy" src="'+r.file+'" alt="'+r.structure+' '+r.mode+' '+r.size+' erosion'+r.coastErosion+'"></figure>';
 const articles=structures.flatMap(structure=>modes.flatMap(mode=>sizes.map(size=>'<article><h2>'+title[structure]+' · '+mode+' · '+size+'×'+size+' · seed42</h2>'+['silhouette','material','elevation'].map(channel=>'<h3>'+({silhouette:'Контур суши',material:'Материалы',elevation:'Высота'})[channel]+'</h3><div class="row">'+erosions.map(value=>{const r=rows.find(r=>r.structure===structure&&r.mode===mode&&r.size===size&&r.coastErosion===value&&!r.holdout);return section({...r,file:r.images[channel]});}).join('')+'</div>').join('')+'</article>')));
 const holdouts=rows.filter(r=>r.holdout).map(r=>'<article><h2>'+title[r.structure]+' · '+r.mode+' · 300×300 · контрольный seed7</h2><div class="row">'+['silhouette','material','elevation'].map(channel=>section({...r,file:r.images[channel]})).join('')+'</div></article>');
 return'<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Берег и острова: эрозия 0 / 50 / 100</title><style>body{background:#101a1e;color:#def;font:14px system-ui;margin:20px}main{max-width:1600px}article{margin-bottom:36px}.row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}figure{margin:8px 0;min-width:0}figcaption{padding:6px 0}img{width:100%;image-rendering:pixelated}@media(max-width:650px){.row{grid-template-columns:1fr}}</style><h1>Побережье и острова: эрозия 0 / 50 / 100</h1><p>Новые готовые карты обеих сеток100×100 и300×300. Геологическая суша75%, включая внутреннюю пресную воду. Одинаковые seed и карточки: лес25%, горы25%, болота10%, остальные40% луга. Метрики не заменяют визуальную оценку формы и отсутствие повторяющейся гребёнки.</p><main>'+articles.join('')+holdouts.join('')+'</main></html>';
}
export async function verifySeaErosion(){
 const started=new Date().toISOString(),rows=[],controls=[],repeats=[],images=[],complexity=[];let activeSpec;
 const save=async error=>{
  const result={ok:!error,started,finished:new Date().toISOString(),actualMaps:rows.length,plannedMaps:specs.length,onlyMapSizes:sizes,rows,controls,repeats,images,complexity,thinGate:{maximumLoss:.04,openingRadiusProportion:.047,eachNativeIslandChecked:true},rhythm:'Reported rather than rewarded; no minimum number of bays. Root visual review required for repetitive motifs.',...(error?{failedSpec:activeSpec,error:error.message,stack:error.stack}:{})};
  await writeFile(artifact('matrix.json'),JSON.stringify(result,null,2)+'\n','utf8');return result;
 };
 try{
  for(const spec of specs){
   activeSpec=spec;
   const recipe=await createRecipe(spec.mode);recipe.seed=spec.seed;
   Object.assign(recipe.generation,{width:spec.size,height:spec.size,layers:{above:0,underground:0},landscape:{structure:spec.structure,baseBiome:'meadow',biomes:structuredClone(cards),landPercent:75,uniformity:50,coastErosion:spec.coastErosion}});
   const original=hash(recipe),start=performance.now(),project=await generateBase(recipe),generated=performance.now(),validation=await validateProject(project);
   assert.equal(hash(recipe),original,'Caller recipe immutable');assert.ok(validation.ok,JSON.stringify(validation.errors));
   const inspected=inspect(project,spec),row={...spec,checksum:project.checksum,generateMs:Math.round(generated-start),validateMs:Math.round(performance.now()-generated),valid:true,...inspected.report};
   rows.push(row);row.images=await capture(project,spec,inspected.mask,images);
   if(spec.size===100&&spec.coastErosion===100){
    if(spec.mode==='landscape'){const repeated=await generateBase(recipe);assert.equal(repeated.checksum,project.checksum,'Exact repeated recipe');repeats.push({structure:spec.structure,mode:spec.mode,size:spec.size,checksum:project.checksum,exact:true});}
    const changed=structuredClone(recipe);Object.assign(changed.generation.landscape,{uniformity:spec.structure==='coast'?0:100,biomes:[]});
    const p=await generateBase(changed),a=inspect(p,{...spec,controlCards:[]});assert.equal(a.report.seaHash,row.seaHash,'Cards and uniformity do not change the marine mask');assert.ok((await validateProject(p)).ok);
    controls.push({structure:spec.structure,mode:spec.mode,size:spec.size,uniformity:changed.generation.landscape.uniformity,cardCount:0,seaHash:a.report.seaHash,valid:true});
   }
   console.log(JSON.stringify({done:rows.length,total:specs.length,...spec,generateMs:row.generateMs,thinLoss:row.maxThinLoss,boundary:row.boundary}));
  }
  for(const structure of structures){
   const levels=erosions.map(coastErosion=>{
    const selected=rows.filter(r=>r.structure===structure&&r.coastErosion===coastErosion&&!r.holdout);
    return{coastErosion,normalizedBoundary:selected.reduce((s,r)=>s+r.boundary/r.size,0)/selected.length,coarseCoastToHull:selected.reduce((s,r)=>s+r.shape.scales[2].coastToHull,0)/selected.length,concavity:selected.reduce((s,r)=>s+r.shape.scales[2].concavity,0)/selected.length};
   });
   complexity.push({structure,levels});assert.ok(levels[0].normalizedBoundary<levels[1].normalizedBoundary&&levels[1].normalizedBoundary<levels[2].normalizedBoundary,'Aggregate actual coastline length increases0<50<100');
   assert.ok(levels[2].concavity>levels[0].concavity,'Maximum erosion adds geographical concavity, not just pixel noise');
  }
  await writeFile(artifact('comparison.html'),comparison(rows),'utf8');const result=await save();
  console.log(JSON.stringify({ok:result.ok,actualMaps:rows.length,controls:controls.length,repeats:repeats.length,images:images.length}));return result;
 }catch(error){await save(error);throw error;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 if(process.argv.includes('--plan'))console.log(JSON.stringify({actualMaps:specs.length,controls:structures.length*2,repeats:structures.length,onlyMapSizes:sizes,specs},null,2));
 else await verifySeaErosion();
}
