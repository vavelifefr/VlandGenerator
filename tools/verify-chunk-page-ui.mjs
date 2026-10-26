// Isolated, generation-free inspection of all editor pages and navigation.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,cp,rm,realpath,writeFile,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {MODES} from '../app/contracts.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)),parent=await realpath(tmpdir()),folder=await mkdtemp(path.join(parent,'Vland-Chunk-ui-')),copy=path.join(folder,'VlandGenerator');await mkdir(copy);
const result={ok:false,started:new Date().toISOString(),headless:true,ownCopy:true,generations:0,userSessionUsed:false,rows:[],pageErrors:[]};let browser,server;
try{
 for(const name of ['app','content','engine','schemas','tools','Web','server.mjs','cli.mjs'])await cp(path.join(root,name),path.join(copy,name),{recursive:true,filter:file=>!['fixtures','examples','projects','.run'].includes(path.basename(file))});
 await assert.rejects(access(path.join(copy,'.run')));
 const modulePath=process.env.VLAND_PLAYWRIGHT_MODULE;assert.ok(modulePath,'Existing VLAND_PLAYWRIGHT_MODULE is required');const {chromium}=await import(pathToFileURL(modulePath));browser=await chromium.launch({headless:true});
 const {createVlandServer}=await import(pathToFileURL(path.join(copy,'server.mjs')));server=createVlandServer({root:copy});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 assert.equal((await fetch(base+'/Web/HTML/chunk.html')).status,200);assert.equal((await fetch(base+'/Web/HTML/caves.html',{redirect:'manual'})).status,404);
 for(const width of [1100,360]){
  const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage();page.on('pageerror',error=>result.pageErrors.push({width,message:error.message}));let identity;
  try{
   await page.goto(base+'/');await page.waitForSelector('nav a[href="/Web/HTML/chunk.html"]');
   for(const [mode,info]of Object.entries(MODES)){
    await page.locator('nav a[href="/Web/HTML/'+info.page+'"]').click();await page.waitForURL(base+'/Web/HTML/'+info.page);await page.waitForFunction(mode=>document.querySelector('main')?.dataset.mode===mode&&!document.querySelector('main').inert&&document.getElementById('session-status')?.textContent==='Сессия сохранена',mode,{timeout:30000});
    const row=await page.evaluate(({mode,width})=>{
     const sidebar=document.getElementById('sidebar'),dimensions=document.getElementById('generation-dimensions'),widthControl=document.querySelector('[data-path="width"]'),heightControl=document.querySelector('[data-path="height"]'),access=document.getElementById('access-controls'),map=document.getElementById('map'),tab=JSON.parse(sessionStorage.getItem('vland.working-tab')??'{}');
     return{mode,width,path:location.pathname,title:document.querySelector('h1')?.textContent,dimensions:!widthControl&&!heightControl||!!dimensions&&!dimensions.closest('details')&&widthControl?.closest('#generation-dimensions')===dimensions&&heightControl?.closest('#generation-dimensions')===dimensions&&getComputedStyle(dimensions).display!=='none',sidebarHelp:[...sidebar.querySelectorAll('.help-text')].filter(p=>!['generation-size-budget','landscape-biome-budget'].includes(p.id)).length,staticParagraphs:[...sidebar.querySelectorAll('p')].filter(p=>p.textContent.trim()&&!['generation-size-budget','landscape-biome-budget'].includes(p.id)).map(p=>({id:p.id,text:p.textContent})),accessBelowMap:!access||!access.closest('#sidebar')&&!!(map.compareDocumentPosition(access)&Node.DOCUMENT_POSITION_FOLLOWING),oldLinks:document.querySelectorAll('a[href$="/caves.html"]').length,addLayer:!!document.getElementById('landscape-add-layer'),sliceControls:!!sidebar.querySelector('[data-path="layers.above"],[data-path="layers.underground"]'),stackLayers:[...document.querySelectorAll('#landscape-stack>[data-layer-id]')].map(e=>e.dataset.layerId),noOverflow:document.documentElement.scrollWidth<=document.documentElement.clientWidth+1,tab:{clientId:tab.clientId,sessionId:tab.sessionId}};
    },{mode,width});
    assert.equal(row.dimensions,true,mode+' dimensions visible');assert.equal(row.sidebarHelp,0,mode+' no sidebar prose');assert.deepEqual(row.staticParagraphs,[],mode+' only functional sidebar messages');assert.equal(row.accessBelowMap,true,mode+' access below map');assert.equal(row.oldLinks,0);assert.equal(row.noOverflow,true,mode+'/'+width+' no horizontal overflow');
    if(['landscape','hexlandscape'].includes(mode)){assert.equal(row.addLayer,false);assert.equal(row.sliceControls,false);assert.deepEqual(row.stackLayers,['surface']);}
    if(mode==='caves'){assert.equal(row.path,'/Web/HTML/chunk.html');assert.equal(row.title,'Чанк');assert.equal(row.sliceControls,true,'Chunk keeps physical layer settings');}
    if(identity)assert.deepEqual(row.tab,identity,'Logical session survives header navigation');else identity=row.tab;delete row.tab;result.rows.push({...row,sessionNavigationPreserved:true});await page.screenshot({path:path.join(root,'evidence/chunk-page-ui-'+mode+'-'+width+'.png'),fullPage:true});console.log(JSON.stringify({mode,width,complete:result.rows.length,total:16}));
   }
  }finally{await context.close();}
 }
 assert.equal(result.rows.length,16);assert.deepEqual(result.pageErrors,[]);result.ok=true;
}catch(error){result.error={message:error.message,stack:error.stack};throw error;}
finally{
 if(browser)await browser.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 const resolved=await realpath(folder);assert.equal(path.dirname(resolved),parent);assert.ok(path.basename(resolved).startsWith('Vland-Chunk-ui-'));await rm(resolved,{recursive:true});result.cleanup={ownCopyRemoved:true,ownServerStopped:true};result.finished=new Date().toISOString();await writeFile(path.join(root,'evidence/chunk-page-ui.json'),JSON.stringify(result,null,2)+'\n','utf8');
}
