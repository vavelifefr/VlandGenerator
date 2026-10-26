// Actual application maps, rendered with the shared biome raster in a private headless browser.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRecipe,generateBase,materialize} from '../app/index.mjs';
import {rasterizeLayer,encodePNG,cellColor} from '../app/raster.mjs';
import {terrainLegendEntries} from '../app/display-colors.mjs';
import {gridNeighbors} from '../engine/core/topology.mjs';

const out=new URL('../evidence/',import.meta.url),cases=[];
await mkdir(out,{recursive:true});
const structures={coast:'Побережье',islands:'Острова'},modes={landscape:'Квадратная сетка',hexlandscape:'Шестиугольная сетка'};
const hexColor=rgb=>'#'+rgb.map(v=>v.toString(16).padStart(2,'0')).join('');
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
for(const structure of Object.keys(structures))for(const mode of Object.keys(modes))for(const size of [100,300]){
 const recipe=await createRecipe(mode);recipe.seed=42;Object.assign(recipe.generation,{width:size,height:size,layers:{above:0,underground:0}});
 Object.assign(recipe.generation.landscape,{structure,baseBiome:'meadow',biomes:[],landPercent:75,coastErosion:50,uniformity:50});
 const project=await generateBase(recipe),layer=(await materialize(project))[0],f=project.source.layers[0].fields,n=size*size;
 const sea=f.waterType.filter(v=>v==='sea').length,shallow=f.biome.flatMap((v,i)=>v==='shallow-water'?[i]:[]),seen=new Uint8Array(n);
 let landComponents=0;
 for(let i=0;i<n;i++)if(!seen[i]&&f.waterType[i]!=='sea'){
  landComponents++;const q=[i];seen[i]=1;
  for(let a=0;a<q.length;a++)for(const j of gridNeighbors(q[a],size,size,layer.topology))if(!seen[j]&&f.waterType[j]!=='sea'){seen[j]=1;q.push(j);}
 }
 assert.equal(n-sea,n*.75);assert.ok(shallow.length>0&&f.biome.includes('ocean'));
 assert.ok(shallow.every(i=>f.waterType[i]==='sea'&&f.waterDepth[i]>0&&f.waterDepth[i]<=.12));
 assert.ok(shallow.every(i=>layer.biome[i]==='shallow-water'));
 if(structure==='islands')assert.equal(landComponents,3);
 const color=hexColor(cellColor(layer,shallow[0],'biome'));assert.equal(color,'#65b7bd');
 const scale=size===100?(mode==='landscape'?6:4):2,raster=rasterizeLayer(layer,{channel:'biome',scale,transparent:false}),name=`shallow-water-${structure}-${mode}-${size}.png`;
 await writeFile(new URL(name,out),encodePNG(raster));
 const row={structure,mode,size,name,seed:42,generation:recipe.generation,fingerprint:project.source.fingerprint,seaCells:sea,shallowCells:shallow.length,shallowPercentOfSea:Math.round(shallow.length/sea*1000)/10,geologicalLandPercent:75,landComponents,shallowColor:color,legend:terrainLegendEntries(layer,'biome'),raster:{width:raster.width,height:raster.height}};
 cases.push(row);console.log(JSON.stringify({structure,mode,size,shallowCells:row.shallowCells,shallowPercentOfSea:row.shallowPercentOfSea,landComponents}));
}
const card=c=>`<article><h2>${modes[c.mode]} · ${c.size}×${c.size}</h2><p class="metric">Мелководье: ${c.shallowPercentOfSea.toLocaleString('ru-RU')}% морских клеток · ${c.shallowCells.toLocaleString('ru-RU')} клеток</p><a class="map" href="${c.name}" title="Открыть исходный PNG"><img src="${c.name}" alt="${structures[c.structure]}, ${modes[c.mode]}, ${c.size} на ${c.size}"></a><div class="legend">${c.legend.map(e=>`<span><i style="background:${e.color}"></i>${escape(e.name)}</span>`).join('')}</div></article>`;
const html=`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Мелководье · побережье и острова</title><style>*{box-sizing:border-box}body{margin:0;background:#0f1a1e;color:#e5eeee;font:16px "Segoe UI",sans-serif}section{padding:26px;width:1240px;max-width:100%;background:#0f1a1e}h1{font-size:30px;margin:0 0 12px}h2{font-size:21px;margin:0 0 7px}p{margin:0 0 12px;color:#b9cdcb}.key{display:flex;gap:24px;flex-wrap:wrap;margin:16px 0 22px}.key span,.legend span{display:inline-flex;align-items:center;gap:7px}i{display:inline-block;width:14px;height:14px;border-radius:2px;flex-shrink:0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:24px 20px}article{min-width:0}.metric{font-size:15px}.map{height:558px;display:flex;align-items:center;justify-content:center;background:#122025;border:1px solid #2c4348;padding:6px}.map img{max-width:100%;max-height:100%;object-fit:contain;image-rendering:pixelated}.legend{display:flex;flex-wrap:wrap;gap:7px 14px;font-size:13px;margin-top:10px;color:#bdd0cc}.note{font-size:14px;margin-top:20px;line-height:1.5}a{color:#9fd9cf}@media(max-width:700px){.grid{grid-template-columns:1fr}.map{height:auto;min-height:260px}.map img{width:100%;height:auto}h1{font-size:25px}}</style>${Object.entries(structures).map(([structure,title])=>`<section data-structure="${structure}"><h1>${title}: мелководье на обеих сетках</h1><p>Seed 42 · геологическая суша 75% · эрозия берега 50 · базовый биом «Луга»</p><div class="key"><span><i style="background:#65b7bd"></i><b>Мелководье</b></span><span>Реальные карты генератора · вид «Биомы»</span></div><div class="grid">${cases.filter(c=>c.structure===structure).map(card).join('')}</div><p class="note">Светло-бирюзовое — мелкая морская вода. Глубина и расстояние до берега определяют ширину этой зоны.<br>Доля суши включает внутреннюю пресную воду.${structure==='islands'?' На каждой карте — три отдельных острова.':''} Нажмите на карту, чтобы открыть исходный PNG.</p></section>`).join('')}</html>`;
const htmlUrl=new URL('shallow-water-comparison.html',out);await writeFile(htmlUrl,html,'utf8');
assert.ok(process.env.VLAND_PLAYWRIGHT_MODULE&&process.env.VLAND_CHROMIUM_EXECUTABLE,'Use the existing QA browser environment; do not install dependencies');
const {chromium}=await import(pathToFileURL(process.env.VLAND_PLAYWRIGHT_MODULE)),browser=await chromium.launch({headless:true,executablePath:process.env.VLAND_CHROMIUM_EXECUTABLE});
try{
 const page=await browser.newPage({viewport:{width:1240,height:900},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(pathToFileURL(fileURLToPath(htmlUrl)).href);await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));await page.evaluate(()=>document.fonts.ready);
 assert.deepEqual(errors,[]);assert.equal(await page.locator('article').count(),8);assert.equal(await page.locator('img').evaluateAll(images=>images.every(i=>i.naturalWidth>0)),true);
 for(const structure of Object.keys(structures)){
  await page.evaluate(structure=>{for(const section of document.querySelectorAll('section'))section.hidden=section.dataset.structure!==structure;window.scrollTo(0,0);},structure);
  await page.screenshot({fullPage:true,path:fileURLToPath(new URL(`shallow-water-comparison-${structure}.png`,out))});
 }
 await page.evaluate(()=>{for(const section of document.querySelectorAll('section'))section.hidden=false;window.scrollTo(0,0);});
 await page.setViewportSize({width:360,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
}finally{await browser.close();}
await writeFile(new URL('shallow-water-comparison.json',out),JSON.stringify({ok:true,seed:42,channel:'biome',generatedFrom:'app.generateBase + app.materialize',maps:cases.length,headless:true,userTabsTouched:false,browserImagesLoaded:true,mobileWidth360NoOverflow:true,cases},null,2)+'\n','utf8');
console.log('PASS: eight real maps, two comparison images, self-contained local gallery and metrics.');
