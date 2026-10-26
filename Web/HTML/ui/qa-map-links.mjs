import {MODES} from '../../../app/contracts.mjs';
import {canvasPointerTarget} from './qa-pointer.mjs';
import {webHref} from './paths.mjs';
import {materialize,contentScene} from '../../../app/index.mjs';
import {createSource,analyzeSource,hash} from '../../../content/index.mjs';
const frame=document.querySelector('iframe'),out=document.querySelector('#qa-report'),queue=document.querySelector('#qa-click'),results=[],errors=[],savedIds=[],run='qa-links-'+Date.now().toString(36);let doc,fileId,sequence=0;
const publish=(complete=false)=>{out.textContent=JSON.stringify({ok:!errors.length,complete,results,errors,savedIds},null,2);if(complete){out.dataset.ready='true';queue.dataset.complete='true';queue.dataset.ready='false';}};
const until=async fn=>{for(let i=0;i<2000;i++){if(fn())return;await new Promise(r=>setTimeout(r,30));}throw new Error('Timeout: '+doc?.querySelector('#status')?.textContent);};
const eq=(a,b,label)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(label+': '+JSON.stringify([a,b]));};
const click=id=>doc.querySelector('#'+id).click();
const change=(id,value)=>{const el=doc.querySelector('#'+id);el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));};
const ready=()=>!doc.querySelector('#sidebar').inert&&!doc.querySelector('main').inert;
async function save(){click('save');doc.querySelector('#dialog-content input').value=fileId;[...doc.querySelectorAll('#dialog-actions button')].find(b=>b.textContent==='Сохранить').click();await until(()=>!doc.querySelector('#dialog').open);if(!savedIds.includes(fileId))savedIds.push(fileId);const r=await fetch('/api/projects/'+fileId);if(!r.ok)throw new Error('Save failed');return(await r.json()).project;}
async function layer(id){if(doc.querySelector('#layer').value!==id){change(doc.querySelector('#link-prompt').classList.contains('hidden')?'layer':'link-target-layer',id);await until(()=>doc.querySelector('#layer').value===id&&ready());}}
async function mapClick(p,l,label){
 click('fit');doc.querySelector('#map').scrollIntoView({block:'center'});frame.scrollIntoView({block:'start'});await new Promise(requestAnimationFrame);
 const rect=doc.querySelector('#map').getBoundingClientRect(),parent=doc.querySelector('#map').parentElement.getBoundingClientRect(),outer=frame.getBoundingClientRect(),s=Math.max(.4,Math.min(16,(parent.width-30)/l.width,(parent.height-30)/l.height));
 const target=canvasPointerTarget(frame,doc.querySelector('#map'),{x:(parent.width-l.width*s)/2+(p.x+.5)*s,y:(parent.height-l.height*s)/2+(p.y+.5)*s});
 queue.textContent=JSON.stringify({token:++sequence,...target,layerId:l.id,point:p,label});queue.dataset.ready='true';await new Promise(resolve=>{doc.querySelector('#map').addEventListener('pointerup',()=>{queue.dataset.ready='false';resolve();},{once:true});});
 await until(ready);
}
async function candidates(p,l,catalogId){const scene=await contentScene(p),s=createSource({id:'search',category:'objects',layer:l,catalogId}),mask=analyzeSource({...scene,sources:[...scene.sources,s]},s.id).eligibleMask,points=mask.runs.flatMap(([y,x,n])=>Array.from({length:n},(_,i)=>({x:x+i,y}))).filter(t=>!p.sources.some(s=>s.layerId===l.id&&Math.abs(t.x-s.area.x)+Math.abs(t.y-s.area.y)<2));if(p.recipe.mode==='sideview'){const {createPlatformerModel}=await import('../../../engine/core/platformer-physics.mjs'),model=createPlatformerModel(p.source),height=p.source.request.physics.height;return points.filter(t=>{const y=t.y+1-height;return model.fits(t.x,y)&&!model.lethal(t.x,y)&&model.grounded(t.x,y);});}return points;}
function near(points,p){return points.sort((a,b)=>Math.abs(a.x-p.x)+Math.abs(a.y-p.y)-Math.abs(b.x-p.x)-Math.abs(b.y-p.y))[0];}
try{
 for(const width of [1100,360])for(const mode of Object.keys(MODES)){
  frame.width=width;if(doc)doc.querySelector('nav a[href="'+webHref(MODES[mode].page)+'"]').click();else frame.src=MODES[mode].page;await until(()=>frame.contentDocument?.querySelector('main')?.dataset.mode===mode&&!frame.contentDocument.querySelector('main').inert&&frame.contentDocument.querySelector('#session-status')?.textContent==='Сессия сохранена');doc=frame.contentDocument;fileId=run+'-'+mode+'-'+width;
  click('recipe');const r=JSON.parse(doc.querySelector('#dialog-content textarea').value);r.seed=42;if(mode==='dungeon'){r.generation.rooms.count=4;r.generation.search.candidates=1;}if(mode==='tiers')for(const l of r.generation.layers){l.request.rooms.count=3;l.request.search.candidates=1;}if(mode==='sideview')r.generation.rooms=6;if(['caves','landscape','hexlandscape'].includes(mode)){r.generation.width=32;r.generation.height=32;r.generation.layers={above:0,underground:1};}if(['settlements','relief'].includes(mode)){r.generation.width=32;r.generation.height=32;}
  doc.querySelector('#dialog-content textarea').value=JSON.stringify(r);[...doc.querySelectorAll('#dialog-actions button')].find(b=>b.textContent==='Применить JSON').click();await until(()=>!doc.querySelector('#dialog').open);click('generate');await until(()=>ready()&&doc.querySelector('#status').textContent.startsWith('Карта готова.'));let project=await save(),layers=await materialize(project),a=mode==='caves'?layers.find(l=>l.kind==='underground'):layers[0],b=layers.find(l=>l.id!==a.id)??a;
  for(const kind of ['teleport','lift','stairs']){
   const catalogId=kind==='teleport'?'portal':kind,from=near(await candidates(project,a,catalogId),a.spawn),target=near((await candidates(project,b,catalogId)).filter(t=>a.id!==b.id||Math.abs(t.x-from.x)+Math.abs(t.y-from.y)>2),b.exit);if(!from||!target)throw new Error(mode+' no points for '+kind);
   await layer(a.id);doc.querySelector('#transition-panel').open=true;change('transition-kind',kind);const before=project;click('transition-place');await mapClick(from,a,mode+' '+width+' '+kind+' first');await until(()=>ready()&&doc.querySelector('#status').textContent.startsWith('Создана точка перехода'));project=await save();eq(project.sources.length,before.sources.length+1,'Source creation');const sourceId=project.sources.at(-1).id;
   click('transition-link');await until(()=>!doc.querySelector('#link-prompt').classList.contains('hidden'));click('link-cancel');eq(doc.querySelector('#link-prompt').classList.contains('hidden'),true,'Cancel mode');click('transition-link');
   await layer(b.id);
   await mapClick(target,b,mode+' '+width+' '+kind+' target');await until(()=>ready()&&doc.querySelector('#status').textContent.startsWith('Переход связан'));project=await save();const t=project.transitions.find(t=>t.fromSourceId===sourceId);if(!t)throw new Error('Missing link '+mode);eq(t.kind,kind,'Kind');eq(project.sources.length,before.sources.length+2,'Pair source count');eq(hash(project.source),hash(before.source),'Geometry changed');eq(hash(project.catalog),hash(before.catalog),'Catalog changed');eq(t.bidirectional,true,'Direction');
   click('transition-jump');await until(()=>ready()&&doc.querySelector('#layer').value===a.id&&doc.querySelector('#transition-selected').textContent.includes('('+from.x+', '+from.y+')'));
   change('transition-cost','3');click('transition-update');await until(()=>ready()&&doc.querySelector('#status').textContent.startsWith('Переход связан'));project=await save();eq(project.transitions.find(x=>x.id===t.id).travelCost,3,'Update cost');
   click('transition-unlink');await until(()=>ready()&&doc.querySelector('#transition-feedback').textContent.startsWith('Связь удалена'));click('undo');await until(()=>ready()&&doc.querySelector('#status').textContent==='Изменение отменено.');const restored=await save();eq(restored.transitions,project.transitions,'Undo removed link');project=restored;
   if(doc.documentElement.scrollWidth>doc.documentElement.clientWidth)throw new Error('Horizontal overflow '+width);results.push({mode,width,kind,crossLayer:a.id!==b.id,placedAndLinkedByPointer:true,geometryUnchanged:true,cancel:true,jump:true,update:true,unlinkUndo:true,noOverflow:true});publish();
  }
  // Reopen the explicitly saved document through the ordinary project picker.
  const checksum=project.checksum;click('open');await until(()=>[...doc.querySelectorAll('#dialog-content button')].some(b=>b.textContent.includes(fileId)));[...doc.querySelectorAll('#dialog-content button')].find(b=>b.textContent.includes(fileId)).click();await until(()=>ready()&&!doc.querySelector('#dialog').open);const reopened=await save();eq(reopened.checksum,checksum,'Reopened links changed');
 }
 publish(true);
}catch(e){errors.push({message:e.message,stack:e.stack,status:doc?.querySelector('#status')?.textContent});publish(true);}
