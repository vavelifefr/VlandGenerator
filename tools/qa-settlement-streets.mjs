// Isolated-copy settlement UI checks; forms/buttons use synthetic DOM events.
import {validateSettlement} from '../engine/api/settlements.mjs';
import {hash} from '../content/common.mjs';
const frame=document.querySelector('iframe'),out=document.querySelector('pre'),results=[],errors=[];let doc;
const assert=(v,m)=>{if(!v)throw Error(m);},until=async(fn,label)=>{for(let i=0;i<2400;i++){if(fn())return;await new Promise(r=>setTimeout(r,25));}throw Error('Timeout '+label+': '+doc?.getElementById('status')?.textContent);};
const publish=(complete=false)=>{out.textContent=JSON.stringify({ok:!errors.length,complete,results,errors},null,2);out.dataset.ready=String(complete);};
const change=(selector,value)=>{const el=doc.querySelector(selector);el.value=value;el.dispatchEvent(new doc.defaultView.Event('change',{bubbles:true}));};
async function download(label){let value;const w=doc.defaultView,proto=w.HTMLAnchorElement.prototype,click=proto.click,create=w.URL.createObjectURL,blobs=new Map();w.URL.createObjectURL=function(blob){const url=create.call(this,blob);blobs.set(url,blob);return url;};proto.click=function(){if(this.download?.endsWith('.json')){blobs.get(this.href)?.text().then(s=>value=JSON.parse(s));return;}return click.call(this);};try{doc.getElementById('export').click();[...doc.querySelectorAll('#dialog-actions button')].find(b=>b.textContent===label).click();await until(()=>value,'export '+label);doc.getElementById('dialog-close').click();return value;}finally{proto.click=click;w.URL.createObjectURL=create;}}
try{
 const boundary=new URL(location.href).searchParams.has('boundary');
 for(const width of [1100,360])for(const seed of boundary?[71]:[7,42]){
  frame.width=width;const old=frame.contentDocument;frame.src='/Web/HTML/settlements.html?qa=streets'+width+seed;await until(()=>frame.contentDocument!==old&&frame.contentDocument?.querySelector('[data-path="width"]')&&!frame.contentDocument.querySelector('main').inert,'load');doc=frame.contentDocument;
  doc.getElementById('reset-map-settings').click();for(const[path,value]of Object.entries({width:boundary?160:48,height:boundary?160:40,'terrain.water':.35,'terrain.relief':.9}))change('[data-path="'+path+'"]',value);doc.getElementById('seed').value=seed;
  doc.getElementById('generate').click();await until(()=>doc.getElementById('status').textContent.startsWith('Карта готова.')&&!doc.getElementById('sidebar').inert&&doc.getElementById('session-status').textContent==='Сессия сохранена','worker generate');
  assert(doc.documentElement.scrollWidth<=doc.documentElement.clientWidth+1,'No horizontal overflow');assert(doc.getElementById('map').width>0,'Canvas drawn');
  const project=await download('Проект JSON');assert(validateSettlement(project.source).ok,'Native settlement valid');const roads=project.source.atlas.layers[0].fields.road,bridges=roads.filter(v=>v==='bridge').length,piers=roads.filter(v=>v==='pier').length;if(!boundary)assert(bridges>0,'River crossing fixture');assert(project.source.streets.every(s=>s.path.length>=2),'Actual street paths exported');
  const runtime=await download('Для приложения');assert(hash(runtime.navigation[0].streets)===hash(project.source.streets),'Runtime actual street paths');
  const previous=doc;frame.contentWindow.location.reload();await until(()=>frame.contentDocument!==previous&&frame.contentDocument?.querySelector('[data-path="width"]')&&!frame.contentDocument.getElementById('export').disabled&&!frame.contentDocument.querySelector('main').inert,'restore');doc=frame.contentDocument;assert(hash(await download('Проект JSON'))===hash(project),'Session exact');
  results.push({width,mapWidth:boundary?160:48,mapHeight:boundary?160:40,seed,worker:true,valid:true,bridges,piers,parcels:project.source.parcels.length,paths:true,runtime:true,noOverflow:true,sessionExact:true,input:'synthetic forms/buttons'});publish();
 }
 publish(true);
}catch(e){errors.push({message:e.message,stack:e.stack});publish(true);}
