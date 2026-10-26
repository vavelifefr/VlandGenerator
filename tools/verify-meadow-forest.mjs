// Synthetic actual-map and isolated-workspace QA only. Does not read live
// projects, examples, source fixtures, sessions or the user's browser.
import assert from 'node:assert/strict';
import {writeFile,mkdtemp,cp,mkdir,rm,realpath} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createRecipe,generateBase,validateProject,materialize} from '../app/index.mjs';
import {normalizeAtlasRequest} from '../engine/api/atlas-catalog.mjs';
import {surfaceFields,atlasSeed} from '../engine/core/atlas-landforms.mjs';
import {applyLandscapeRegions} from '../engine/core/landscape-regions.mjs';
import {gridNeighbors} from '../engine/core/topology.mjs';
import {rasterizeLayer,encodePNG} from '../app/raster.mjs';
import {hash} from '../content/common.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),file=name=>path.join(root,'evidence','meadow-forest-'+name),report={ok:false,actualMaps:[],images:[],browser:[],pageErrors:[]};
const groups=(mask,r)=>{const seen=new Uint8Array(mask.length),sizes=[];for(let i=0;i<mask.length;i++)if(mask[i]&&!seen[i]){seen[i]=1;const q=[i];for(let k=0;k<q.length;k++)for(const j of gridNeighbors(q[k],r.width,r.height,r.topology))if(mask[j]&&!seen[j]){seen[j]=1;q.push(j);}sizes.push(q.length);}return sizes;};
const save=()=>writeFile(file('verification.json'),JSON.stringify(report,null,2)+'\n');
let browser;
try{
 const stackRequest=normalizeAtlasRequest({schema:'vland.atlas.request',schemaVersion:1,width:300,height:300,layers:{above:0,underground:0},landscape:{structure:'land',baseBiome:'meadow',biomes:[{id:'woods',type:'forest',percent:25}]}}),stackFields=surfaceFields(stackRequest).fields,
  stackLayer={width:300,height:300,topology:stackRequest.topology,solid:stackFields.obstacle,material:stackFields.material,water:stackFields.waterType,biome:stackFields.biome,sourceFields:stackFields};
 for(const channel of ['material','biome'])await writeFile(file('stack-land300-woods25-'+channel+'.png'),encodePNG(rasterizeLayer(stackLayer,{channel,scale:1,transparent:false})));
 report.stackFixture={fieldsSHA:createHash('sha256').update(JSON.stringify(stackFields)).digest('hex'),files:['material','biome'].map(c=>'meadow-forest-stack-land300-woods25-'+c+'.png')};await save();console.log(JSON.stringify({stackFixture:report.stackFixture}));
 for(const mode of ['landscape','hexlandscape'])for(const size of [50,128,300])for(const baseBiome of ['meadow','forest']){
  const type=baseBiome==='meadow'?'forest':'meadow',structure=size===50?'land':'coast',recipe=await createRecipe(mode);Object.assign(recipe.generation,{width:size,height:size,layers:{above:0,underground:0},landscape:{structure,baseBiome,landPercent:75,uniformity:50,biomes:[{id:'other-territory',type,percent:35}]}});
  const before=hash(recipe),p=await generateBase(recipe);assert.equal(hash(recipe),before);assert.ok((await validateProject(p)).ok);assert.ok(p.source.navigation.ok&&p.source.access.ok);
  const l=p.source.layers[0],f=l.fields,r=p.source.request,n=size*size,expected=structure==='land'?n:Math.round(n*.75),mask=Uint8Array.from(f.heightmap,v=>+(v>p.source.hydrology.seaLevel));assert.equal(mask.reduce((s,v)=>s+v,0),expected);assert.equal(f.waterType.filter(v=>v==='sea').length,n-expected);assert.equal(groups(mask,r).length,1);assert.equal(groups(Uint8Array.from(mask,v=>1-v),r).length,structure==='land'?0:1);
  // Exact allocation is defined before climatic subtypes and semantic ecotones.
  // Exercise that pure phase on this actual dry mask; visible semantic counts
  // are deliberately reported separately rather than called exact card areas.
  const copy=structuredClone(f),labels=applyLandscapeRegions(copy,r,atlasSeed(r,'surface','relief')),dry=f.waterType.flatMap((v,i)=>v==='none'?[i]:[]),allocated=dry.filter(i=>labels[i]===type).length;assert.equal(allocated,Math.round(dry.length*.35));assert.deepEqual(copy.elevation,f.elevation);assert.deepEqual(copy.waterType,f.waterType);
  const repeated=await generateBase(recipe);assert.equal(repeated.checksum,p.checksum);
  const changed=structuredClone(recipe);changed.generation.landscape.biomes[0].percent=45;const edited=(await generateBase(changed)).source.layers[0].fields;for(const key of ['heightmap','flowTo','waterType'])assert.deepEqual(edited[key],f[key],'cards preserve '+key);
  const [view]=await materialize(p),images=[];for(const channel of ['material','biome']){const name=`${mode}-${size}-${baseBiome}-${channel}.png`;await writeFile(file(name),encodePNG(rasterizeLayer(view,{channel,scale:1,transparent:false})));images.push('meadow-forest-'+name);}
  const counts={};for(const id of f.biome)counts[id]=(counts[id]??0)+1;
  report.actualMaps.push({mode,size,baseBiome,otherBiome:type,percent:35,structure,seed:recipe.seed,checksum:p.checksum,dryCells:dry.length,allocatedOtherCells:allocated,landCells:expected,oceanCells:n-expected,visibleBiomes:counts,nav:true,deterministic:true,geometryUnaffectedByCards:true,images});await save();console.log(JSON.stringify({actualMap:report.actualMaps.length,mode,size,baseBiome}));
 }
 const articles=['landscape','hexlandscape'].flatMap(mode=>[50,128,300].map(size=>`<article><h2>${mode} · ${size}×${size}</h2><div class="pair">`+['meadow','forest'].map(base=>{const row=report.actualMaps.find(r=>r.mode===mode&&r.size===size&&r.baseBiome===base);return`<section><h3>Основа: ${base==='meadow'?'луга':'лес'} · другой биом35%</h3>`+row.images.map((src,i)=>`<figure><figcaption>${i?'Биомы':'Основной вид материалов'}</figcaption><img src="${src}" loading="lazy"></figure>`).join('')+'</section>';}).join('')+'</div></article>'));
 await writeFile(file('comparison.html'),'<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Луга и леса</title><style>body{background:#101a1e;color:#def;font:14px system-ui;margin:20px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:18px}figure{margin:8px 0}img{width:100%;max-width:700px;image-rendering:pixelated}@media(max-width:650px){.pair{grid-template-columns:1fr}}</style><h1>Луга и леса: основной вид и биомы</h1><p>Свежие синтетические карты. Слева луга с35% леса, справа лес с35% лугов. Карты50×50 — суша;128/300 — побережье с75% суши.</p>'+articles.join(''));
 if(!process.argv.includes('--node-only')){
  const modulePath=process.env.VLAND_PLAYWRIGHT_MODULE;if(!modulePath)throw Error('Set VLAND_PLAYWRIGHT_MODULE to an existing Playwright index.mjs.');const {chromium}=await import(pathToFileURL(modulePath));browser=await chromium.launch({headless:true});
  for(const width of [1100,360])for(const mode of ['landscape','hexlandscape']){
   const parent=await mkdtemp(path.join(tmpdir(),'Vland-Meadow-Forest-')),copy=path.join(parent,'runtime');await mkdir(copy);let server,context;
   try{
    for(const name of ['app','content','engine','Web','server.mjs'])await cp(path.join(root,name),path.join(copy,name),{recursive:true,filter:src=>!['fixtures','examples','projects','.run'].includes(path.basename(src))});
    await mkdir(path.join(copy,'tools'));for(const name of ['session-store.mjs','session-presence.mjs','api-worker.mjs'])await cp(path.join(root,'tools',name),path.join(copy,'tools',name));
    const {createVlandServer}=await import(pathToFileURL(path.join(copy,'server.mjs')));server=createVlandServer({root:copy});await new Promise(r=>server.listen(0,'127.0.0.1',r));context=await browser.newContext({viewport:{width,height:1000}});const page=await context.newPage();page.on('pageerror',e=>report.pageErrors.push({mode,width,message:e.message}));
    await page.goto('http://127.0.0.1:'+server.address().port+'/Web/HTML/'+mode+'.html');await page.waitForFunction(()=>document.querySelector('#add-landscape-biome')&&!document.querySelector('main').inert&&document.querySelector('#session-status').textContent==='Сессия сохранена',null,{timeout:60000});
    await page.evaluate(()=>{const change=(path,value)=>{const el=document.querySelector('[data-path="'+path+'"]');el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));};change('width',300);change('height',300);change('landscape.structure','coast');change('landscape.baseBiome','meadow');document.getElementById('add-landscape-biome').click();const card=[...document.querySelectorAll('[data-biome-card]')].at(-1);for(const[selector,value]of [['[data-biome-type]','forest'],['[data-biome-percent]',35]]){const el=card.querySelector(selector);el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));}card.querySelector('[data-biome-confirm]').click();document.getElementById('generate').click();});
    await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Карта готова.')&&!document.querySelector('#sidebar').inert&&document.querySelector('#session-status').textContent==='Сессия сохранена',null,{timeout:90000});
    const current=await page.evaluate(async()=>{
     const exportProject=async()=>{let project;const original=HTMLAnchorElement.prototype.click,create=URL.createObjectURL,blobs=new Map();URL.createObjectURL=function(b){const u=create.call(this,b);blobs.set(u,b);return u;};HTMLAnchorElement.prototype.click=function(){if(this.download?.endsWith('.json')){blobs.get(this.href)?.text().then(t=>project=JSON.parse(t));return;}return original.call(this);};try{document.getElementById('export').click();[...document.querySelectorAll('#dialog-actions button')].find(b=>b.textContent==='Проект JSON').click();for(let k=0;k<1200&&!project;k++)await new Promise(r=>setTimeout(r,25));if(!project)throw Error('Project export timeout');document.getElementById('dialog-close').click();return project;}finally{HTMLAnchorElement.prototype.click=original;URL.createObjectURL=create;}};
     const p=await exportProject(),{materialize}=await import('/app/index.mjs'),{cellColor}=await import('/app/raster.mjs'),{hexPosition,hexExtent}=await import('/Web/HTML/ui/hex-render.mjs'),{gridNeighbors}=await import('/engine/core/topology.mjs'),[layer]=await materialize(p),canvas=document.getElementById('map'),bounds=canvas.parentElement.getBoundingClientRect(),hex=layer.topology.kind==='hex',extent=hex?hexExtent(layer):layer,scale=Math.max(hex?.3:.4,Math.min(16,(bounds.width-30)/extent.width,(bounds.height-30)/extent.height)),offset={x:(bounds.width-extent.width*scale)/2,y:(bounds.height-extent.height*scale)/2},ratio=canvas.width/canvas.clientWidth;
     document.getElementById('fit').click();const samples=[];
     for(const ids of [['plains','savanna','tundra'],['forest','taiga','rainforest']]){
      let found;for(let i=0;i<layer.material.length;i++){if(layer.material[i]!=='grass'||!ids.includes(layer.biome[i])||layer.solid[i]||layer.sourceFields.transitionStrength[i])continue;const rgb=cellColor(layer,i),near=gridNeighbors(i,layer.width,layer.height,layer.topology);if(!near.every(j=>cellColor(layer,j).join(',')===rgb.join(',')))continue;const pos=hex?hexPosition({x:i%layer.width,y:Math.floor(i/layer.width)}):{x:i%layer.width+.5,y:Math.floor(i/layer.width)+.5},x=Math.floor((offset.x+pos.x*scale)*ratio),y=Math.floor((offset.y+pos.y*scale)*ratio);if(x<0||y<0||x>=canvas.width||y>=canvas.height)continue;const actual=[...canvas.getContext('2d').getImageData(x,y,1,1).data.subarray(0,3)];if(actual.join(',')===rgb.join(',')){found={biome:layer.biome[i],expected:rgb,actual};break;}}if(!found)throw Error('Missing exact rendered core for '+ids.join('/'));samples.push(found);
     }
     const legend=document.getElementById('terrain-legend').textContent;if(!legend.includes('Луга')||!legend.includes('Лес'))throw Error('Missing meadow/forest legend '+legend);if(document.documentElement.scrollWidth>document.documentElement.clientWidth+1)throw Error('Horizontal overflow');
     document.querySelector('[data-biome-percent]').value='40';document.querySelector('[data-biome-percent]').dispatchEvent(new Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,1500));const after=await exportProject();if(after.checksum!==p.checksum||document.querySelector('[data-biome-confirm]').disabled)throw Error('Biome draft regenerated the map');
     return{checksum:p.checksum,samples,legend,manualDraft:true,noOverflow:true,nav:p.source.navigation.ok,access:p.source.access.ok,defaultChannel:document.getElementById('channel').value};
    });assert.equal(current.defaultChannel,'material');assert.ok(current.nav&&current.access);report.browser.push({mode,width,...current});await page.locator('#map').screenshot({path:file('ui-'+mode+'-'+width+'-map.png')});await page.locator('#terrain-legend').screenshot({path:file('ui-'+mode+'-'+width+'-legend.png')});await save();console.log(JSON.stringify({browser:report.browser.length,mode,width}));
   }finally{if(context)await context.close();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}const absolute=await realpath(parent);assert.equal(path.dirname(absolute),await realpath(tmpdir()));assert.ok(path.basename(absolute).startsWith('Vland-Meadow-Forest-'));await rm(absolute,{recursive:true,force:true});}
  }
  assert.equal(report.browser.length,4);assert.deepEqual(report.pageErrors,[]);
 }
 assert.equal(report.actualMaps.length,12);report.ok=true;await save();console.log(JSON.stringify({ok:true,actualMaps:12,browser:report.browser.length}));
}catch(error){report.error=error.message;report.stack=error.stack;await save();throw error;}
finally{if(browser)await browser.close();}
