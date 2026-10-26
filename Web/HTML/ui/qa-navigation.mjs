import {canvasPointerTarget} from './qa-pointer.mjs';
import {webHref} from './paths.mjs';
import {MODES} from '../../../app/contracts.mjs';
import {materialize} from '../../../app/project.mjs';
import {hash} from '../../../content/common.mjs';
// Controls-only mode verifies URL/session changes without a trusted canvas pointer.
const controlsOnly=new URLSearchParams(location.search).get('input')==='controls';
const frame=document.querySelector('iframe'),out=document.querySelector('#qa-report'),queue=document.querySelector('#qa-click');
const results=[],errors=[],expected=new Map(),menu=[...Object.values(MODES).map(m=>m.page),'settings.html','guide.html','llm.html'];let doc,serial=0,blocked=0,routeCount=0;
const publish=(complete=false)=>{out.textContent=JSON.stringify({ok:!errors.length,complete,input:controlsOnly?'controls':'pointer',routeCount,blocked,results,errors},null,2);out.dataset.ready=String(complete);};
const until=async(fn,label='ready')=>{for(let i=0;i<2000;i++){if(fn())return;await new Promise(r=>setTimeout(r,25));}throw new Error('Timeout '+label+': '+doc?.querySelector('#status')?.textContent+' / '+doc?.querySelector('#session-status')?.textContent);};
const eq=(a,b,label)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(label+': '+JSON.stringify([a,b]));};
const click=id=>doc.getElementById(id).click();
const change=(selector,value)=>{const e=doc.querySelector(selector);e.value=value;e.dispatchEvent(new Event('change',{bubbles:true}));};
const settled=()=>doc.querySelector('#session-status')?.textContent==='Сессия сохранена'||!doc.querySelector('#status')&&doc.querySelector('#session-status')?.textContent==='Сессия готова';
async function ready(page){await until(()=>frame.contentDocument?.location.pathname.endsWith('/'+page)&&frame.contentDocument.querySelector('#session-status')&&!/Подключаю/.test(frame.contentDocument.querySelector('#session-status').textContent));doc=frame.contentDocument;await until(()=>!doc.querySelector('#status')||!doc.querySelector('#status').textContent.includes('Загрузка инструментов'));if(doc.querySelector('#status'))await until(()=>settled());doc.defaultView.addEventListener('beforeunload',e=>{if(e.defaultPrevented)blocked++;});}
function verifyMenu(){const links=[...doc.querySelectorAll('nav[aria-label="Главное меню"] a')];eq(links.map(a=>a.getAttribute('href')),menu.map(webHref),'Menu destinations');for(const a of links){const r=a.getBoundingClientRect();if(!r.width||r.left<0||r.right>doc.documentElement.clientWidth+1)throw new Error('Menu not visible: '+a.textContent);}if(doc.documentElement.scrollWidth>doc.documentElement.clientWidth+1)throw new Error('Horizontal overflow');}
async function navigate(page){const current=doc.location.pathname.split('/').pop();doc.querySelector('nav a[href="'+webHref(page)+'"]').click();if(current!==page)await ready(page);verifyMenu();routeCount++;publish();}
async function project(){let value=null;const win=doc.defaultView,proto=win.HTMLAnchorElement.prototype,original=proto.click,createURL=win.URL.createObjectURL,blobs=new Map();win.URL.createObjectURL=function(blob){const url=createURL.call(this,blob);blobs.set(url,blob);return url;};proto.click=function(){if(this.download?.endsWith('.json')){blobs.get(this.href)?.text().then(text=>value=JSON.parse(text));return;}return original.call(this);};try{click('export');[...doc.querySelectorAll('#dialog-actions button')].find(b=>b.textContent==='Проект JSON').click();await until(()=>value,'project export');click('dialog-close');await until(()=>!doc.querySelector('#dialog').open);return value;}finally{proto.click=original;win.URL.createObjectURL=createURL;}}

