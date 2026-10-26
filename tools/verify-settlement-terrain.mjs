// Fresh unrelated copy, own headless browser and server. No user tabs/live data.
import assert from 'node:assert/strict';
import {cp,mkdir,mkdtemp,readFile,readdir,realpath,rm,stat,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),evidence=path.join(root,'evidence'),prefix='Vland-Settlement-Terrain-',report={ok:false,phases:[],browser:[],pageErrors:[],ownCopy:true,headless:true},documents=[];
const focused=process.argv.includes('--focused'),resume=process.argv.includes('--resume');
const largeCity=process.argv.includes('--large-city'),maxSize=process.argv.includes('--max-size'),settings=type=>maxSize?{seed:3915985362,width:300,height:300}:type==='town'&&largeCity?{seed:3915985362,width:160,height:160}:{seed:42,width:80,height:64};
let parent,copy,server,browser,previousNative;
const save=()=>writeFile(path.join(evidence,'settlement-terrain-verification.json'),JSON.stringify(report,null,2)+'\n','utf8');
async function run(command,args,{cwd=copy,name='command',timeout=300000,log=true,expectedExit=0}={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(command,args,{cwd,windowsHide:true,stdio:['ignore','pipe','pipe']}),chunks=[];
  const timer=setTimeout(()=>child.kill(),timeout);child.stdout.on('data',c=>chunks.push(c));child.stderr.on('data',c=>chunks.push(c));child.once('error',reject);
  child.once('close',async code=>{clearTimeout(timer);const output=Buffer.concat(chunks).toString('utf8');if(log)await writeFile(path.join(evidence,'settlement-terrain-'+name+'.log'),output,'utf8');code===expectedExit?resolve(output):reject(Error(name+' failed: '+output.slice(-4500)));});
 });
}
const node=(args,options)=>run(process.execPath,args,options);
async function phase(name,fn){console.log('START '+name);const details=await fn();report.phases.push({name,ok:true,...details});await save();console.log('PASS '+name);}
const json=(file,value)=>writeFile(path.join(copy,file),JSON.stringify(value),'utf8');
async function files(folder){const out=[];for(const e of await readdir(folder,{withFileTypes:true})){if(['.run','.git','projects','evidence','work','examples','fixtures','tests'].includes(e.name))continue;const p=path.join(folder,e.name);if(e.isDirectory())out.push(...await files(p));else if(/\.(mjs|js)$/.test(e.name))out.push(p);}return out;}
try{
 await mkdir(evidence,{recursive:true});
 if(resume){const previous=JSON.parse(await readFile(path.join(evidence,'settlement-terrain-verification.json'),'utf8'));assert.ok(previous.phases.some(p=>p.name==='town-village-js-http-cli-raster'&&p.ok));previousNative=previous.native;for(const type of ['town','village']){const sample=settings(type),prior=previousNative.find(n=>n.type===type);assert.equal(prior.width,sample.width);assert.equal(prior.height,sample.height);assert.equal(prior.seed,sample.seed);}report.phases=previous.phases;report.fullSuite=previous.fullSuite;report.resumedAfter={reason:'Large-schema QA exceeded300 seconds; completed checks preserved, native fingerprints rechecked.',previousCopyRemoved:previous.copyRemoved};}
 parent=await mkdtemp(path.join(tmpdir(),prefix));copy=path.join(parent,'VlandGenerator');await mkdir(copy);
 for(const e of await readdir(root,{withFileTypes:true}))if(!['.run','.git','projects','evidence','work'].includes(e.name))await cp(path.join(root,e.name),path.join(copy,e.name),{recursive:true});
 await mkdir(path.join(copy,'evidence'));report.tempParent=parent;await save();
 if(focused&&!resume)await phase('unrelated-failures-isolated-baseline',async()=>{
  const full=await readFile(path.join(evidence,'settlement-terrain-tests.log'),'utf8'),failures=text=>[...new Set(text.split(/\r?\n/).filter(l=>l.startsWith('✖ ')&&!l.includes('failing tests:')).map(l=>l.slice(2).replace(/\s+\([\d.]+ms\)$/,'')))].sort(),known=failures(full);
  assert.equal(known.length,6,'Observed full-suite failures');report.fullSuite={tests:444,pass:438,fail:6,failures:known,log:'evidence/settlement-terrain-tests.log'};
  const paths=['engine/api/atlas-catalog.mjs','app/display-colors.mjs','app/contracts.mjs','Web/HTML/ui/controls.mjs'],before=await Promise.all(paths.map(p=>readFile(path.join(copy,p))));
  try{
   const transforms=[s=>s.replace("  square:biome('Площадь','#c1b49b','gravel'),park:biome('Парк','#54865c','grass'),",''),s=>s.replace(",'square','park'",''),s=>s.replace('Улицы, мосты, районы и открытые пространства','Улицы, кварталы, участки и контуры застройки'),s=>s.replace("n('streetWidth','Ширина основных улиц и дорог',1,4),","n('streetWidth','Ширина улиц',1,4),n('buildingDensity','Плотность геометрии застройки',0,1,.05),")];
   for(let k=0;k<paths.length;k++)await writeFile(path.join(copy,paths[k]),transforms[k](before[k].toString('utf8')),'utf8');
   const pattern=known.map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),output=await node(['--test','--test-name-pattern='+pattern,'tests/landscape-biome-cards.test.mjs','tests/landscape-irregular.test.mjs','tests/landscape-rivers.test.mjs'],{name:'unrelated-baseline',expectedExit:1});assert.deepEqual(failures(output),known);report.fullSuite.preExistingFailuresReproduced=true;
  }finally{for(let k=0;k<paths.length;k++)await writeFile(path.join(copy,paths[k]),before[k]);}
  return{sameFailures:known.length,sharedCatalogControlsRevertedOnlyInOwnCopy:true};
 });
 if(!resume)await phase(focused?'node-focused-suite':'node-full-suite',async()=>{
  const args=focused?['--test','tests/settlement-terrain.test.mjs','tests/settlement-districts.test.mjs','tests/settlement-streets.test.mjs','tests/settlement-planner.test.mjs','tests/settlement-labels.test.mjs','tests/evolution.test.mjs']:['--test'];
  const output=await node(args,{name:focused?'focused':'tests',timeout:600000}),count=name=>Number(output.match(new RegExp('(?:#|ℹ) '+name+' (\\d+)'))?.[1]);
  const tests=count('tests'),pass=count('pass'),fail=count('fail');assert.ok(tests>0);assert.equal(pass,tests);assert.equal(fail,0);return{tests,pass,fail};
 });
 if(!resume)await phase('production-js-imports',async()=>{
  const modules=await files(copy);let imports=0;
  for(let k=0;k<modules.length;k+=6)await Promise.all(modules.slice(k,k+6).map(async file=>{
   await node(['--check',file],{name:'syntax',timeout:30000,log:false});
   const text=await readFile(file,'utf8');for(const m of text.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)['"](\.[^'"]+)['"]/g)){assert.ok((await stat(path.resolve(path.dirname(file),m[1]))).isFile());imports++;}
  }));return{modules:modules.length,imports};
 });
 const {serializeScene}=await import(pathToFileURL(path.join(copy,'content/index.mjs'))),app=await import(pathToFileURL(path.join(copy,'app/index.mjs'))),{validateSettlement}=await import(pathToFileURL(path.join(copy,'engine/api/settlements.mjs'))),{rasterizeLayer,encodePNG}=await import(pathToFileURL(path.join(copy,'app/raster.mjs'))),{terrainLegendEntries}=await import(pathToFileURL(path.join(copy,'app/display-colors.mjs'))),{createVlandServer}=await import(pathToFileURL(path.join(copy,'server.mjs')));
 server=createVlandServer({root:copy});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const post=async(operation,value)=>{const r=await fetch(base+'/api/'+operation,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});assert.equal(r.status,200,await r.clone().text());return r.json();};
 const projects={},previews=[];report.native=[];
 await phase(resume?'schema-documents-regenerated':'town-village-js-http-cli-raster',async()=>{
  for(const type of ['town','village']){
   const started=Date.now(),recipe=await app.createRecipe('settlements'),sample=settings(type);Object.assign(recipe.generation,{type,width:sample.width,height:sample.height});recipe.seed=sample.seed;
   const project=await app.generateBase(recipe),runtime=await app.exportRuntime(project),layer=(await app.materialize(project))[0],native=project.source,f=native.atlas.layers[0].fields;projects[type]=project;
   assert.ok(validateSettlement(native).ok);assert.deepEqual(native.parcels,[]);assert.ok(f.road.includes('bridge'));assert.ok(f.waterType.includes('river'));assert.ok(native.neighborhoods.length&&native.quarters.length);assert.ok(runtime.validation.ok);
   if(!resume){
   assert.deepEqual(await post('generate-base',{recipe}),project);assert.deepEqual(await post('runtime',{project}),runtime);
   await json(type+'-recipe.json',recipe);await json(type+'-project.json',project);await node(['cli.mjs','generate-base',type+'-recipe.json',type+'-cli.json'],{name:type+'-cli-generate'});assert.deepEqual(JSON.parse(await readFile(path.join(copy,type+'-cli.json'),'utf8')),project);
   const validation=JSON.parse(await node(['cli.mjs','validate',type+'-project.json'],{name:type+'-cli-validate'}));assert.ok(validation.ok);
   await node(['cli.mjs','runtime',type+'-project.json',type+'-runtime.json'],{name:type+'-cli-runtime'});assert.deepEqual(JSON.parse(await readFile(path.join(copy,type+'-runtime.json'),'utf8')),runtime);
   }else assert.equal(native.fingerprint,previousNative.find(n=>n.type===type).fingerprint,'Regenerated documents match completed JS/HTTP/CLI cases');
   for(const [suffix,schema,value] of [['recipe','schemas/recipe.schema.json',recipe],['native','engine/schemas/settlement.schema.json',native],['project','schemas/project.schema.json',project],['runtime','schemas/runtime.schema.json',runtime],...(!maxSize?[['scene','schemas/content-scene.schema.json',JSON.parse(serializeScene(runtime.scene))]]:[])])documents.push({label:type+' '+suffix,schema,value});
   const strips=native.neighborhoods.filter(n=>Math.max(n.bounds.width,n.bounds.height)/Math.min(n.bounds.width,n.bounds.height)>=5&&Math.min(n.bounds.width,n.bounds.height)<=4),districtArea=native.neighborhoods.reduce((sum,n)=>sum+n.area,0),stripArea=strips.reduce((sum,n)=>sum+n.area,0);
   if(type==='town'&&(largeCity||maxSize))assert.ok(stripArea/districtArea<.05,'Reported city no longer consists of narrow strips');
   report.native.push({type,...sample,neighborhoods:native.neighborhoods.length,quarters:native.quarters.length,strips:strips.length,stripAreaFraction:stripArea/districtArea,bridgeCells:f.road.filter(v=>v==='bridge').length,parks:f.biome.filter(v=>v==='park').length,squares:f.biome.filter(v=>v==='square').length,parcels:native.parcels.length,fingerprint:native.fingerprint,projectBytes:Buffer.byteLength(JSON.stringify(project)),runtimeBytes:Buffer.byteLength(JSON.stringify(runtime)),elapsedMs:Date.now()-started});
   const image=encodePNG(rasterizeLayer(layer,{scale:sample.width===300?2:sample.width===160?4:7,transparent:false})),name='settlement-terrain-'+type+'.png';await writeFile(path.join(evidence,name),image);await writeFile(path.join(copy,'evidence',name),image);
   const legend=terrainLegendEntries(layer).map(e=>`<span style="display:inline-block;margin:5px 14px 5px 0"><b style="display:inline-block;background:${e.color};width:12px;height:12px;margin-right:5px"></b>${e.name}</span>`).join('');
   previews.push(`<article><h2>${type==='town'?'Город':'Деревня'} · ${sample.width}×${sample.height} · seed${sample.seed}</h2><img src="${name}" alt="${type}"><p>${native.neighborhoods.length} микрорайонов · ${native.quarters.length} кварталов · без домов</p><div>${legend}</div></article>`);
  }
  const html='<!doctype html><html lang="ru"><meta charset="utf-8"><title>Город и деревня без домов</title><style>body{background:#0f1a1e;color:#deebea;font:16px system-ui;margin:24px}h1{font-size:28px}main{display:grid;grid-template-columns:1fr 1fr;gap:24px}article{min-width:0}h2{font-size:20px}img{width:100%;image-rendering:pixelated}p{color:#b9c9c3}@media(max-width:700px){main{grid-template-columns:1fr}}</style><h1>Город и деревня — открытые планы без домов</h1><p>Фактические материалы новой генерации. Районы сохранены; контуры и подписи включаются в редакторе.</p><main>'+previews.join('')+'</main></html>';
  for(const folder of [evidence,path.join(copy,'evidence')])await writeFile(path.join(folder,'settlement-terrain-comparison.html'),html,'utf8');
  return{cases:2,generateExact:true,runtimeExact:true,validationJsHttpCli:true};
 });
 await phase('browser-desktop-mobile',async()=>{
  const {chromium}=await import(pathToFileURL(process.env.VLAND_PLAYWRIGHT_MODULE));browser=await chromium.launch({headless:true,executablePath:process.env.VLAND_CHROMIUM_EXECUTABLE});
  for(const width of [1100,360])for(const type of ['town','village']){
   const context=await browser.newContext({viewport:{width,height:1000}});
   try{
    const page=await context.newPage();page.on('pageerror',e=>report.pageErrors.push({width,type,message:e.message}));
    await page.goto(base+'/Web/HTML/settlements.html');await page.waitForFunction(()=>document.querySelector('[data-path="type"]')&&!document.querySelector('main').inert&&document.querySelector('#session-status').textContent==='Сессия сохранена',null,{timeout:60000});
    assert.equal(await page.locator('[data-path="buildingDensity"]').count(),0);
    for(const field of ['width','height'])assert.equal(await page.locator('[data-path="'+field+'"]').getAttribute('max'),'300');
    const sample=settings(type);await page.evaluate(({type,sample})=>{for(const [key,value]of Object.entries({type,width:sample.width,height:sample.height})){const el=document.querySelector('[data-path="'+key+'"]');el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));}document.querySelector('#seed').value=sample.seed;},{type,sample});
    await page.locator('#generate').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Карта готова.')&&!document.querySelector('#sidebar').inert&&document.querySelector('#session-status').textContent==='Сессия сохранена',null,{timeout:120000});
    // Export through the actual UI, intercepting only its own JSON download.
    const download=label=>page.evaluate(async label=>{
     let value;const click=HTMLAnchorElement.prototype.click,create=URL.createObjectURL,blobs=new Map();URL.createObjectURL=function(b){const u=create.call(this,b);blobs.set(u,b);return u;};HTMLAnchorElement.prototype.click=function(){if(this.download?.endsWith('.json')){blobs.get(this.href)?.text().then(t=>value=JSON.parse(t));return;}return click.call(this);};
     try{document.querySelector('#export').click();[...document.querySelectorAll('#dialog-actions button')].find(b=>b.textContent===label).click();for(let k=0;k<1600&&!value;k++)await new Promise(r=>setTimeout(r,25));if(!value)throw Error('Export timeout');document.querySelector('#dialog-close').click();return value;}finally{HTMLAnchorElement.prototype.click=click;URL.createObjectURL=create;}
    },label);
    const project=await download('Проект JSON');assert.deepEqual(project.source,projects[type].source,'UI worker uses the same generation');assert.ok(validateSettlement(project.source).ok);
    const ui=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,legend:document.querySelector('#terrain-legend').textContent,plan:document.querySelector('#settlement-plan summary').textContent,canvas:document.querySelector('#map').width>0}));assert.equal(ui.overflow,false);assert.ok(ui.canvas&&ui.plan.includes('кварталы '));if(type==='town')assert.ok(ui.legend.includes('Парк')&&ui.legend.includes('Площадь'));else assert.ok(!ui.legend.includes('Парк')&&!ui.legend.includes('Площадь'));
    const canvas=page.locator('#map'),before=await canvas.evaluate(e=>e.toDataURL());await page.locator('[data-view-option="showDistricts"]').evaluate(e=>e.click());assert.notEqual(await canvas.evaluate(e=>e.toDataURL()),before);assert.deepEqual((await download('Проект JSON')).source,project.source);
    assert.deepEqual((await download('Для приложения')).navigation[0].neighborhoods,project.source.neighborhoods);
    await page.screenshot({path:path.join(evidence,'settlement-terrain-ui-'+type+'-'+width+'.png'),fullPage:true});
    await page.waitForFunction(()=>document.querySelector('#session-status').textContent==='Сессия сохранена');await page.reload();await page.waitForFunction(()=>!document.querySelector('#export').disabled&&!document.querySelector('main').inert,null,{timeout:60000});assert.deepEqual((await download('Проект JSON')).source,project.source);
    report.browser.push({width,type,mapWidth:sample.width,mapHeight:sample.height,seed:sample.seed,worker:true,legend:true,districts:true,overlay:true,runtime:true,sessionExact:true,noOverflow:true,parcels:0});await save();console.log('BROWSER '+type+' '+width);
   }finally{await context.close();}
  }
  assert.deepEqual(report.pageErrors,[]);const context=await browser.newContext({viewport:{width:1240,height:820}});try{const page=await context.newPage();await page.goto(base+'/evidence/settlement-terrain-comparison.html');await page.screenshot({path:path.join(evidence,'settlement-terrain-comparison.png'),fullPage:true});}finally{await context.close();}
  return{cases:report.browser.length,pageErrors:report.pageErrors.length};
 });
 await phase('json-schema',async()=>{
  assert.ok(process.env.VLAND_SCHEMA_PYTHON,'Use the existing optional schema QA environment');await json('evidence/settlement-schema-input.json',{modes:['settlements'],documents});
  const output=await run(process.env.VLAND_SCHEMA_PYTHON,['tools/verify-evolution-schemas.py','--data','evidence/settlement-schema-input.json','--report','evidence/settlement-schema-result.json'],{name:'schemas',timeout:900000}),result=JSON.parse(output);assert.ok(result.ok);await writeFile(path.join(evidence,'settlement-terrain-schemas.json'),await readFile(path.join(copy,'evidence/settlement-schema-result.json')));return{schemas:result.schemas,documents:result.documents,negativeControls:result.negativeControls};
 });
 report.ok=true;
}catch(error){report.error=error.message;report.stack=error.stack;process.exitCode=1;}
finally{
 if(browser)await browser.close();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
 if(parent){const absolute=await realpath(parent);assert.equal(path.dirname(absolute).toLowerCase(),(await realpath(tmpdir())).toLowerCase());assert.ok(path.basename(absolute).startsWith(prefix));await rm(absolute,{recursive:true,force:true});await assert.rejects(stat(absolute),{code:'ENOENT'});report.copyRemoved=true;}
 report.finishedAt=new Date().toISOString();await save();console.log(JSON.stringify({ok:report.ok,phases:report.phases,browser:report.browser.length,copyRemoved:report.copyRemoved,error:report.error}));
}
