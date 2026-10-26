import {MODES} from '../../../app/contracts.mjs';
import {hash} from '../../../content/common.mjs';
const frame=document.querySelector('iframe'),out=document.querySelector('#qa-report'),results=[],errors=[],savedIds=[],run='qa-transports-'+Date.now().toString(36);let doc,sequence=0;
const publish=(complete=false)=>{out.textContent=JSON.stringify({ok:!errors.length,complete,results,errors,savedIds},null,2);if(complete)out.dataset.ready='true';};
const until=async fn=>{for(let i=0;i<2000;i++){if(fn())return;await new Promise(r=>setTimeout(r,30));}throw new Error(doc?.querySelector('#status').textContent??'Timeout');};
const eq=(a,b,label)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(label);};
const click=id=>doc.querySelector('#'+id).click();
function recipe(){click('recipe');const r=JSON.parse(doc.querySelector('#dialog-content textarea').value);click('dialog-close');return r;}
async function generate(){click('generate');await until(()=>!doc.querySelector('#sidebar').inert&&doc.querySelector('#status').textContent.startsWith('Карта готова.'));}
async function save(mode,width){const id=run+'-'+mode+'-'+width+'-'+(++sequence);click('save');doc.querySelector('#dialog-content input').value=id;[...doc.querySelectorAll('#dialog-actions button')].find(b=>b.textContent==='Сохранить').click();await until(()=>doc.querySelector('#status').textContent.startsWith('Сохранено:'));if(!savedIds.includes(id))savedIds.push(id);return(await(await fetch('/api/projects/'+id)).json()).project;}
try{
 for(const width of [1100,360])for(const mode of ['dungeon','tiers']){
  frame.width=width;frame.src=MODES[mode].page;await until(()=>frame.contentDocument?.querySelector('#status')?.textContent.startsWith('Готово.'));doc=frame.contentDocument;
  const r=recipe();r.seed=4147868664;const configure=g=>{g.rooms={...g.rooms,count:10,minSize:10,maxSize:20,minArea:25,maxArea:100};g.layout={...g.layout,preset:'branches',allowDisconnected:false};g.search={...g.search,candidates:1};};if(mode==='dungeon')configure(r.generation);else for(const l of r.generation.layers)configure(l.request);
  click('recipe');doc.querySelector('#dialog-content textarea').value=JSON.stringify(r);[...doc.querySelectorAll('#dialog-actions button')].find(b=>b.textContent==='Применить JSON').click();await until(()=>!doc.querySelector('#dialog').open);await generate();const initial=await save(mode,width);
  if(mode==='dungeon'){eq(doc.querySelector('#map-info').textContent.startsWith('63 × 67'),true,'Reported dimensions');if(!doc.querySelector('#category-legend').textContent.includes('Секретная дверь'))throw new Error('Secret absent from legend');}
  const path=mode==='dungeon'?'layout.allowDisconnected':'$allowDisconnected',flag=doc.querySelector('[data-path="'+path+'"]');if(flag.checked)throw new Error('Default flag enabled');flag.checked=true;flag.dispatchEvent(new Event('change',{bubbles:true}));const changed=recipe(),expected=structuredClone(r);if(mode==='dungeon')expected.generation.layout.allowDisconnected=true;else for(const l of expected.generation.layers)l.request.layout.allowDisconnected=true;eq(changed,expected,'Flag changes other generation fields or tier IDs');
  await generate();const isolated=await save(mode,width),levels=mode==='dungeon'?[isolated.source.level]:isolated.source.layers.map(l=>l.dungeon.level);if(!levels.every(l=>l.options.allowDisconnected))throw new Error('Flag not used by generation');const transports=levels.flatMap(l=>l.transportLinks??[]);if(mode==='dungeon'&&!transports.length)throw new Error('Expected isolated component');
  const off=doc.querySelector('[data-path="'+path+'"]');off.checked=false;off.dispatchEvent(new Event('change',{bubbles:true}));await generate();
  // A new geometry detaches the save filename. Read it via an explicitly fresh QA name.
  const id=run+'-restored-'+mode+'-'+width;click('save');doc.querySelector('#dialog-content input').value=id;[...doc.querySelectorAll('#dialog-actions button')].find(b=>b.textContent==='Сохранить').click();await until(()=>doc.querySelector('#status').textContent.startsWith('Сохранено:'));savedIds.push(id);const restored=(await(await fetch('/api/projects/'+id)).json()).project;eq(hash(restored.source),hash(initial.source),'Flag off does not restore deterministic connected map');if(doc.documentElement.scrollWidth>doc.documentElement.clientWidth)throw new Error('Overflow');
  results.push({mode,width,defaultConnected:true,flagPreservesOtherSettings:true,transports:transports.length,turnOffRestoresMap:true,noOverflow:true});publish();
 }
 publish(true);
}catch(e){errors.push({message:e.message,stack:e.stack});publish(true);}