async function mapClick(p,l){click('fit');const canvas=doc.getElementById('map');canvas.scrollIntoView({block:'center'});frame.scrollIntoView({block:'start'});await new Promise(requestAnimationFrame);const r=canvas.getBoundingClientRect(),parent=canvas.parentElement.getBoundingClientRect(),outer=frame.getBoundingClientRect(),s=Math.max(.4,Math.min(16,(parent.width-30)/l.width,(parent.height-30)/l.height));queue.textContent=JSON.stringify({token:++serial,...canvasPointerTarget(frame,canvas,{x:(parent.width-l.width*s)/2+(p.x+.5)*s,y:(parent.height-l.height*s)/2+(p.y+.5)*s}),label:'Изменить геометрию '+l.id,point:p});queue.dataset.ready='true';const trusted=await new Promise(resolve=>canvas.addEventListener('pointerup',e=>{queue.dataset.ready='false';resolve(e.isTrusted);},{once:true}));if(!trusted)throw new Error('Trusted pointer required');await until(()=>!doc.querySelector('#sidebar').inert&&settled(),'terrain edit');}
try{
 for(const width of [1100,360]){
  frame.width=width;frame.src='dungeon.html';await ready('dungeon.html');
  for(const[mode,m]of Object.entries(MODES)){
   await navigate(m.page);verifyMenu();click('tab-map');
   change('#title','QA меню '+mode+' '+width);change('#seed',width+Object.keys(MODES).indexOf(mode)+100);click('generate');await until(()=>doc.querySelector('#status').textContent.startsWith('Карта готова.')&&settled(),'generation '+mode);
   const base=await project(),layers=await materialize(base),id=doc.querySelector('#layer').value,l=layers.find(l=>l.id===id),i=l.solid.map((v,i)=>i).filter(i=>!l.solid[i]&&!l.reserved[i]).sort((a,b)=>Math.abs(a%l.width-l.width/2)+Math.abs(Math.floor(a/l.width)-l.height/2)-Math.abs(b%l.width-l.width/2)-Math.abs(Math.floor(b/l.width)-l.height/2))[0];
   change('#channel','biome');const swatch=doc.querySelector('[data-palette="grassland"]')??doc.querySelector('[data-palette]');swatch.click();if(!controlsOnly)await mapClick({x:i%l.width,y:Math.floor(i/l.width)},l);
   click('tab-content');doc.querySelector('[data-stage="items"]').click();doc.querySelector('[data-source-kind="spawner"]').click();change('#anchor-count',1);change('#population-value',1);change('#category-seed',width+311);click('category-create');await until(()=>doc.querySelector('#status').textContent.startsWith('Наполнение категории')&&settled(),'content '+mode);
   change('#title','Черновик '+mode+' '+width);change('#seed',width+9000);change('#population-value',3);await until(settled);
   const edited=await project();if((!controlsOnly&&!edited.edits.length)||!edited.sources.length)throw new Error('Missing actual terrain/content edit '+mode);expected.set(mode,hash(edited));
   for(const target of menu){await navigate(target);if(target!==m.page)await navigate(m.page);eq(doc.getElementById('title').value,'Черновик '+mode+' '+width,'Title draft restored');eq(doc.getElementById('seed').value,String(width+9000),'Seed draft restored');eq(doc.querySelector('[data-stage="items"]').getAttribute('aria-selected'),'true','Category restored');eq(doc.getElementById('population-value').value,'3','Category draft restored');}
   const restored=await project();eq(hash(restored),expected.get(mode),'Edited map checksum after all links');
   results.push({width,mode,menu:menu.length,geometryEdits:restored.edits.length,sources:restored.sources.length,mapPreserved:true,categoryDraftPreserved:true,pendingSettingsPreserved:true,menuVisible:true});publish();
  }
  await navigate('settings.html');const grid=doc.getElementById('grid');grid.checked=!grid.checked;grid.dispatchEvent(new Event('change',{bubbles:true}));const wanted=grid.checked;await navigate('guide.html');await navigate('llm.html');await navigate('settings.html');eq(doc.getElementById('grid').checked,wanted,'Settings draft preserved without applying browser preferences');results.push({width,settingsDraftPreserved:true});publish();
 }
 if(blocked)throw new Error('beforeunload blocked '+blocked+' transitions');publish(true);queue.dataset.ready='false';queue.dataset.complete='true';
}catch(e){errors.push(e.message);publish(true);queue.dataset.ready='false';queue.dataset.complete='true';}
