import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,mkdir} from 'node:fs/promises';
import {createConnection} from 'node:net';
import {randomBytes,createHash} from 'node:crypto';
import {once} from 'node:events';
import os from 'node:os';
import path from 'node:path';
import {createSessionStore} from '../tools/session-store.mjs';
import {createVlandServer} from '../server.mjs';

test('presence ownership survives delayed disconnects and preserves another live tab',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'vland-presence-'));try{
  const store=createSessionStore(root),a={clientId:'presence-tab-a',pageId:'presence-page-a',sessionId:null,resume:false,mode:'dungeon'},r=await store.open(a),identity={clientId:r.clientId,pageId:a.pageId,sessionId:r.id};
  const releaseOld=await store.presence(identity),next={...a,pageId:'presence-next-a',sessionId:r.id,resume:true};await store.open(next);const releaseNew=await store.presence({...identity,pageId:next.pageId});await releaseOld();
  const b={...a,clientId:'presence-tab-b',pageId:'presence-page-b',sessionId:r.id},other=await store.open(b);assert.equal(other.id,r.id);const releaseB=await store.presence({clientId:b.clientId,pageId:b.pageId,sessionId:r.id});await releaseNew();
  const c=await store.open({...a,clientId:'presence-tab-c',pageId:'presence-page-c',sessionId:r.id});assert.equal(c.id,r.id);await store.release({sessionId:c.id,clientId:c.clientId,pageId:'presence-page-c'});await releaseB();
  const fresh=await store.open({...a,clientId:'presence-fresh',pageId:'presence-new-page'});assert.notEqual(fresh.id,r.id);
 }finally{assert.ok(root.startsWith(path.join(os.tmpdir(),'vland-presence-')));await rm(root,{recursive:true,force:true});}
});

async function handshake(port,identity,{origin='http://127.0.0.1:'+port,endpoint='/api/session/presence'}={}){
 const socket=createConnection({port,host:'127.0.0.1'}),key=randomBytes(16).toString('base64');socket.setTimeout(3000,()=>socket.destroy(new Error('WebSocket test timeout')));await once(socket,'connect');
 const response=new Promise((resolve,reject)=>{let data=Buffer.alloc(0);const onData=chunk=>{data=Buffer.concat([data,chunk]);if(data.includes('\r\n\r\n')){socket.off('data',onData);resolve(data.toString('utf8'));}};socket.on('data',onData);socket.once('error',reject);});
 socket.write('GET '+endpoint+'?'+new URLSearchParams(identity)+' HTTP/1.1\r\nHost: 127.0.0.1:'+port+'\r\nOrigin: '+origin+'\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: '+key+'\r\n\r\n');
 const headers=await response;return{socket,headers,accept:createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')};
}
const masked=(opcode,payload=Buffer.alloc(0))=>{const key=randomBytes(4),body=Buffer.from(payload);for(let i=0;i<body.length;i++)body[i]^=key[i%4];return Buffer.concat([Buffer.from([0x80|opcode,0x80|body.length]),key,body]);};

test('HTTP presence detects abrupt closure without a beacon, handles control frames and rejects foreign origins',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'vland-presence-')),server=createVlandServer({root});await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port,base='http://127.0.0.1:'+port,sockets=[];
 const post=(op,value)=>fetch(base+'/api/session/'+op,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
 try{
  await mkdir(path.join(root,'Web'));await writeFile(path.join(root,'Web/index.html'),'<!doctype html><title>Presence test</title>');
  const page={clientId:'socket-tab-one',pageId:'socket-page-one',sessionId:null,resume:false,mode:'dungeon'},opened=await(await post('open',page)).json(),identity={clientId:opened.clientId,pageId:page.pageId,sessionId:opened.id};
  await post('save',{...identity,mode:'dungeon',sequence:1,workspace:{recipe:{mode:'dungeon',title:'persisted'},project:null,ui:{},fileId:null,fileRevision:null,dirty:false,pending:true}});
  const valid=await handshake(port,identity);sockets.push(valid.socket);assert.match(valid.headers,/101 Switching Protocols/);assert.ok(valid.headers.includes(valid.accept));
  const pong=once(valid.socket,'data');valid.socket.write(masked(9,Buffer.from('alive')));assert.deepEqual((await pong)[0],Buffer.from([0x8a,5,...Buffer.from('alive')]));
  const denied=await handshake(port,identity,{origin:'http://other.invalid'});sockets.push(denied.socket);assert.match(denied.headers,/403 Forbidden/);
  const stale=await handshake(port,{...identity,pageId:'socket-wrong-page'});sockets.push(stale.socket);assert.match(stale.headers,/409 Conflict/);
  const csp=(await fetch(base+'/')).headers.get('content-security-policy');assert.ok(csp.includes('ws://127.0.0.1:'+port));
  valid.socket.destroy();await new Promise(resolve=>setTimeout(resolve,25));
  const fresh=await(await post('open',{...page,clientId:'socket-fresh-tab',pageId:'socket-fresh-page'})).json();assert.notEqual(fresh.id,opened.id);assert.equal(fresh.workspace,null);
  const disk=JSON.parse(await readFile(path.join(root,'.run/working-session.json')));assert.equal(Object.keys(disk.tabs).length,1);assert.deepEqual(disk.tabs[fresh.clientId].workspaces,{});
  const closed=await handshake(port,{sessionId:fresh.id,clientId:fresh.clientId,pageId:'socket-fresh-page'});sockets.push(closed.socket);const closeFrame=once(closed.socket,'data');closed.socket.write(masked(8,Buffer.from([3,232])));assert.deepEqual((await closeFrame)[0],Buffer.from([0x88,2,3,232]));
 }finally{for(const socket of sockets)socket.destroy();await new Promise(r=>server.close(r));assert.ok(root.startsWith(path.join(os.tmpdir(),'vland-presence-')));await rm(root,{recursive:true,force:true});}
});
