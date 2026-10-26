import {mkdir,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {MODES} from '../app/contracts.mjs';

export const SESSION_LIMITS=Object.freeze({tabs:16,bytes:64*1024*1024,workspaceBytes:24*1024*1024,leaseMs:120000});
const fail=(message,code='INVALID_SESSION',status=400)=>{throw Object.assign(new Error(message),{code,status});};
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const checkKeys=(value,allowed)=>{if(!object(value)||Object.keys(value).some(k=>!allowed.includes(k)))fail('Недопустимые поля рабочей сессии.');};
const checkId=value=>{if(typeof value!=='string'||!/^[-a-zA-Z0-9_]{8,64}$/.test(value))fail('Недопустимый идентификатор вкладки.');return value;};
const checkMode=mode=>{if(mode!=='settings'&&!Object.hasOwn(MODES,mode))fail('Неизвестный режим рабочей сессии.');return mode;};

// One bounded, ephemeral file. It is deliberately never read after server restart.
// All mutations and atomic replacements share one queue and one fixed temporary path.
export function createSessionStore(root,{now=Date.now,limits=SESSION_LIMITS}={}){
 const directory=path.join(root,'.run'),file=path.join(directory,'working-session.json'),temporary=path.join(directory,'working-session.tmp');
 let data=null,clients=new Map(),queue=Promise.resolve();
 const serial=fn=>{const result=queue.then(fn);queue=result.catch(()=>{});return result;};
 const active=()=>[...clients.values()].some(c=>c.active&&(c.connected||now()-c.seen<limits.leaseMs));
 const persist=async next=>{
  const text=JSON.stringify(next)+'\n';if(Buffer.byteLength(text)>limits.bytes)fail('Рабочая сессия достигла лимита 64 MiB. Сохраните нужные проекты явно.','SESSION_FULL',413);
  await mkdir(directory,{recursive:true});await writeFile(temporary,text,'utf8');await rename(temporary,file);data=next;
 };
 const authenticate=input=>{
  if(!data||input.sessionId!==data.id)fail('Рабочая сессия завершена. Подключитесь к новой.','SESSION_EXPIRED',409);
  const client=clients.get(checkId(input.clientId));if(!client||client.pageId!==checkId(input.pageId))fail('Страница больше не владеет вкладкой сессии.','SESSION_EXPIRED',409);
  client.active=true;client.seen=now();return client;
 };
 const info=()=>({id:data.id,revision:data.revision,limits:{tabs:limits.tabs,bytes:limits.bytes},file:'.run/working-session.json'});
 return {
  open:input=>serial(async()=>{
   checkKeys(input,['clientId','pageId','sessionId','resume','mode']);let clientId=checkId(input.clientId);checkId(input.pageId);
   if(typeof input.resume!=='boolean')fail('Нужно явно указать продолжение вкладки.');if(input.mode!==null)checkMode(input.mode);
   const known=data&&input.sessionId===data.id&&clients.has(clientId),continuation=known&&input.resume;
   if(!data||(!active()&&!continuation)){
    clients=new Map();await persist({schema:'vland.working-session',schemaVersion:1,id:randomUUID(),revision:0,startedAt:new Date(now()).toISOString(),updatedAt:new Date(now()).toISOString(),tabs:{}});
   }
   // Duplicating a tab can copy sessionStorage; it must not overwrite its parent.
   const previous=clients.get(clientId);if(previous?.active&&previous.pageId!==input.pageId&&!input.resume)clientId=randomUUID();
   if(!Object.hasOwn(data.tabs,clientId)&&Object.keys(data.tabs).length>=limits.tabs)fail('В сессии уже 16 рабочих вкладок.','SESSION_FULL',413);
   if(!Object.hasOwn(data.tabs,clientId))await persist({...data,tabs:{...data.tabs,[clientId]:{workspaces:{}}}});
   clients.set(clientId,{pageId:input.pageId,active:true,seen:now(),sequence:new Map()});
   return {...info(),clientId,workspace:input.mode===null?null:structuredClone(data.tabs[clientId].workspaces[input.mode]??null)};
  }),
  save:input=>serial(async()=>{
   checkKeys(input,['sessionId','clientId','pageId','mode','sequence','workspace']);const client=authenticate(input),mode=checkMode(input.mode);
   if(!Number.isSafeInteger(input.sequence)||input.sequence<1)fail('Недопустимая последовательность сохранения.');
   if(input.sequence<=(client.sequence.get(mode)??0))return {...info(),stale:true};
   const w=input.workspace;checkKeys(w,['recipe','project','projectChecksum','ui','fileId','fileRevision','dirty','pending']);
   if(!object(w.recipe)||w.recipe.mode!==mode||!object(w.ui)||typeof w.dirty!=='boolean'||typeof w.pending!=='boolean')fail('Неверный снимок рабочего режима.');
   const previous=data.tabs[input.clientId].workspaces[mode],project=Object.hasOwn(w,'project')?w.project:previous?.project??null;
   if(project!==null&&(!object(project)||project.schema!=='vland.project'||project.recipe?.mode!==mode))fail('Карта не соответствует режиму сессии.');
   if(!Object.hasOwn(w,'project')&&w.projectChecksum!==(project?.checksum??null))fail('Основа сессии изменилась; передайте полный снимок.','SESSION_BASE_MISMATCH',409);
   if(w.fileId!==null&&(typeof w.fileId!=='string'||!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(w.fileId)))fail('Неверное имя явного проекта.');
   if(w.fileRevision!==null&&(typeof w.fileRevision!=='string'||!/^[a-f0-9]{64}$/.test(w.fileRevision)))fail('Неверная ревизия явного проекта.');
   const workspace={...w,project};delete workspace.projectChecksum;
   if(Buffer.byteLength(JSON.stringify(workspace))>limits.workspaceBytes)fail('Один рабочий режим превышает 24 MiB.','SESSION_FULL',413);
   const next={...data,revision:data.revision+1,updatedAt:new Date(now()).toISOString(),tabs:{...data.tabs,[input.clientId]:{workspaces:{...data.tabs[input.clientId].workspaces,[mode]:workspace}}}};
   await persist(next);client.sequence.set(mode,input.sequence);return {...info(),saved:true,projectChecksum:project?.checksum??null};
  }),
  heartbeat:input=>serial(async()=>{checkKeys(input,['sessionId','clientId','pageId']);authenticate(input);return {...info(),ok:true};}),
  presence:input=>serial(async()=>{
   checkKeys(input,['sessionId','clientId','pageId']);const client=authenticate(input),token=Symbol();client.connected=true;client.presence=token;
   return ()=>serial(async()=>{if(clients.get(input.clientId)===client&&client.presence===token){client.connected=false;client.active=false;}});
  }),
  release:input=>serial(async()=>{
   checkKeys(input,['sessionId','clientId','pageId']);
   // A delayed pagehide from the previous document may arrive after the next page opened.
   const c=clients.get(input.clientId);if(data?.id===input.sessionId&&c?.pageId===input.pageId)c.active=false;
   return {ok:true};
  }),
  idle:()=>queue,
  file
 };
}
