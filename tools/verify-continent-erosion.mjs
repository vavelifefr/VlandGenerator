// Fresh synthetic RAM recipes only: no saved project, authored fixture,
// working session, live server or desktop is read or changed.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRecipe,generateBase,validateProject,materialize} from '../app/index.mjs';
import {hash} from '../content/common.mjs';
import {gridNeighbors} from '../engine/core/topology.mjs';
import {rasterizeLayer,encodePNG} from '../app/raster.mjs';
import {coastlineMetrics} from './verify-coastlines.mjs';
import {coastCoreWidth} from './verify-coast-correction.mjs';
import {marineBayDepth,longestAxisShore} from './continent-shape-metrics.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)),prefix='continent-erosion-',artifact=name=>path.join(root,'evidence',prefix+name),started=new Date().toISOString();
const rows=[],controls=[],repeats=[],images=[],sizes=[100,300],modes=['landscape','hexlandscape'];
const cards=[{id:'woodland',type:'forest',percent:25},{id:'ridge',type:'mountains',percent:25},{id:'wet-valley',type:'swamp',percent:10}];
const specs=modes.flatMap(mode=>sizes.flatMap(size=>[0,50,100].map(coastErosion=>({mode,size,coastErosion,seed:42}))));
specs.push(...modes.map(mode=>({mode,size:300,coastErosion:100,seed:7,holdout:true})));
function components(mask,w,h,topology){let count=0;const seen=new Uint8Array(mask.length);for(let i=0;i<mask.length;i++)if(mask[i]&&!seen[i]){count++;const queue=[i];seen[i]=1;for(let at=0;at<queue.length;at++)for(const j of gridNeighbors(queue[at],w,h,topology))if(mask[j]&&!seen[j]){seen[j]=1;queue.push(j);}}return count;}
function inspect(project,spec){
 const layer=project.source.layers.find(l=>l.id==='surface'),f=layer.fields,n=spec.size**2,sea=project.source.hydrology.seaLevel,mask=Uint8Array.from(f.heightmap??f.elevation,v=>+(v>sea));
 assert.equal(layer.board.width,spec.size);assert.equal(layer.board.height,spec.size);assert.ok(project.source.navigation.ok);assert.ok(project.source.access.ok);assert.equal(project.sources.length,0);assert.equal(project.edits.length,0);assert.equal(project.revision,0);
 const landCells=mask.reduce((s,v)=>s+v,0),seaCells=f.waterType.filter(v=>v==='sea').length;
 assert.equal(landCells,Math.round(n*.75),'Exact geological land quota includes inland freshwater');assert.equal(seaCells,n-landCells,'Visible sea is exactly the complement');
 assert.equal(components(mask,spec.size,spec.size,layer.topology),1);assert.equal(components(Uint8Array.from(mask,v=>1-v),spec.size,spec.size,layer.topology),1);
 assert.ok(mask.every((v,i)=>!(i<spec.size||i>=n-spec.size||i%spec.size===0||i%spec.size===spec.size-1)||!v),'Connected sea frame');
 let boundary=0,x0=spec.size,y0=spec.size,x1=0,y1=0;
 for(let i=0;i<n;i++){
  if(mask[i]){const x=i%spec.size,y=Math.floor(i/spec.size);x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);for(const j of gridNeighbors(i,spec.size,spec.size,layer.topology))boundary+=!mask[j];}
  const j=f.flowTo[i];if(j>=0){assert.ok(gridNeighbors(i,spec.size,spec.size,layer.topology).includes(j),'Physical downstream neighbour');assert.ok(f.flowRank[j]<f.flowRank[i],'Acyclic surface drainage');}
 }
 const boxFill=landCells/((x1-x0+1)*(y1-y0+1)),width=coastCoreWidth(mask,spec.size,spec.size,layer.topology),shape=coastlineMetrics(mask,{width:spec.size,height:spec.size,topology:layer.topology});
 assert.ok(width.primary.lostFraction<=.04,'Broad usable coastline; no thin comb');if(spec.coastErosion===0)assert.ok(boxFill>.94,'Rounded rectangular baseline');
 const marineDepth=marineBayDepth(mask,spec.size,spec.size,layer.topology),straightShore=longestAxisShore(mask,spec.size,spec.size);
 if(spec.coastErosion===100){assert.ok(shape.scales[2].concavity>=.12,'Maximum erosion has substantial regional coves');assert.ok(marineDepth.fractionOfSide>=.1,'Connected exterior sea deeply enters the landmass');assert.ok(straightShore.fractionOfSide<=.2,'Outer contour has no long axis-aligned rim');}
 return{mask,report:{landCells,seaCells,riverCells:f.waterType.filter(v=>v==='river').length,lakeCells:f.waterType.filter(v=>v==='lake').length,landComponents:1,seaComponents:1,seaHash:hash(Array.from(mask)),boundary,boxFill,thinLoss:width.primary.lostFraction,shape,marineDepth,straightShore,sourceNavigation:true,sourceAccess:true}};
}
async function capture(project,spec,mask){
 const [layer]=await materialize(project),stem=spec.mode+'-'+spec.size+'-seed'+spec.seed+'-erosion'+spec.coastErosion,out={};
 for(const channel of ['material','biome','elevation','silhouette']){
  const view=channel==='silhouette'?{...layer,solid:Array(mask.length).fill(0),traits:Array(mask.length).fill('normal'),biome:Array.from(mask,v=>v?'plains':'ocean'),material:Array.from(mask,v=>v?'grass':'sea'),water:Array.from(mask,v=>v?'none':'sea')}:layer,
   file=prefix+stem+'-'+channel+'.png',bytes=encodePNG(rasterizeLayer(view,{channel:channel==='silhouette'?'biome':channel,scale:spec.size===100?3:2,transparent:false}));
  await writeFile(path.join(root,'evidence',file),bytes);out[channel]=file;images.push({file,bytes:bytes.length,...spec,channel});
 }
 return out;
}
async function save(error){const result={ok:!error,started,finished:new Date().toISOString(),actualMaps:rows.length,plannedMaps:specs.length,onlyMapSizes:sizes,rows,controls,repeats,images,visualAcceptance:'Metrics constrain coherent geometry; comparison PNGs require visual review.',...(error?{error:error.message,stack:error.stack}:{})};await writeFile(artifact('matrix.json'),JSON.stringify(result,null,2)+'\n','utf8');return result;}
try{
 for(const spec of specs){
  const recipe=await createRecipe(spec.mode);recipe.seed=spec.seed;Object.assign(recipe.generation,{width:spec.size,height:spec.size,layers:{above:0,underground:0},landscape:{structure:'continent',baseBiome:'meadow',biomes:structuredClone(cards),landPercent:75,uniformity:50,coastErosion:spec.coastErosion}});
  const original=hash(recipe),start=performance.now(),project=await generateBase(recipe),generated=performance.now(),validation=await validateProject(project);assert.equal(hash(recipe),original);assert.ok(validation.ok,JSON.stringify(validation.errors));
  const inspected=inspect(project,spec),row={...spec,checksum:project.checksum,generateMs:Math.round(generated-start),validateMs:Math.round(performance.now()-generated),valid:true,...inspected.report};rows.push(row);row.images=await capture(project,spec,inspected.mask);
  if(spec.size===100&&spec.coastErosion===100){
   const repeated=await generateBase(recipe);assert.equal(repeated.checksum,project.checksum);repeats.push({mode:spec.mode,size:spec.size,checksum:project.checksum,exact:true});
   for(const control of [{uniformity:0,biomes:cards},{uniformity:100,biomes:cards},{uniformity:50,biomes:[]}]){
    const changed=structuredClone(recipe);Object.assign(changed.generation.landscape,structuredClone(control));const p=await generateBase(changed),a=inspect(p,spec);assert.equal(a.report.seaHash,row.seaHash,'Cards and distribution settings never change erosion or sea quota');assert.ok((await validateProject(p)).ok);controls.push({mode:spec.mode,size:spec.size,uniformity:control.uniformity,cardCount:control.biomes.length,seaHash:a.report.seaHash,valid:true});
   }
  }
  console.log(JSON.stringify({done:rows.length,total:specs.length,...spec,generateMs:row.generateMs,thinLoss:row.thinLoss,boundary:row.boundary}));
 }
 for(const mode of modes)for(const size of sizes){const group=rows.filter(r=>r.mode===mode&&r.size===size&&!r.holdout).sort((a,b)=>a.coastErosion-b.coastErosion);assert.ok(group[0].boundary<group[1].boundary&&group[1].boundary<group[2].boundary,'Actual-provider coastline complexity increases0<50<100');assert.ok(group[2].boundary/group[0].boundary>=1.45,'Maximum erosion increases coast length by at least45%');assert.ok(group[2].shape.scales[2].concavity>group[0].shape.scales[2].concavity,'Higher erosion adds actual coves, not just pixel noise');}
 const articles=modes.flatMap(mode=>sizes.map(size=>'<article><h2>'+mode+' · '+size+'×'+size+' · seed42</h2>'+['silhouette','material','biome','elevation'].map(channel=>'<div class="row">'+[0,50,100].map(value=>{const r=rows.find(r=>r.mode===mode&&r.size===size&&r.coastErosion===value&&!r.holdout);return'<figure><figcaption>Эрозия '+value+' · '+channel+' · потеря тонкой суши '+(r.thinLoss*100).toFixed(2)+'%</figcaption><img loading="lazy" src="'+r.images[channel]+'" alt="'+mode+' '+size+' '+channel+' erosion'+value+'"></figure>';}).join('')+'</div>').join('')+'</article>'));
 const holdouts=rows.filter(r=>r.holdout).map(r=>'<article><h2>'+r.mode+' · 300×300 · контрольный seed7 · эрозия100</h2><div class="row">'+['silhouette','material','elevation'].map(channel=>'<figure><figcaption>'+channel+'</figcaption><img loading="lazy" src="'+r.images[channel]+'" alt="Контрольный seed7 '+channel+'"></figure>').join('')+'</div></article>');
 await writeFile(artifact('comparison.html'),'<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Континент: эрозия берега</title><style>body{background:#101a1e;color:#def;font:14px system-ui;margin:20px}main{max-width:1600px}article{margin-bottom:36px}.row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}figure{margin:8px 0;min-width:0}figcaption{padding:6px 0}img{width:100%;image-rendering:pixelated}@media(max-width:650px){.row{grid-template-columns:1fr}}</style><h1>Континент: эрозия берега0 / 50 / 100</h1><p>Реальные новые карты обеих сеток100×100 и300×300. Геологическая суша75%, включая внутреннюю пресную воду. Одинаковые seed и карточки: лес25%, горы25%, болота10%, остальные40% луга. Силуэт, материалы, биомы и высота представлены отдельно; метрики не заменяют оценку формы.</p><main>'+articles.join('')+holdouts.join('')+'</main></html>','utf8');
 const result=await save();console.log(JSON.stringify({ok:result.ok,actualMaps:rows.length,controls:controls.length,repeats:repeats.length,images:images.length}));
}catch(error){await save(error);throw error;}
