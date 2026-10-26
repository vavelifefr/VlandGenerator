// Engine silhouette preview only. Actual-provider navigation/content QA is separate.
import {writeFile,readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {normalizeAtlasRequest} from '../engine/api/atlas-catalog.mjs';
import {atlasSeed} from '../engine/core/atlas-landforms.mjs';
import {landscapeElevation} from '../engine/core/landscape-profile.mjs';
import {rasterizeLayer,encodePNG} from '../app/raster.mjs';
import {hash} from '../content/common.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),out=name=>path.join(root,'evidence','island-natural-'+name);
const request=(structure,kind,size,seed,erosion)=>normalizeAtlasRequest({schema:'vland.atlas.request',schemaVersion:1,width:size,height:size,seed,topology:{kind},layers:{above:0,underground:0},landscape:{structure,baseBiome:'meadow',biomes:[],landPercent:75,coastErosion:erosion,uniformity:50}});
const values=r=>{const derived=atlasSeed(r,'surface','relief');return Float64Array.from({length:r.width*r.height},(_,i)=>landscapeElevation(.5,r,i%r.width,Math.floor(i/r.width),derived));};
const baseline=JSON.parse(await readFile(out('unchanged-baseline.json'),'utf8'));
for(const row of baseline.rows){const value=values(request(row.structure,row.kind,row.size,42,row.erosion));assert.equal(createHash('sha256').update(Buffer.from(value.buffer)).digest('hex'),row.sha,'Unchanged '+JSON.stringify(row));}
const rows=[];
for(const seed of [42,7])for(const kind of ['square','hex'])for(const size of [100,300])for(const erosion of [0,50,100]){
 const r=request('islands',kind,size,seed,erosion),a=Uint8Array.from(values(r),v=>+(v>.36)),layer={width:size,height:size,topology:{kind},solid:Array(a.length).fill(0),traits:Array(a.length).fill('normal'),biome:Array.from(a,v=>v?'plains':'ocean'),material:Array.from(a,v=>v?'grass':'sea'),water:Array.from(a,v=>v?'none':'sea')},file='island-natural-preview-'+kind+'-'+size+'-'+seed+'-'+erosion+'.png';
 await writeFile(path.join(root,'evidence',file),encodePNG(rasterizeLayer(layer,{channel:'biome',scale:size===100?3:1,transparent:false})));rows.push({kind,size,seed,erosion,file,maskHash:hash(Array.from(a))});
}
const html='<!doctype html><html lang="ru"><meta charset="utf-8"><title>Новая форма островов</title><style>body{background:#101a1e;color:#def;font:16px system-ui;margin:20px}article{margin-bottom:25px}.row{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}figure{margin:0}img{width:100%;image-rendering:pixelated}</style><h1>Острова: эрозия 0 / 50 / 100 · суша75%</h1>'+[42,7].flatMap(seed=>['square','hex'].flatMap(kind=>[100,300].map(size=>'<article data-seed="'+seed+'"><h2>'+kind+' · '+size+'×'+size+' · seed'+seed+'</h2><div class="row">'+[0,50,100].map(erosion=>'<figure><figcaption>Эрозия '+erosion+'</figcaption><img src="'+rows.find(r=>r.kind===kind&&r.size===size&&r.seed===seed&&r.erosion===erosion).file+'"></figure>').join('')+'</div></article>'))).join('')+'</html>';
await writeFile(out('preview.html'),html,'utf8');
await writeFile(out('preview.json'),JSON.stringify({enginePreview:true,unchangedStructureChecks:baseline.rows.length,rows},null,2)+'\n','utf8');
if(process.env.VLAND_PLAYWRIGHT_MODULE){const{chromium}=await import(pathToFileURL(process.env.VLAND_PLAYWRIGHT_MODULE)),browser=await chromium.launch({headless:true,...(process.env.VLAND_CHROMIUM_EXECUTABLE?{executablePath:process.env.VLAND_CHROMIUM_EXECUTABLE}:{})});try{for(const seed of [42,7]){const page=await browser.newPage({viewport:{width:1200,height:1400}});await page.goto(pathToFileURL(out('preview.html')).href);await page.evaluate(seed=>{for(const article of document.querySelectorAll('article'))if(Number(article.dataset.seed)!==seed)article.remove();},seed);await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth));await page.screenshot({path:out('review-'+seed+'.png'),fullPage:true});await page.close();}}finally{await browser.close();}}
console.log(JSON.stringify({enginePreview:true,unchangedStructureChecks:baseline.rows.length,images:rows.length}));
