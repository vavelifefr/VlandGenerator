import {MODES} from '../app/contracts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,access,mkdtemp,mkdir,cp,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {createVlandServer} from '../server.mjs';

const root=new URL('../',import.meta.url);
const pageNames=[...Object.values(MODES).map(mode=>mode.page),...['settings','guide','llm','qa-auto-transports','qa-category-actions','qa-compatibility','qa-content','qa-drawing','qa-evolution','qa-layout','qa-map-actions','qa-map-links','qa-map-display','qa-navigation','qa-transports'].map(name=>name+'.html')];

test('Chunk has a canonical chunk page while caves remains only its stable mode id',async()=>{
  assert.equal(MODES.caves.name,'Чанк');assert.equal(MODES.caves.page,'chunk.html');
  const html=await readFile(new URL('Web/HTML/chunk.html',root),'utf8'),home=await readFile(new URL('Web/index.html',root),'utf8');assert.ok(html.includes('data-mode="caves"'));assert.ok(html.includes('<h1>Чанк</h1>'));assert.ok(home.includes('/Web/HTML/chunk.html'));assert.ok(!html.includes('/Web/HTML/caves.html')&&!home.includes('/Web/HTML/caves.html'));
  await assert.rejects(access(new URL('Web/HTML/caves.html',root)),error=>error.code==='ENOENT');
});

test('all browser pages and assets live under Web, leaving no root HTML or ui directory',async()=>{
  await access(new URL('Web/index.html',root));
  assert.deepEqual((await readdir(root)).filter(name=>name.endsWith('.html')),[]);
  await assert.rejects(access(new URL('ui/',root)),error=>error.code==='ENOENT');
  assert.deepEqual((await readdir(new URL('Web/HTML/',root))).filter(name=>name.endsWith('.html')).sort(),[...pageNames].sort());
  for(const file of ['shell.mjs','session.mjs','worker.mjs','workbench.mjs','style.css','tokens.css'])await access(new URL('Web/HTML/ui/'+file,root));
  for(const file of ['start.cmd','stop.cmd','server-control.ps1'])await access(new URL('Web/'+file,root));
  for(const file of ['start.cmd','stop.cmd','tools/server-control.ps1'])await assert.rejects(access(new URL(file,root)),error=>error.code==='ENOENT');
});

test('relocated CMD launchers work from an unrelated directory and start only one owned server',{skip:process.platform!=='win32'},async()=>{
  await access(new URL('Web/start.cmd',root));
  const temporary=await mkdtemp(path.join(os.tmpdir(),'Vland launcher QA ')),copy=path.join(temporary,'Project with spaces'),unrelated=path.join(temporary,'Unrelated');
  await mkdir(copy);await mkdir(unrelated);
  let port;
  // Use a free high port: Windows may assign a Fetch-blocked low port to listen(0).
  for(let attempt=0;attempt<16;attempt++){
    const probe=net.createServer(),candidate=20000+Math.floor(Math.random()*40000);
    try{await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(candidate,'127.0.0.1',resolve);});port=candidate;await new Promise(resolve=>probe.close(resolve));break;}
    catch(error){if(error.code!=='EADDRINUSE')throw error;}
  }
  assert.ok(port,'Choose a free browser-safe test port');
  const run=name=>execFileSync('powershell.exe',['-NoProfile','-Command',"& '"+path.join(copy,'Web',name+'.cmd').replaceAll("'","''")+"'"],{cwd:unrelated,env:{...process.env,PORT:String(port),HOST:'127.0.0.1'},stdio:'ignore',timeout:30000});
  try{
    for(const name of await readdir(root))if(!['.run','projects','evidence','work'].includes(name))await cp(new URL(name,root),path.join(copy,name),{recursive:true});
    run('start');
    const stateFile=path.join(copy,'.run/server.json'),first=JSON.parse((await readFile(stateFile,'utf8')).replace(/^\uFEFF/,''));
    assert.equal(first.port,port);
    assert.equal((await(await fetch('http://127.0.0.1:'+port+'/api/health')).json()).ok,true);
    assert.match(await(await fetch('http://127.0.0.1:'+port+'/')).text(),/Создавайте миры/);
    run('start');
    assert.equal(JSON.parse((await readFile(stateFile,'utf8')).replace(/^\uFEFF/,'')).pid,first.pid);
    run('stop');
    await assert.rejects(access(stateFile),error=>error.code==='ENOENT');
    await assert.rejects(fetch('http://127.0.0.1:'+port+'/api/health'));
    run('stop');
  }finally{
    try{run('stop');}finally{
      const target=path.resolve(temporary),parent=path.resolve(os.tmpdir());
      assert.ok(target.startsWith(parent+path.sep)&&path.basename(target).startsWith('Vland launcher QA '));
      await rm(target,{recursive:true,force:true});
    }
  }
});

test('home, nested pages, styles and transitive browser modules resolve through HTTP',async()=>{
  const server=createVlandServer({root:fileURLToPath(root)});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const {webHref}=await import('../Web/HTML/ui/paths.mjs');
  const base='http://127.0.0.1:'+server.address().port,seen=new Set(),pending=[new URL(webHref('Web/index.html'), 'http://127.0.0.1:'+server.address().port).href];
  const check=async url=>{
    const response=await fetch(url);
    assert.equal(response.status,200,url);
    return response.text();
  };
  try{
    const home=await check(base+'/');
    assert.equal(home,await readFile(new URL('Web/index.html',root),'utf8'));
    assert.equal((await(await fetch(base+'/api/health')).json()).ok,true);
    assert.equal((await fetch(base+'/Web/HTML/caves.html',{redirect:'manual'})).status,404,'Removed cave page has no legacy redirect');
    for(const name of ['../index.html',...pageNames]){
      const pageURL=new URL(name,base+'/Web/HTML/'),html=await check(pageURL.href);
      for(const match of html.matchAll(/(?:href|src)="([^"]+)"/g)){
        if(!match[1]||match[1].startsWith('#'))continue;
        const url=new URL(match[1].replaceAll('&amp;','&'),pageURL);
        if(url.origin!==base)continue;
        url.hash='';pending.push(url.href);
      }
    }
    while(pending.length){
      const url=pending.pop();if(seen.has(url))continue;seen.add(url);
      const text=await check(url),pathname=new URL(url).pathname;
      if(pathname.endsWith('.mjs'))for(const match of text.matchAll(/(?:from\s*|import\s*\()\s*['"](\.[^'"]+)['"]/g))pending.push(new URL(match[1],url).href);
      if(pathname.endsWith('.css'))for(const match of text.matchAll(/url\(['"]?([^)'"\s]+)['"]?\)/g))if(!match[1].startsWith('data:'))pending.push(new URL(match[1],url).href);
    }
    assert.ok(seen.size>100,'Browser module graph was actually checked');
  }finally{await new Promise(resolve=>server.close(resolve));}
});
