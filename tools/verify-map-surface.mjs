// Bounded regression QA in an unrelated copy and an isolated headless browser.
import assert from 'node:assert/strict';
import {cp,mkdir,mkdtemp,readFile,readdir,realpath,rm,stat,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),out=path.join(root,'evidence'),report={ok:false,browser:[],errors:[],native:[],ownCopy:true,headless:true},documents=[];
let parent,copy,server,browser;
const save=()=>writeFile(path.join(out,'map-surface-verification.json'),JSON.stringify(report,null,2)+'\n','utf8');
async function run(command,args,name,timeout=180000){return new Promise((resolve,reject)=>{
 const c=spawn(command,args,{cwd:copy,windowsHide:true,stdio:['ignore','pipe','pipe']}),chunks=[],timer=setTimeout(()=>c.kill(),timeout);
 c.stdout.on('data',v=>chunks.push(v));c.stderr.on('data',v=>chunks.push(v));c.once('error',reject);c.once('close',async code=>{clearTimeout(timer);const text=Buffer.concat(chunks).toString('utf8');await writeFile(path.join(out,'map-surface-'+name+'.log'),text,'utf8');code===0?resolve(text):reject(Error(name+': '+text.slice(-2200)));});
});}
async function download(page){return page.evaluate(async()=>{
 let result;const click=HTMLAnchorElement.prototype.click,create=URL.createObjectURL,blobs=new Map();
 URL.createObjectURL=function(b){const u=create.call(this,b);blobs.set(u,b);return u;};HTMLAnchorElement.prototype.click=function(){if(this.download?.endsWith('.json')){blobs.get(this.href)?.text().then(t=>result=JSON.parse(t));return;}return click.call(this);};
 try{document.querySelector('#export').click();[...document.querySelectorAll('#dialog-actions button')].find(b=>b.textContent==='Проект JSON').click();for(let i=0;i<1600&&!result;i++)await new Promise(r=>setTimeout(r,25));if(!result)throw Error('UI export timeout');document.querySelector('#dialog-close').click();return result;}finally{HTMLAnchorElement.prototype.click=click;URL.createObjectURL=create;}
});}
const ready=page=>page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Карта готова.')&&!document.querySelector('#sidebar').inert&&document.querySelector('#session-status').textContent==='Сессия сохранена',null,{timeout:120000});
async function fields(page,values){await page.evaluate(values=>{for(const[key,value]of Object.entries(values)){const el=document.querySelector('[data-path="'+key+'"]');if(!el)throw Error('Missing '+key);el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));}},values);}
try{
 parent=await mkdtemp(path.join(tmpdir(),'Vland-Map-Surface-'));copy=path.join(parent,'copy');await mkdir(copy);
 for(const e of await readdir(root,{withFileTypes:true}))if(!['.run','.git','projects','evidence','work'].includes(e.name))await cp(path.join(root,e.name),path.join(copy,e.name),{recursive:true});
 await mkdir(path.join(copy,'evidence'));report.temp=parent;await save();
 const app=await import(pathToFileURL(path.join(copy,'app/index.mjs'))),{generateSettlement}=await import(pathToFileURL(path.join(copy,'engine/api/settlements.mjs'))),{rasterizeLayer,encodePNG}=await import(pathToFileURL(path.join(copy,'app/raster.mjs'))),{createVlandServer}=await import(pathToFileURL(path.join(copy,'server.mjs')));
 server=createVlandServer({root:copy});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const post=async(base,operation,value,status=200)=>{const r=await fetch(base+'/api/'+operation,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});assert.equal(r.status,status,await r.clone().text());return r.json();};
 const images=[];documents.push({label:'new surface palette',schema:'schemas/display-palette.schema.json',value:{biome:{square:'#c1b49b',park:'#54865c',gravel:'#9c9989','shallow-water':'#65b7bd'}}});
 async function image(name,title,l,channel='material'){
  const png=encodePNG(rasterizeLayer(l,{channel,scale:l.width>=160?3:6,transparent:false}));
  for(const folder of [out,path.join(copy,'evidence')])await writeFile(path.join(folder,name+'.png'),png);
  images.push({name,title});
 }
 for(const mode of ['settlements','landscape','hexlandscape']){
  const recipe=await app.createRecipe(mode);recipe.seed=42;Object.assign(recipe.generation,{width:40,height:40});
  if(mode!=='settlements')recipe.generation.landscape={...recipe.generation.landscape,structure:'coast',baseBiome:'mountains',biomes:[{id:'gravel-area',type:'gravel',percent:25}]};
  const project=await app.generateBase(recipe),runtime=await app.exportRuntime(project),l=(await app.materialize(project))[0];
  assert.deepEqual(await post(base,'generate-base',{recipe}),project);assert.deepEqual(await post(base,'runtime',{project}),runtime);
  for(const [suffix,schema,value]of [['recipe','schemas/recipe.schema.json',recipe],['project','schemas/project.schema.json',project],['runtime','schemas/runtime.schema.json',runtime]])documents.push({label:mode+' '+suffix,schema,value});
  await writeFile(path.join(copy,mode+'-recipe.json'),JSON.stringify(recipe),'utf8');
  await run(process.execPath,['cli.mjs','generate-base',mode+'-recipe.json',mode+'-project.json'],mode+'-cli');
  assert.deepEqual(JSON.parse(await readFile(path.join(copy,mode+'-project.json'),'utf8')),project);
  report.native.push({mode,fingerprint:project.source.fingerprint,jsHttpCli:true,runtime:true});
  if(mode!=='settlements'){assert.ok(l.biome.includes('shallow-water'));await image('map-surface-'+mode,'Горы, гравий25% и мелководье · '+mode,l);if(mode==='landscape')await image('map-surface-height','Высоты · усиленный контраст',l,'elevation');}
 }
 for(const cityPercent of [25,60,100]){const recipe=await app.createRecipe('settlements');recipe.seed=42;Object.assign(recipe.generation,{width:100,height:100,cityPercent});const p=await app.generateBase(recipe);await image('map-surface-city-'+cityPercent,'Город · план '+cityPercent+'%',(await app.materialize(p))[0]);}
 for(const seed of [4163501467,2542161317,2098411840,3377461464]){const r=await app.createRecipe('settlements');r.seed=seed;Object.assign(r.generation,{width:160,height:160,streetWidth:1,terrain:{water:.5,relief:.5}});const p=await app.generateBase(r),f=p.source.atlas.layers[0].fields;await image('map-surface-reported-'+seed,'Исправленные берега · seed'+seed,(await app.materialize(p))[0]);report.native.push({seed,squares:f.biome.filter(v=>v==='square').length,unassignedSquares:p.source.planning.unassigned.flatMap(v=>v.cells).filter(i=>f.biome[i]==='square').length});}
 const large=generateSettlement({width:300,height:300,cityPercent:25,seed:42});assert.equal(large.parcels.length,0);assert.ok(large.neighborhoods.length&&large.quarters.length);report.maximum={width:300,height:300,cityPercent:25,fingerprint:large.fingerprint,districts:large.neighborhoods.length};
 console.log('PASS JS/HTTP/CLI, four reported seeds and300 city');await save();
 const {chromium}=await import(pathToFileURL(process.env.VLAND_PLAYWRIGHT_MODULE));browser=await chromium.launch({headless:true,executablePath:process.env.VLAND_CHROMIUM_EXECUTABLE});
 for(const width of [1100,360])for(const mode of ['settlements','landscape','hexlandscape']){
  const context=await browser.newContext({viewport:{width,height:1000}});
  try{
   const page=await context.newPage();page.on('pageerror',e=>report.errors.push({mode,width,message:e.message}));await page.goto(base+'/Web/HTML/'+mode+'.html');
   await page.waitForFunction(()=>document.querySelector('[data-path="width"]')&&!document.querySelector('main').inert&&document.querySelector('#session-status').textContent==='Сессия сохранена',null,{timeout:60000});
   await fields(page,{width:40,height:40});
   if(mode==='settlements'){
    await fields(page,{cityPercent:25});await page.locator('#generate').click();await ready(page);
    const project=await download(page);assert.equal(project.source.request.cityPercent,25);assert.deepEqual(project.source,(await app.generateBase(project.recipe)).source);
    await fields(page,{type:'village'});assert.ok(await page.locator('[data-path="cityPercent"]').isHidden());await fields(page,{type:'town'});assert.ok(await page.locator('[data-path="cityPercent"]').isVisible());
   }else{
    await fields(page,{'landscape.structure':'coast','landscape.baseBiome':'mountains'});await ready(page);
    await page.locator('#add-landscape-biome').click();const card=page.locator('[data-biome-card]').last();await card.locator('select').selectOption('gravel');assert.equal(await card.locator('input[type="number"]').inputValue(),'25');
    await card.locator('[data-biome-confirm]').click();await ready(page);
    const project=await download(page);assert.equal(project.recipe.generation.landscape.biomes[0].type,'gravel');assert.deepEqual(project.source,(await app.generateBase(project.recipe)).source);
    assert.ok((await page.locator('#terrain-legend').textContent()).includes('Гравий'));assert.ok(project.source.layers[0].fields.biome.includes('shallow-water'));assert.ok((await page.locator('#terrain-legend').textContent()).includes('Мелководье'));const before=await page.locator('#map').evaluate(e=>e.toDataURL());await page.locator('[data-layer-channel="surface"]').evaluate(e=>e.closest('details').open=true);await page.locator('[data-layer-channel="surface"]').selectOption('elevation');assert.notEqual(await page.locator('#map').evaluate(e=>e.toDataURL()),before);
   }
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1),false);
   await page.screenshot({path:path.join(out,'map-surface-ui-'+mode+'-'+width+'.png'),fullPage:true});report.browser.push({mode,width,workerExact:true,noOverflow:true});await save();console.log('PASS browser '+mode+' '+width);
  }finally{await context.close();}
 }
 assert.deepEqual(report.errors,[]);
 const html='<!doctype html><html lang="ru"><meta charset="utf-8"><title>Карты — исправленные поверхности</title><style>body{background:#0f1a1e;color:#deebea;font:16px system-ui;margin:20px}main{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}article{min-width:0}img{width:100%;image-rendering:pixelated}h2{font-size:17px}p{color:#afc9bd}</style><h1>Городские планы и ландшафтные биомы</h1><p>Реальная генерация: гравий25%, мелководье по глубине, контраст высот, город25/60/100% и четыре исправленных берега.</p><main>'+images.map(i=>'<article><h2>'+i.title+'</h2><img src="'+i.name+'.png"></article>').join('')+'</main></html>';
 for(const folder of [out,path.join(copy,'evidence')])await writeFile(path.join(folder,'map-surface-review.html'),html,'utf8');
 const gallery=await browser.newPage({viewport:{width:1240,height:900}});await gallery.goto(base+'/evidence/map-surface-review.html');await gallery.screenshot({path:path.join(out,'map-surface-review.png'),fullPage:true});await gallery.close();
 await writeFile(path.join(copy,'evidence/map-surface-schema-input.json'),JSON.stringify({modes:['settlements','landscape','hexlandscape'],documents}),'utf8');
 const schema=JSON.parse(await run(process.env.VLAND_SCHEMA_PYTHON,['tools/verify-evolution-schemas.py','--data','evidence/map-surface-schema-input.json','--report','evidence/map-surface-schema-result.json'],'schema',300000));assert.ok(schema.ok);report.schema=schema;
 console.log('PASS schemas');
 // Stateless requests only; no main session/project endpoints or browser tabs.
 const main='http://127.0.0.1:9670',defaults=await fetch(main+'/api/defaults?mode=settlements');assert.equal(defaults.status,200);assert.equal((await defaults.json()).generation.cityPercent,60);
 const r=await app.createRecipe('settlements');Object.assign(r.generation,{width:40,height:40,cityPercent:25});assert.deepEqual(await post(main,'generate-base',{recipe:r}),await app.generateBase(r));
 report.main={stateless:true,defaults:true,generationExact:true,serverRestarted:false};report.ok=true;
}catch(e){report.error=e.message;report.stack=e.stack;process.exitCode=1;}
finally{
 if(browser)await browser.close();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
 if(parent){const absolute=await realpath(parent);assert.equal(path.dirname(absolute).toLowerCase(),(await realpath(tmpdir())).toLowerCase());assert.ok(path.basename(absolute).startsWith('Vland-Map-Surface-'));await rm(absolute,{recursive:true,force:true});await assert.rejects(stat(absolute),{code:'ENOENT'});report.copyRemoved=true;}
 await save();console.log(JSON.stringify({ok:report.ok,browser:report.browser.length,schema:report.schema?.documents,copyRemoved:report.copyRemoved,error:report.error}));
}
