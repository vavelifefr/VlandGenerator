// Isolated-copy browser regression; synthetic pointer capture is used explicitly.
import {hash} from '../content/common.mjs';
const frame=document.querySelector('iframe'),out=document.querySelector('pre'),results=[],errors=[];let doc;
const assert=(v,m)=>{if(!v)throw Error(m);},until=async(fn,label)=>{for(let i=0;i<2400;i++){if(fn())return;await new Promise(r=>setTimeout(r,25));}throw Error('Timeout '+label+': '+doc?.getElementById('status')?.textContent);};
const publish=(complete=false)=>{out.textContent=JSON.stringify({ok:!errors.length,complete,results,errors},null,2);out.dataset.ready=String(complete);};
const change=(selector,value,emit=true)=>{const el=doc.querySelector(selector);assert(el,'Missing '+selector);el.value=value;if(emit)el.dispatchEvent(new doc.defaultView.Event('change',{bubbles:true}));};
const settled=()=>!doc.getElementById('sidebar').inert&&doc.getElementById('session-status').textContent==='Сессия сохранена';
async function project(){let value;const w=doc.defaultView,proto=w.HTMLAnchorElement.prototype,original=proto.click,create=w.URL.createObjectURL,blobs=new Map();w.URL.createObjectURL=function(blob){const url=create.call(this,blob);blobs.set(url,blob);return url;};proto.click=function(){if(this.download?.endsWith('.json')){blobs.get(this.href)?.text().then(s=>value=JSON.parse(s));return;}return original.call(this);};try{doc.getElementById('export').click();[...doc.querySelectorAll('#dialog-actions button')].find(b=>b.textContent==='Проект JSON').click();await until(()=>value,'export');doc.getElementById('dialog-close').click();return value;}finally{proto.click=original;w.URL.createObjectURL=create;}}
async function clickCell(canvas){
 canvas.focus();doc.getElementById('fit').click();const r=canvas.getBoundingClientRect(),scale=Math.max(.4,Math.min(16,(r.width-30)/32,(r.height-30)/32));
 // Test a cell strictly inside the rendered board. Hex uses its corresponding fit extent.
 let point={x:(r.width-32*scale)/2+8.5*scale,y:(r.height-32*scale)/2+8.5*scale};
 if(doc.querySelector('main').dataset.mode==='hexlandscape'){
  const {hexExtent,hexPosition}=await import('../Web/HTML/ui/hex-render.mjs'),extent=hexExtent({width:32,height:32}),s=Math.max(.3,Math.min(16,(r.width-30)/extent.width,(r.height-30)/extent.height)),p=hexPosition({x:8,y:8});point={x:(r.width-extent.width*s)/2+p.x*s,y:(r.height-extent.height*s)/2+p.y*s};
 }
 const capture=canvas.setPointerCapture;canvas.setPointerCapture=()=>{};
 try{for(const type of ['pointerdown','pointerup'])canvas.dispatchEvent(new doc.defaultView.PointerEvent(type,{bubbles:true,button:0,pointerId:1,clientX:r.left+point.x,clientY:r.top+point.y}));}finally{canvas.setPointerCapture=capture;}
}
try{
 for(const width of [1100,360])for(const topology of ['square','hex']){
  frame.width=width;const old=frame.contentDocument;frame.src='/Web/HTML/'+(topology==='hex'?'hexlandscape':'landscape')+'.html?qa='+width+topology;await until(()=>frame.contentDocument!==old&&frame.contentDocument?.getElementById('landscape-stack')&&!frame.contentDocument.querySelector('main').inert,'load');doc=frame.contentDocument;
  doc.getElementById('reset-map-settings').click();await until(()=>doc.getElementById('status').textContent.startsWith('Настройки карты сброшены')&&doc.querySelector('[data-path="layers.underground"]').value==='0','settings reset');change('[data-path="width"]',32);change('[data-path="height"]',32);
  assert(doc.querySelector('[data-path="layers.underground"]').value==='0','Surface-only reset');doc.getElementById('landscape-add-layer').click();doc.getElementById('landscape-add-layer').click();
  assert(doc.querySelectorAll('#landscape-stack>.physical-layer').length===3,'Three draft map blocks');
  change('[data-layer-config="cave-1"][data-layer-setting="depth"]',16,false);change('[data-layer-config="cave-2"][data-layer-setting="depth"]',64,false);
  change('[data-layer-config="cave-1"][data-layer-setting="style"]','karst');assert(doc.querySelector('[data-layer-config="cave-2"][data-layer-setting="depth"]').value==='64','Other unblurred depth retained');
  change('[data-layer-config="cave-2"][data-layer-setting="style"]','lava-tubes');doc.getElementById('generate').click();await until(()=>doc.getElementById('status').textContent.startsWith('Карта готова.')&&settled(),'generate');
  const initial=await project();assert(JSON.stringify(initial.source.layers.map(l=>l.z))==='[0,-16,-64]','Individual depths applied');assert(initial.recipe.generation.layerSettings['cave-1'].caves.style==='karst','Individual style applied');assert(doc.querySelectorAll('[data-path="landscape.structure"]').length===1&&doc.querySelectorAll('[data-path="landscape.baseBiome"]').length===1,'No duplicated surface settings after regeneration');
  const roots=[...doc.querySelectorAll('#landscape-stack>.physical-layer')],canvases=roots.map(root=>root.querySelector('canvas'));assert(canvases.length===3&&canvases.every(c=>c.width>0&&c.height>0),'Three rendered canvases');
  const rects=canvases.map(c=>c.getBoundingClientRect());assert(rects[0].bottom<rects[1].top&&rects[1].bottom<rects[2].top,'Maps vertically stacked');assert(doc.documentElement.scrollWidth<=doc.documentElement.clientWidth+1,'No horizontal overflow');
  change('[data-layer-channel="surface"]','elevation');change('[data-layer-channel="cave-1"]','biome');assert(doc.querySelector('[data-layer-channel="surface"]').value==='elevation','Independent view channels');
  const cave=doc.getElementById('map-cave-1');cave.focus();assert(doc.getElementById('layer').value==='cave-1','Focus selects the actual layer');
  doc.querySelector('[data-terrain-tool="pencil"]').click();doc.querySelector('[data-palette="plains"]').click();await clickCell(cave);await until(()=>doc.getElementById('status').textContent.startsWith('Геометрия изменена.')&&settled(),'paint cave');
  const painted=await project();assert(painted.edits.length===1&&painted.edits[0].layerId==='cave-1'&&painted.edits[0].value==='plains','Stroke targets selected cave only');assert(hash(initial.source)===hash(painted.source),'Generated source immutable');
  doc.getElementById('undo').click();await until(()=>doc.getElementById('status').textContent==='Изменение отменено.'&&settled(),'undo');assert(hash(await project())===hash(initial),'Undo exact');doc.getElementById('redo').click();await until(()=>doc.getElementById('status').textContent==='Изменение возвращено.'&&settled(),'redo');assert(hash(await project())===hash(painted),'Redo exact');
  roots[2].open=false;await until(settled,'collapse');const previous=doc;frame.contentWindow.location.reload();await until(()=>frame.contentDocument!==previous&&frame.contentDocument?.getElementById('map-cave-2')&&!frame.contentDocument.querySelector('main').inert,'restore');doc=frame.contentDocument;await until(settled,'restored session');
  assert(!doc.querySelector('[data-layer-id="cave-2"]').open,'Collapsed layer restored');assert(doc.querySelector('[data-layer-channel="surface"]').value==='elevation','Independent channel restored');assert(hash(await project())===hash(painted),'Session exact project');
  results.push({width,topology,maps:3,individualDepths:[0,-16,-64],independentStyles:true,unblurredSettingsRetained:true,stacked:true,noOverflow:true,paintedLayer:'cave-1',sourceImmutable:true,undoRedo:true,sessionRestored:true,input:'synthetic pointer/key focus'});publish();
 }
 publish(true);
}catch(e){errors.push({message:e.message,stack:e.stack});publish(true);}
