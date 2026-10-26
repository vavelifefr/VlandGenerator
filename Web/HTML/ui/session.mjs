import {MODES} from '../../../app/contracts.mjs';
const KEY='vland.working-tab';
const pages=new Set(['index.html',...Object.values(MODES).map(mode=>mode.page),'settings.html','guide.html','llm.html']);
const storage={read(){try{return JSON.parse(sessionStorage.getItem(KEY)??'{}');}catch{return{};}},write(value){try{sessionStorage.setItem(KEY,JSON.stringify(value));}catch{/* The live session still works when browser storage is unavailable. */}}};

export function createWorkingSession({mode=null,badge=null}={}){
 let tab=storage.read(),pageId=crypto.randomUUID(),capture=null,restoring=false,ready=false,navigating=false,error=null,pending=false,sequence=0,version=0,navigationVersion=0,savedChecksum,task=null,timer=null,presence=null,reconnect=null,leaving=false;
 tab.clientId??=crypto.randomUUID();
 const label=(text,bad=false)=>{if(badge){badge.textContent=text;badge.classList.toggle('error',bad);badge.title=bad?text:'Один временный файл для всех вкладок и режимов. После закрытия всех вкладок новое открытие начинает чистую сессию.';}};
 const identity=()=>({sessionId:tab.sessionId,clientId:tab.clientId,pageId});
 const request=async(operation,input)=>{
  const response=await fetch('/api/session/'+operation,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}),value=await response.json();
  if(!response.ok)throw Object.assign(new Error(value.error?.message??'Не удалось сохранить рабочую сессию.'),{code:value.error?.code});return value;
 };
 const connectPresence=()=>new Promise(resolve=>{
  clearTimeout(reconnect);presence?.close();
  const url=new URL('/api/session/presence',location.href);url.protocol=location.protocol==='https:'?'wss:':'ws:';for(const[k,v]of Object.entries(identity()))url.searchParams.set(k,v);
  const socket=new WebSocket(url);presence=socket;let settled=false;
  const done=()=>{if(!settled){settled=true;clearTimeout(timeout);resolve();}};
  const timeout=setTimeout(done,1500);
  socket.onopen=done;socket.onerror=done;
  socket.onclose=()=>{done();if(presence===socket&&!leaving&&!navigating)reconnect=setTimeout(()=>connectPresence(),2000);};
 });
 const open=async(resume)=>{
  const result=await request('open',{...identity(),resume,mode});tab={clientId:result.clientId,sessionId:result.id};storage.write(tab);ready=true;await connectPresence();label('Сессия готова');return result.workspace;
 };
 const navigationType=performance.getEntriesByType('navigation')[0]?.type;
 const resume=Boolean(tab.sessionId&&(tab.resumeUntil>Date.now()||navigationType==='reload'||navigationType==='back_forward'));
 const initial=open(resume).catch(e=>{error=e;label('Сессия недоступна: '+e.message,true);return null;});
 const changed=()=>{if(!capture||restoring||navigating)return;pending=true;version++;label('Сохраняю сессию…');clearTimeout(timer);timer=setTimeout(()=>flush().catch(()=>{}),250);};
 const flush=async()=>{
  clearTimeout(timer);await initial;if(!capture||restoring)return;
  if(task){await task;if(pending)return flush();return;}
  if(!pending)return;
  const currentVersion=version;
  task=(async()=>{
   if(!ready)await open(true);
   const workspace=capture();if(!workspace)return;
   // UI drafts are small; immutable geometry is sent only when its checksum changes.
   const checksum=workspace.project?.checksum??null;
   if(savedChecksum===checksum){delete workspace.project;workspace.projectChecksum=checksum;}
   try{await request('save',{...identity(),mode,sequence:++sequence,workspace});}
   catch(e){
    if(!['SESSION_EXPIRED','SESSION_BASE_MISMATCH'].includes(e.code))throw e;
    if(e.code==='SESSION_EXPIRED')await open(true);
    const full=capture();await request('save',{...identity(),mode,sequence:++sequence,workspace:full});
   }
   savedChecksum=checksum;pending=version!==currentVersion;error=null;label(pending?'Сохраняю сессию…':'Сессия сохранена');
  })();
  try{await task;}catch(e){error=e;label('Не сохранено: '+e.message,true);throw e;}finally{task=null;}
  if(pending)return flush();
 };
 const release=()=>{if(!ready)return;const body=JSON.stringify(identity());navigator.sendBeacon('/api/session/release',new Blob([body],{type:'application/json'}));};
 window.addEventListener('pagehide',()=>{leaving=true;clearTimeout(timer);clearTimeout(reconnect);presence?.close();release();});
 let heartbeat;
 const startHeartbeat=()=>{clearInterval(heartbeat);heartbeat=setInterval(()=>{if(ready&&!navigating)request('heartbeat',identity()).catch(()=>{});},15000);};
 window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
 startHeartbeat();
 window.addEventListener('pagehide',()=>clearInterval(heartbeat));
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flush().catch(()=>{});else if(ready)request('heartbeat',identity()).catch(()=>{});});
 document.addEventListener('change',changed);document.addEventListener('input',changed);
 document.addEventListener('click',e=>{
  const a=e.target.closest?.('a[href]');if(!a){changed();return;}if(a.download||a.target&&a.target!=='_self'||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
  const url=new URL(a.href,location.href);if(url.origin!==location.origin||!pages.has(url.pathname.split('/').pop()||'index.html'))return;
  if(url.pathname===location.pathname&&url.search===location.search){if(!url.hash||url.hash===location.hash)e.preventDefault();return;}
  e.preventDefault();if(navigating)return;const requestId=++navigationVersion;
  (async()=>{
   try{if(capture){changed();await flush();}else await initial;
    if(requestId!==navigationVersion)return;navigating=true;tab.resumeUntil=Date.now()+30000;storage.write(tab);location.assign(url.href);
   }catch(e){label('Переход не выполнен: '+e.message+'. Повторите нажатие меню.',true);}
  })();
 });
 return {
  initial,changed,flush,
  async restore(apply){restoring=true;try{const value=await initial;if(value){savedChecksum=value.project?.checksum??null;await apply(value);}}finally{restoring=false;}},
  register(fn){capture=fn;},
  shouldWarn:()=>!navigating&&Boolean(capture&&(pending||task||error)),
  isRestoring:()=>restoring
 };
}
