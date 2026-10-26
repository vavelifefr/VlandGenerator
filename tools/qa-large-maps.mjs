// Browser-only QA, served in an isolated project copy by verify-large-maps.mjs.
const frame=document.querySelector('iframe'),out=document.querySelector('pre'),results=[],errors=[];
let doc;
const assert=(v,label)=>{if(!v)throw Error(label);};
const until=async(fn,label)=>{for(let i=0;i<3600;i++){if(fn())return;await new Promise(r=>setTimeout(r,25));}throw Error('Timeout '+label+': '+doc?.getElementById('status')?.textContent);};
const publish=(complete=false)=>{out.textContent=JSON.stringify({ok:!errors.length,complete,results,errors},null,2);out.dataset.ready=String(complete);};
const set=(path,value)=>{const el=doc.querySelector('[data-path="'+path+'"]');el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));};
try{
 for(const width of [1100,360])for(const topology of ['square','hex']){
  frame.width=width;const old=frame.contentDocument;frame.src='/Web/HTML/'+(topology==='hex'?'hexlandscape':'landscape')+'.html';await until(()=>frame.contentDocument!==old&&frame.contentDocument?.getElementById('generate')&&frame.contentDocument.getElementById('generation-size-budget')&&!frame.contentDocument.querySelector('main').inert,'editor');doc=frame.contentDocument;await until(()=>doc.getElementById('session-status').textContent==='Сессия сохранена','ready');
  // Invalid default layer combination must be explained without starting a Worker.
  set('width',256);set('height',256);set('layers.above',1);set('layers.underground',2);
  assert(doc.getElementById('generate').disabled&&doc.getElementById('generate-random').disabled,'Invalid dimensions disabled');assert(doc.getElementById('generation-size-budget').textContent.includes('262144'),'Live total explained');
  set('layers.above',0);set('layers.underground',0);assert(!doc.getElementById('generate').disabled,'Valid 256 enabled');
  const start=performance.now();doc.getElementById('generate').click();await until(()=>doc.getElementById('status').textContent.startsWith('Карта готова.'),'generation');await until(()=>doc.getElementById('session-status').textContent==='Сессия сохранена','session');const elapsedMs=Math.round(performance.now()-start);
  assert(doc.getElementById('map-info').textContent.includes('256 × 256'),'Full dimensions rendered');assert(doc.getElementById('layer').options.length===1,'Requested layer count');assert(!doc.documentElement.querySelector('main').inert,'Editor ready');assert(doc.documentElement.scrollWidth<=doc.documentElement.clientWidth+1,'No overflow');
  results.push({width,topology,size:256,invalidDefaultBlocked:true,generateAndSession:true,elapsedMs,mapInfo:doc.getElementById('map-info').textContent});publish();
 }
 publish(true);
}catch(e){errors.push({message:e.message,stack:e.stack});publish(true);}
