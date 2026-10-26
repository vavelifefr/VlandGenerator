import {MapCanvas} from './canvas.mjs';
import {$,node,field,input,select} from './dom.mjs';
import {ATLAS_DEFAULTS} from '../../../engine/api/atlas-catalog.mjs';

const channels={material:'Материалы',elevation:'Карта высот',water:'Источники воды',biome:'Биомы · тематические участки'};
const styles={mixed:'Смешанная',chambers:'Залы',tunnels:'Тоннели',karst:'Карст',fractured:'Трещины','lava-tubes':'Лавовые трубы',shafts:'Шахты и уступы','water-carved':'Водные ходы'};
const shared=['sources','sourceId','visible','sourceVisible','showTerrain','showGates','showTransitions','showSources','showPreview','palette','transportLinks','transportPoints','linkSelection','linkPending','transitionErrors'];
export function landscapeStack({element,state,handlers,onActivate,onChange}){
 const primary=new MapCanvas(element,handlers),cards=new Map(),panel=element.closest('.canvas-panel'),shell=element.parentElement,footer=panel.querySelector('.canvas-footer'),popup=$('cell-popup'),host=node('div','',{id:'landscape-stack'});
 footer.before(host);let active=primary,recipe,disposed=false,add;
 const facade=new Proxy(primary,{get(target,key){if(key==='destroy')return destroy;if(key==='draw')return drawAll;const value=active[key];return typeof value==='function'?value.bind(active):value;},set(target,key,value){active[key]=value;return true;}});
 function drawAll(){if(disposed)return;for(const card of cards.values()){card.channel.value=card.map.channel;if(card.map!==active){for(const key of shared)card.map[key]=active[key];card.map.preview=null;card.map.proposedSources=[];}if(card.root.open)card.map.draw();}}
 function activate(id,{notify=true}={}){
  const card=cards.get(id);if(!card?.map.layer||active===card.map)return false;
  if(notify&&onActivate(id)===false)return false;
  const previous=active;for(const key of shared)card.map[key]=previous[key];card.map.tool=previous.tool;previous.drag=null;previous.polygon=[];previous.selection=null;previous.preview=null;previous.ghost=null;
  active=card.map;card.root.open=true;active.canvas.parentElement.prepend(popup);popup.classList.add('hidden');$('channel').value=active.channel;
  for(const c of cards.values())c.root.classList.toggle('active-layer',c===card);
  if(notify)onActivate(id,true);drawAll();return true;
 }
 function writeSetting(card,key,value){
  recipe.generation.layerSettings??={};recipe.generation.layerSettings[card.id]??={};const settings=recipe.generation.layerSettings[card.id];
  if(key==='depth')settings.depth=value;else{settings.caves??={};settings.caves[key]=value;}onChange();configure(recipe);
 }
 function make(id){
  const surface=id==='surface',root=node('details','',{className:'physical-layer',open:true}),summary=node('summary'),title=node('span'),badge=node('span','',{className:'badge'}),settings=node('details','',{className:'physical-layer-settings'}),settingsBody=node('div','',{className:'details-body'}),channel=select(channels,'material');
  root.dataset.layerId=id;summary.append(title,badge);settings.append(node('summary','Настройки слоя'),settingsBody);root.append(summary,settings);
  const layerShell=surface?shell:node('div','',{className:'canvas-shell'}),el=surface?element:node('canvas','',{id:'map-'+id,tabIndex:0}),empty=surface?$('empty'):node('div','',{className:'empty'});
  if(!surface){el.setAttribute('aria-label','Карта слоя '+id);layerShell.append(el,empty);}
  root.append(layerShell);const map=surface?primary:new MapCanvas(el,handlers),card={id,root,title,badge,settings,settingsBody,map,channel,empty,config:[]};
  channel.setAttribute('aria-label','Подслой · '+id);channel.dataset.layerChannel=id;settingsBody.append(field('Подслой отображения',channel));
  channel.onchange=()=>{map.channel=channel.value;map.cache=null;if(active===map){$('channel').value=map.channel;$('channel').dispatchEvent(new Event('change',{bubbles:true}));}map.draw();onChange(false);};
  if(id.startsWith('cave-')&&recipe?.mode==='caves'){
   for(const[key,label,min,max,step]of [['depth','Глубина ниже поверхности, условные единицы',8,768,1],['style','Форма полостей'],['openness','Открытость',.2,.75,.01],['connectivity','Связность',0,1,.01],['aquifers','Водоносность',0,1,.01],['tunnelRadius','Радиус тоннелей',1,4,.1],['branching','Ответвления',0,1,.01],['smoothing','Сглаживание',0,5,1]]){
    const control=key==='style'?select(styles,'mixed'):input('', 'number',min,max,step);control.dataset.layerSetting=key;control.dataset.layerConfig=id;control.required=true;card.config.push([key,control]);
    control.onchange=()=>{if(!control.checkValidity())return;writeSetting(card,key,key==='style'?control.value:Number(control.value));};settingsBody.append(field(label,control));
   }
  }
  const activateBeforePointer=()=>{if(active!==map)activate(id);};el.addEventListener('pointerdown',activateBeforePointer,{capture:true});el.addEventListener('focus',activateBeforePointer);
  root.addEventListener('toggle',()=>{if(root.open&&map.layer)requestAnimationFrame(()=>map.fit());});cards.set(id,card);host.append(root);return card;
 }
 make('surface');cards.get('surface').root.classList.add('active-layer');
 function mountLayerCreation(){
  if(recipe.mode!=='caves'){add?.remove();add=null;return;}
  if(add)return;add=node('button','Добавить подземный слой',{id:'landscape-add-layer',type:'button'});host.after(add);
  add.onclick=()=>{const control=document.querySelector('[data-path="layers.underground"]');if(!control||control.disabled||Number(control.value)>=6)return;syncSettings();const index=Number(control.value)+1,step=recipe.generation.layers.depthStep??24,previous=index===1?0:recipe.generation.layerSettings?.['cave-'+(index-1)]?.depth??(index-1)*step;recipe.generation.layerSettings??={};recipe.generation.layerSettings['cave-'+index]??={depth:Math.max(index*step,previous+step)};control.value=index;control.dispatchEvent(new Event('change',{bubbles:true}));const id='cave-'+control.value;configure(recipe);cards.get(id).settings.open=true;};
 }
 function configure(next){
  const replaced=recipe!==next;recipe=next;const layers=recipe.generation.layers,canCreateLayers=recipe.mode==='caves',ids=canCreateLayers?['surface',...Array.from({length:layers.above??0},(_,i)=>'high-'+(i+1)),...Array.from({length:layers.underground??0},(_,i)=>'cave-'+(i+1))]:['surface'],visible=new Set([...ids,...state.layers.map(l=>l.id)]);mountLayerCreation();
  if(canCreateLayers)for(const id of Object.keys(recipe.generation.layerSettings??{}))if(!ids.includes(id))delete recipe.generation.layerSettings[id];
  for(const[id,card]of cards)if(!visible.has(id)){card.map.destroy();card.root.remove();cards.delete(id);}
  for(const id of visible){const card=cards.get(id)??make(id),index=Number(id.slice(5)),settings=recipe.generation.layerSettings?.[id]??{},depth=settings.depth??index*(layers.depthStep??24);card.title.textContent=id==='surface'?'Поверхность':id.startsWith('cave-')?'Подземный слой '+index:'Надземный слой '+id.slice(5);card.badge.textContent=canCreateLayers&&!ids.includes(id)?'Удалится при пересоздании':id==='surface'?'z 0':id.startsWith('cave-')?'z −'+depth:'z +'+id.slice(5);
   for(const[key,control]of card.config){control.disabled=!ids.includes(id);const value=key==='depth'?depth:settings.caves?.[key]??recipe.generation.caves?.[key]??ATLAS_DEFAULTS.caves[key];if(replaced||control.dataset.applied===undefined||control.value===control.dataset.applied||control.value===String(value)){control.value=value;control.dataset.applied=String(value);}}
  }
  // Surface first, then positive slices, then increasing depth. Keep generated slices until regeneration.
  for(const id of visible)host.append(cards.get(id).root);
  if(add)add.disabled=(layers.underground??0)>=6||!!state.worker;return cards;
 }
 function mountSurfaceSettings(){const body=cards.get('surface').settingsBody;for(const old of body.querySelectorAll(':scope>details'))old.remove();for(const group of document.querySelectorAll('#generation-controls>details'))if(['Рельеф и климат','Вода и водосбор','Биомы и переходные полосы','Рельеф'].includes(group.querySelector('summary')?.textContent))body.append(group);}
 function update(layers,catalog,{fit=false}={}){
  for(const card of cards.values()){const layer=layers.find(l=>l.id===card.id);card.empty.classList.toggle('hidden',!!layer);const changed=card.map.layer?.id!==layer?.id;card.map.disabled=!!state.worker||!layer;if(layer){card.map.set(layer,catalog,false);if((fit||changed)&&card.root.open)card.map.fit();}else{card.map.layer=null;card.map.cache=null;card.map.draw();}}
  activate(state.layerId,{notify:false});drawAll();
 }
 function syncSettings({validate=false}={}){const changes=[...cards.values()].flatMap(card=>card.config.map(([key,control])=>({card,control,value:control.value}))).filter(({control,value})=>!control.disabled&&value!==control.dataset.applied);for(const{card,control,value}of changes){control.value=value;if(!control.checkValidity()){if(validate)throw Error('Проверьте настройки слоя '+card.id);continue;}control.dispatchEvent(new Event('change',{bubbles:true}));}}
 function snapshot(){return Object.fromEntries([...cards].map(([id,c])=>[id,{open:c.root.open,settingsOpen:c.root.querySelector('.physical-layer-settings').open,channel:c.map.channel,grid:c.map.grid,fields:Object.fromEntries(c.config.map(([key,control])=>[key,control.value]))}]));}
 function restore(saved){for(const[id,v]of Object.entries(saved??{})){const c=cards.get(id);if(!c)continue;c.root.open=v.open!==false;c.root.querySelector('.physical-layer-settings').open=!!v.settingsOpen;if(Object.hasOwn(channels,v.channel)){c.map.channel=v.channel;c.channel.value=v.channel;c.map.cache=null;}for(const[key,control]of c.config)if(typeof v.fields?.[key]==='string')control.value=v.fields[key];c.map.grid=v.grid??true;}if(active.layer)$('channel').value=active.channel;drawAll();}
 function setBusy(value){for(const c of cards.values()){c.map.disabled=value||!c.map.layer;c.settingsBody.inert=value;}if(add)add.disabled=value||(recipe?.generation.layers.underground??0)>=6;}
 function destroy(){disposed=true;for(const c of cards.values())c.map.destroy();}
 return{canvas:facade,configure,update,activate,mountSurfaceSettings,syncSettings,snapshot,restore,setBusy,drawAll};
}
