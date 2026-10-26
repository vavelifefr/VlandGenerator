import {MODES} from '../app/contracts.mjs';
// Run in an isolated copy: these UI events deliberately use synthetic keydown.
const frame=document.querySelector('iframe'),out=document.querySelector('pre'),results=[],errors=[];
let doc;
const assert=(v,m)=>{if(!v)throw Error(m);};
const until=async(fn,label)=>{for(let i=0;i<2400;i++){if(fn())return;await new Promise(r=>setTimeout(r,25));}throw Error('Timeout '+label+': '+doc?.getElementById('status')?.textContent);};
const publish=(complete=false)=>{out.textContent=JSON.stringify({ok:!errors.length,complete,results,errors},null,2);out.dataset.ready=String(complete);};
const change=(selector,value)=>{const e=doc.querySelector(selector);e.value=value;e.dispatchEvent(new doc.defaultView.Event('change',{bubbles:true}));};
const key=(code,target=doc.getElementById('map'),extra={})=>target.dispatchEvent(new doc.defaultView.KeyboardEvent('keydown',{code,bubbles:true,cancelable:true,...extra}));
const selected=attribute=>doc.querySelector('['+attribute+'][aria-pressed="true"]').getAttribute(attribute);
async function importProject(project){const w=doc.defaultView,transfer=new w.DataTransfer();transfer.items.add(new w.File([JSON.stringify(project)],'layout.json',{type:'application/json'}));const input=doc.getElementById('file');input.files=transfer.files;input.dispatchEvent(new w.Event('change',{bubbles:true}));await until(()=>input.value===''&&doc.getElementById('status').textContent==='Проект импортирован.'&&!doc.getElementById('sidebar').inert,'import');}
try{
 const modes=Object.keys(MODES);
 for(const mode of modes){
  const recipe=await(await fetch('/api/defaults?mode='+mode)).json();
  if(['landscape','hexlandscape'].includes(mode))assert(recipe.generation.layers.above===0&&recipe.generation.layers.underground===0,'Surface-only default');
  if(['landscape','hexlandscape','caves','settlements','relief'].includes(mode))Object.assign(recipe.generation,{width:32,height:32});
  if(mode==='caves')recipe.generation.layers={above:0,underground:1};
  if(mode==='dungeon'){recipe.generation.rooms.count=5;recipe.generation.search.candidates=1;}
  if(mode==='tiers')for(const layer of recipe.generation.layers)layer.request.rooms={count:3};
  if(mode==='sideview')recipe.generation.rooms=6;
  const response=await fetch('/api/generate-base',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({recipe})});assert(response.ok,'Prepare '+mode);const project=await response.json();
  for(const width of [1100,360]){
   frame.width=width;const old=frame.contentDocument;frame.src='/Web/HTML/'+MODES[mode].page;await until(()=>frame.contentDocument!==old&&frame.contentDocument?.getElementById('terrain-paint-panel')&&!frame.contentDocument.querySelector('main').inert,'load');doc=frame.contentDocument;await importProject(project);assert(!doc.getElementById('export-png').disabled,'PNG export available on initial field');
   assert(!doc.getElementById('quick-edit'),'Duplicate toolbar absent');assert(doc.querySelectorAll('[data-terrain-tool="brush"]').length===1,'One geometry brush');
   const canvas=doc.getElementById('map').getBoundingClientRect(),editor=doc.getElementById('terrain-paint-panel').getBoundingClientRect();assert(editor.top>=canvas.bottom,'Editor stays below map');
   assert(doc.documentElement.scrollWidth<=doc.documentElement.clientWidth+1,'No horizontal overflow');
   key('KeyB');assert(selected('data-terrain-tool')==='brush','Brush shortcut');key('KeyP');assert(selected('data-terrain-tool')==='pencil','Pencil shortcut');
   key('KeyB',doc.getElementById('title'));assert(selected('data-terrain-tool')==='pencil','Input protected');
   doc.getElementById('recipe').click();key('KeyB',doc.getElementById('dialog-close'));assert(selected('data-terrain-tool')==='pencil','Modal protected');doc.getElementById('dialog-close').click();
   key('KeyV');assert(selected('data-terrain-tool')==='inspect','Inspect shortcut');
   change('#channel','humidity');key('KeyB');assert(selected('data-terrain-tool')==='inspect','Diagnostic remains readonly');change('#channel','material');
   doc.getElementById('tab-content').click();doc.querySelector('[data-stage="items"]').click();doc.getElementById('kind-zone').click();key('KeyB');assert(selected('data-draw-tool')==='brush','Zone shortcut');
   doc.getElementById('kind-spawner').click();key('KeyE');assert(selected('data-draw-tool')==='eraser','Spawner eraser');key('KeyP');assert(selected('data-draw-tool')==='pencil','Spawner pencil');
   doc.getElementById('tab-map').click();await until(()=>doc.getElementById('session-status').textContent==='Сессия сохранена','session');
   results.push({mode,width,duplicateToolbar:false,editorBelowMap:true,noOverflow:true,geometryAndSourceShortcuts:true,inputAndDialogProtected:true,diagnosticReadonly:true,keyboardInput:'synthetic'});publish();
  }
 }
 publish(true);
}catch(e){errors.push({message:e.message,stack:e.stack});publish(true);}
