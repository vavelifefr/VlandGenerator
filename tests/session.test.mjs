import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm,writeFile,mkdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createSessionStore} from '../tools/session-store.mjs';
import {createVlandServer} from '../server.mjs';
import {createRecipe,generateBase} from '../app/index.mjs';
const workspace=(mode,project=null)=>({recipe:{mode,title:mode},project,ui:{stage:'map'},fileId:null,fileRevision:null,dirty:!!project,pending:false});
const opened=(id,mode='dungeon',sessionId=null,resume=false)=>({clientId:id,pageId:id+'-page',sessionId,resume,mode});
const own=(r,p)=>({clientId:r.clientId,pageId:p.pageId,sessionId:r.id});

test('one bounded session preserves independent modes and tabs, rejects stale saves and starts fresh after all tabs close',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'vland-session-'));try{
  const store=createSessionStore(root),a=opened('first-tab'),r=await store.open(a),ia=own(r,a);
  await store.save({...ia,mode:'dungeon',sequence:1,workspace:workspace('dungeon')});
  await store.save({...ia,mode:'caves',sequence:1,workspace:workspace('caves')});
  const b=opened('second-tab','landscape',r.id),s=await store.open(b),ib=own(s,b);
  assert.equal(s.id,r.id);await store.save({...ib,mode:'landscape',sequence:1,workspace:workspace('landscape')});
  const stale=await store.save({...ib,mode:'landscape',sequence:1,workspace:{...workspace('landscape'),pending:true}});assert.ok(stale.stale);
  // The next page can acquire the same logical tab before the old pagehide arrives.
  const next={...a,pageId:'next-page',sessionId:r.id,resume:true};const again=await store.open(next);assert.equal(again.workspace.recipe.mode,'dungeon');
  await store.release(ia);await store.heartbeat(own(again,next));
  for(let n=1;n<=60;n++)await store.save({...own(again,next),mode:'dungeon',sequence:n,workspace:{...workspace('dungeon'),recipe:{mode:'dungeon',title:'draft '+n}}});
  assert.deepEqual((await readdir(path.join(root,'.run'))).sort(),['working-session.json']);
  const data=JSON.parse(await readFile(store.file));assert.equal(Object.keys(data.tabs).length,2);assert.deepEqual(Object.keys(data.tabs[r.clientId].workspaces).sort(),['caves','dungeon']);assert.equal(data.tabs[r.clientId].workspaces.dungeon.recipe.title,'draft 60');
  await store.release(own(again,next));await store.release(ib);
  const fresh=await store.open(opened('third-tab','caves'));assert.notEqual(fresh.id,r.id);assert.equal(fresh.workspace,null);assert.equal(Object.keys(JSON.parse(await readFile(store.file)).tabs).length,1);
 }finally{assert.ok(root.startsWith(path.join(os.tmpdir(),'vland-session-')));await rm(root,{recursive:true,force:true});}
});
test('session limits, old page ownership, duplicated tabs, server restart and expired leases do not overwrite live work',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'vland-session-'));let time=1000;try{
  const store=createSessionStore(root,{now:()=>time,limits:{tabs:2,bytes:4096,workspaceBytes:2048,leaseMs:100}}),a=opened('original-tab'),r=await store.open(a),ia=own(r,a);
  await store.save({...ia,mode:'dungeon',sequence:1,workspace:workspace('dungeon')});
  const duplicate=await store.open({...a,pageId:'duplicate-page',sessionId:r.id});assert.notEqual(duplicate.clientId,r.clientId);
  await assert.rejects(()=>store.open(opened('over-limit')),e=>e.code==='SESSION_FULL');
  await assert.rejects(()=>store.save({...ia,mode:'dungeon',sequence:2,workspace:{...workspace('dungeon'),ui:{note:'x'.repeat(2500)}}}),e=>e.code==='SESSION_FULL');
  await assert.rejects(()=>store.save({...ia,mode:'__proto__',sequence:2,workspace:workspace('dungeon')}));
  await assert.rejects(()=>store.save({...ia,mode:'dungeon',sequence:2,workspace:{...workspace('dungeon'),project:undefined,projectChecksum:'wrong'}}));
  time+=101;const fresh=await store.open(opened('after-expiry'));assert.notEqual(fresh.id,r.id);
  await assert.rejects(()=>store.heartbeat(ia),e=>e.code==='SESSION_EXPIRED');
  const restart=createSessionStore(root),r2=await restart.open({...opened('after-restart'),sessionId:fresh.id,resume:true});assert.notEqual(r2.id,fresh.id);assert.equal(r2.workspace,null);
 }finally{assert.ok(root.startsWith(path.join(os.tmpdir(),'vland-session-')));await rm(root,{recursive:true,force:true});}
});
test('session HTTP stores actual edited project separately from explicit projects and refuses cross-origin writes',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'vland-session-')),server=createVlandServer({root});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port,post=(op,value,headers={})=>fetch(base+'/api/session/'+op,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(value)});
 try{
  const a=opened('http-client'),r=await(await post('open',a)).json(),identity=own(r,a),recipe=await createRecipe('dungeon');recipe.generation.rooms.count=3;
  const project=await generateBase(recipe),w={...workspace('dungeon',project),recipe};assert.equal((await post('save',{...identity,mode:'dungeon',sequence:1,workspace:w})).status,200);
  const metadata={...w,projectChecksum:project.checksum,pending:true};delete metadata.project;
  assert.equal((await post('save',{...identity,mode:'dungeon',sequence:2,workspace:metadata})).status,200);
  const reopened=await(await post('open',{...a,sessionId:r.id,resume:true})).json();assert.deepEqual(reopened.workspace.project,project);assert.ok(reopened.workspace.pending);
  assert.equal((await post('save',{...identity,mode:'dungeon',sequence:3,workspace:w},{Origin:'http://evil.invalid'})).status,403);
  assert.equal((await fetch(base+'/.run/working-session.json')).status,403);assert.deepEqual((await readdir(root)).sort(),['.run']);
 }finally{await new Promise(resolve=>server.close(resolve));assert.ok(root.startsWith(path.join(os.tmpdir(),'vland-session-')));await rm(root,{recursive:true,force:true});}
});
