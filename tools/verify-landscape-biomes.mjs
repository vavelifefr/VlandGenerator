// Actual fresh RAM projects only. No authored source, fixture, saved project,
// session state, live server or desktop access is used by this audit.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRecipe,generateBase,validateProject,materialize} from '../app/index.mjs';
import {hash} from '../content/common.mjs';
import {surfaceFields,atlasSeed} from '../engine/core/atlas-landforms.mjs';
import {applyLandscapeRegions} from '../engine/core/landscape-regions.mjs';
import {gridNeighbors} from '../engine/core/topology.mjs';
import {rasterizeLayer,encodePNG} from '../app/raster.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)),artifact=name=>path.join(root,'evidence','landscape-biomes-'+name),started=new Date().toISOString();
const types=['meadow','forest','swamp','desert','mountains','snow','volcanic'],modes=['landscape','hexlandscape'],sizes=[50,128,300],seeds=[7,42,2026],rows=[],images=[],repeats=[];
const family={meadow:['plains'],forest:['forest'],swamp:['wetland'],desert:['desert','cold-desert'],mountains:['alpine','foothills','snow','cliffs'],snow:['snow','tundra'],volcanic:['volcanic']};
const specs=[];
for(const mode of modes)for(const size of sizes)for(let k=0;k<types.length;k++)specs.push({mode,size,base:types[k],addon:types[(k+1)%types.length],seed:seeds[k%seeds.length],structure:'land'});
for(const mode of modes)for(const size of [128,300])for(let k=0;k<3;k++)specs.push({mode,size,base:['swamp','mountains','volcanic'][k],addon:['forest','snow','desert'][k],seed:seeds[k],structure:['coast','islands','continent'][k]});
function allocation(cards,dry,base){const parts=[...cards.map(c=>({type:c.type,units:Math.round(c.percent*10)})),{type:base,units:1000-cards.reduce((n,c)=>n+Math.round(c.percent*10),0)}],counts=parts.map(p=>Math.floor(dry*p.units/1000)),order=parts.map((p,i)=>({i,remainder:dry*p.units%1000})).sort((a,b)=>b.remainder-a.remainder||a.i-b.i);for(let k=0,rest=dry-counts.reduce((a,b)=>a+b,0);k<rest;k++)counts[order[k].i]++;const target={};parts.forEach((p,i)=>target[p.type]=(target[p.type]??0)+counts[i]);return target;}
function analyze(project,spec){
 const layer=project.source.layers.find(l=>l.id==='surface'),f=layer.fields,r=project.source.request,n=spec.size**2,sea=project.source.hydrology.seaLevel,bed=f.heightmap??f.elevation;
 assert.equal(layer.board.width,spec.size);assert.equal(layer.board.height,spec.size);assert.ok(project.source.navigation.ok);assert.ok(project.source.access.ok);assert.equal(project.sources.length,0);assert.equal(project.edits.length,0);assert.equal(project.revision,0);
 // Primary region labels are intentionally not a public source field. Rebuild
 // the exact pre-region phase from the same normalized request: card-free
 // Surface leaves its original climate untouched. Restore its empty slope
 // array because the generation pipeline fills slope only after territories.
 const controlRequest=structuredClone(r);controlRequest.landscape.biomes=[];const before=surfaceFields(controlRequest).fields;
 assert.deepEqual(before.elevation,bed,'cards preserve the immutable heightmap');
 for(const key of ['waterType','waterDepth','flowTo','flowRank','drainage','basin','filledElevation'])assert.deepEqual(before[key],f[key],'cards preserve '+key);
 const phase=structuredClone(before);phase.slope=[];const labels=applyLandscapeRegions(phase,r,atlasSeed(r,'surface','relief')),dry=f.waterType.filter(t=>t==='none').length,target=allocation(r.landscape.biomes,dry,r.landscape.baseBiome),quota={},cores={};
 for(const type of Object.keys(target)){
  const cells=labels.flatMap((t,i)=>t===type&&f.waterType[i]==='none'?[i]:[]),core=cells.filter(i=>family[type].includes(f.biome[i])).length;
  assert.equal(cells.length,target[type],spec.base+' '+type+' exact final dry-land quota');assert.ok(core>0,type+' retains its named visible family');quota[type]=cells.length;cores[type]={namedFamilyCells:core,regionCells:cells.length,fraction:core/cells.length};
 }
 let transitions=0,rivers=0,lakes=0;
 for(let i=0;i<n;i++){
  assert.ok(Number.isFinite(f.transitionStrength[i])&&f.transitionStrength[i]>=0&&f.transitionStrength[i]<=.5,'bounded display transition');
  if(f.transitionStrength[i]>0){transitions++;assert.equal(f.waterType[i],'none');assert.ok(f.secondaryBiome[i]);assert.notEqual(f.secondaryBiome[i],f.biome[i]);}
  const j=f.flowTo[i];if(j>=0){assert.ok(gridNeighbors(i,spec.size,spec.size,layer.topology).includes(j));assert.ok(f.flowRank[j]<f.flowRank[i]);if(['river','lake'].includes(f.waterType[i])&&['river','lake','sea'].includes(f.waterType[j]))assert.ok(bed[j]+f.waterDepth[j]<=bed[i]+f.waterDepth[i]+.000002);}
  assert.ok(f.waterDepth[i]>=0&&f.waterDepth[i]<=1);if(f.waterType[i]==='river')rivers++;if(f.waterType[i]==='lake')lakes++;
 }
 const land=bed.filter(v=>v>sea).length;assert.equal(land,spec.structure==='land'?n:Math.round(n*.75));assert.equal(f.waterType.filter(t=>t==='sea').length,n-land);
 const tally={};for(const id of f.biome)tally[id]=(tally[id]??0)+1;
 return{dryCells:dry,landCells:land,seaCells:n-land,riverCells:rivers,lakeCells:lakes,quota,cores,transitionCells:transitions,biomeCounts:tally,cardHeightWaterFlowInvariant:true,sourceNavigation:true,sourceAccess:true,quotaEvidence:'Exact reconstructed pre-regions phase; primary region labels are not exported.'};
}
async function capture(project,spec){
 if(spec.size===50)return;const [layer]=await materialize(project);
 for(const channel of spec.size===300&&spec.structure==='land'?['biome','material']:['biome']){const file=`landscape-biomes-${spec.mode}-${spec.size}-${spec.structure}-${spec.base}-${channel}.png`,bytes=encodePNG(rasterizeLayer(layer,{channel,scale:2,transparent:false}));await writeFile(path.join(root,'evidence',file),bytes);images.push({...spec,channel,file,bytes:bytes.length});}
}
async function save(error){const result={ok:!error,started,finished:new Date().toISOString(),actualMaps:rows.length,plannedMaps:specs.length,primaryLabelExported:false,quotaBasis:'Reconstructed pre-region Surface with the same normalized request and stage seed; checked against actual immutable height, water and flow.',rows,repeats,images,...(error?{error:error.message,stack:error.stack}:{})};await writeFile(artifact('matrix.json'),JSON.stringify(result,null,2)+'\n','utf8');return result;}
try{
 for(const spec of specs){
  const recipe=await createRecipe(spec.mode);recipe.seed=spec.seed;Object.assign(recipe.generation,{width:spec.size,height:spec.size,layers:{above:0,underground:0},landscape:{structure:spec.structure,baseBiome:spec.base,landPercent:75,uniformity:50,biomes:[{id:'region-'+spec.addon,type:spec.addon,percent:30}]}});
  const original=hash(recipe),start=performance.now(),project=await generateBase(recipe),generated=performance.now(),validation=await validateProject(project),validated=performance.now();assert.equal(hash(recipe),original);assert.ok(validation.ok,JSON.stringify(validation.errors));
  const row={...spec,checksum:project.checksum,generationMs:Math.round(generated-start),validationMs:Math.round(validated-generated),valid:true,...analyze(project,spec)};rows.push(row);await capture(project,spec);
  if(spec.size===128&&['swamp','volcanic'].includes(spec.base)&&spec.structure==='land'){const again=await generateBase(recipe);assert.equal(again.checksum,project.checksum);repeats.push({mode:spec.mode,size:spec.size,base:spec.base,exact:true});}
  console.log(JSON.stringify({done:rows.length,total:specs.length,...spec,generationMs:row.generationMs,validationMs:row.validationMs}));
 }
 const articles=modes.flatMap(mode=>[128,300].flatMap(size=>types.map(base=>{const group=images.filter(i=>i.mode===mode&&i.size===size&&i.base===base&&i.structure==='land');return'<article><h2>'+mode+' '+size+'×'+size+' · '+base+' + '+types[(types.indexOf(base)+1)%types.length]+'30%</h2><div>'+group.map(i=>'<figure><figcaption>'+i.channel+'</figcaption><img loading="lazy" src="'+i.file+'" alt="'+base+' '+i.channel+'"></figure>').join('')+'</div></article>';})));
 const sea=images.filter(i=>i.structure!=='land').map(i=>'<article><h2>'+i.mode+' '+i.size+' · '+i.structure+' · '+i.base+' + '+i.addon+'30%</h2><img loading="lazy" src="'+i.file+'" alt="'+i.base+'"></article>');
 await writeFile(artifact('comparison.html'),'<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Семь биомов — готовые карты</title><style>body{background:#101a1e;color:#def;font:14px system-ui;margin:20px}main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;max-width:1600px}h2{font-size:16px}article div{display:flex;gap:10px}figure{min-width:0;margin:0;flex:1}img{width:100%;image-rendering:pixelated}@media(max-width:700px){main{grid-template-columns:1fr}}</style><h1>Семь типов биомов: реальные готовые карты</h1><p>Каждый основной тип получает70% сухой площади, выбранный дополнительный30%. Сравнение обеих сеток128×128 и300×300; выборки с морем сохраняют75% геологической суши. Числа квот проверяются по восстановленной стадии территорий: первичные labels не экспортируются. Визуальная оценка формы дополняет эти проверки.</p><main>'+articles.join('')+sea.join('')+'</main></html>','utf8');
 const result=await save();console.log(JSON.stringify({ok:result.ok,actualMaps:rows.length,repeats:repeats.length,images:images.length}));
}catch(error){await save(error);throw error;}
