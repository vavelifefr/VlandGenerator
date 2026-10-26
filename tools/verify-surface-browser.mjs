// Optional developer QA; caller supplies an existing Playwright module.
// Each case has its own server root and browser context, preserving the real
// 64 MiB session cap without accumulating four unrelated large-map sessions.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readdir,cp,writeFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const modulePath=process.env.VLAND_PLAYWRIGHT_MODULE;
if(!modulePath)throw Error('Set VLAND_PLAYWRIGHT_MODULE to an existing Playwright index.mjs. No install is performed.');
const {chromium}=await import(pathToFileURL(modulePath));
const coastlines=process.argv.includes('--coastlines'),prefix=process.argv.includes('--settings')?'landscape-settings':coastlines?'coastline':'landscape-surface',tempPrefix=coastlines?'Vland-Coast-browser-':'Vland-Surface-browser-';
const root=fileURLToPath(new URL('../',import.meta.url)),parent=await mkdtemp(path.join(tmpdir(),tempPrefix));
const result={ok:false,complete:false,results:[],errors:[],pageErrors:[],headless:true,ownCopy:true,caseIsolation:true,userSessionUntouched:true};
let browser;
const save=()=>writeFile(path.join(root,'evidence/'+prefix+'-browser.json'),JSON.stringify(result,null,2)+'\n');
try{
 browser=await chromium.launch({headless:true});
 for(const width of [1100,360])for(const mode of ['landscape','hexlandscape']){
  const copy=path.join(parent,mode+'-'+width);await mkdir(copy);
  for(const name of await readdir(root))if(!['.run','evidence','projects','.git','examples'].includes(name))await cp(path.join(root,name),path.join(copy,name),{recursive:true});
  await cp(path.join(copy,'tools',coastlines?'qa-coastlines.mjs':'qa-landscape-surface.mjs'),path.join(copy,'qa-surface-run.mjs'));
  await writeFile(path.join(copy,'qa-surface.html'),'<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#101a1e;color:#cef}iframe{border:0}pre{white-space:pre-wrap}</style><iframe width="1100" height="1000"></iframe><pre></pre><script type="module" src="/qa-surface-run.mjs"></script>');
  const {createVlandServer}=await import(pathToFileURL(path.join(copy,'server.mjs'))),server=createVlandServer({root:copy});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const context=await browser.newContext({viewport:{width:1160,height:1100}}),page=await context.newPage();let progress;
  try{
   page.on('pageerror',e=>result.pageErrors.push({mode,width,message:e.message}));
   await page.exposeFunction('qaCapture',async label=>{const frame=page.frames().find(f=>f.url().includes('/Web/HTML/'));if(frame)await frame.locator(label.endsWith('-map')?'#map':'#add-landscape-biome').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(root,'evidence/'+prefix+'-ui-'+label+'.png'),fullPage:true});});
   const base='http://127.0.0.1:'+server.address().port;await page.goto(base+'/qa-surface.html?mode='+mode+'&width='+width);
   assert.equal((await page.request.get(base+'/qa-surface-run.mjs')).status(),200);
   progress=setInterval(async()=>{try{const value=JSON.parse(await page.locator('pre').textContent()||'{}');console.log(JSON.stringify({mode,width,step:value.step}));}catch{}},30000);progress.unref();
   await page.waitForFunction(()=>document.querySelector('pre')?.dataset.ready==='true',null,{timeout:240000});
   const current=JSON.parse(await page.locator('pre').textContent());assert.ok(current.ok,JSON.stringify(current.errors));assert.equal(current.results.length,1);result.results.push(...current.results);await save();
  }catch(error){await page.screenshot({path:path.join(root,'evidence/'+prefix+'-browser-failure.png'),fullPage:true}).catch(()=>{});result.errors.push({mode,width,message:error.message});throw error;}
  finally{clearInterval(progress);await context.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
 }
 assert.equal(result.results.length,4);assert.deepEqual(result.pageErrors,[]);result.ok=true;result.complete=true;
 console.log(JSON.stringify({ok:true,cases:4,generations:result.results.reduce((n,r)=>n+r.generations.length,0),headless:true,caseIsolation:true}));
}catch(error){result.error=error.message;throw error;}
finally{
 await save();if(browser)await browser.close();const target=await realpath(parent),temporary=await realpath(tmpdir());assert.equal(path.dirname(target),temporary);assert.ok(path.basename(target).startsWith(tempPrefix));await rm(target,{recursive:true,force:true});
}
