import {$,node,option} from './dom.mjs';
import {TRANSPORT_NAMES,transportPoint,resolveTransitions,nativeTransitions} from '../../../app/transitions.mjs';
import {createSource} from '../../../content/sources.mjs';

export function transitionEditor({state,canvas,work,commit,guard,status,goTo,restoreTool}){
 let selection=null,pending=null,report=null,reportChecksum=null,renderedSelection=null;
 const points=()=>state.project?state.project.sources.map(s=>transportPoint(s,state.project.catalog)).filter(p=>p&&p.x!==undefined):[];
 const links=()=>state.project?[...nativeTransitions(state.project,state.layers),...resolveTransitions(state.project)]:[];
 const chosen=()=>selection?.sourceId?points().find(p=>p.sourceId===selection.sourceId):selection?.baseId?links().find(t=>t.id===selection.baseId)?.[selection.side]:null;
 const binding=()=>selection?.sourceId?links().find(t=>t.origin==='editor'&&[t.fromSourceId,t.toSourceId].includes(selection.sourceId)):selection?.baseId?links().find(t=>t.id===selection.baseId):null;
 const parameters=()=>{const cost=$('transition-cost');if(!cost.checkValidity())throw new Error('Стоимость перехода: число от 0 до 100000.');return{bidirectional:$('transition-direction').value==='both',travelCost:Number(cost.value)};};
 const feedback=(text,error=false)=>{$('transition-feedback').textContent=text;$('transition-feedback').className=error?'notice error':'help-text';};
 function cancel(){pending=null;restoreTool();render();}
 function select(value){selection=value;state.sourceId=value?.sourceId??null;if(value?.sourceId)state.kind='spawner';pending=null;$('transition-panel').open=true;render();}
 function render(){
  if(!state.project){$('transition-panel').classList.add('hidden');return;}$('transition-panel').classList.remove('hidden');
  if(pending&&pending.checksum!==state.project.checksum){pending=null;feedback('Проект изменился. Выберите точку и начните связывание заново.');}
  const all=links(),list=points(),active=list.filter(p=>p.layerId===state.layerId),selected=state.sourceId&&list.find(p=>p.sourceId===state.sourceId);if(selected&&!pending)selection={sourceId:selected.sourceId};if(selection&&!chosen())selection=null;
  const current=chosen(),t=binding(),token=JSON.stringify(selection)+':'+(t?.id??'')+':'+(t?.bidirectional??'')+':'+(t?.travelCost??'');
  $('transition-count').textContent=all.length;$('transition-point').replaceChildren(option('','Выберите точку на карте'),...active.map(p=>option(p.sourceId,TRANSPORT_NAMES[p.kind]+' · '+p.name+' ('+p.x+', '+p.y+')'+(p.fixed?'':' · не зафиксирована'))));$('transition-point').value=selection?.sourceId??'';
  const generated=all.filter(t=>t.automatic),levels=state.project.source.level?[state.project.source.level]:(state.project.source.layers??[]).map(l=>l.dungeon?.level).filter(Boolean),rooms=levels.reduce((n,l)=>n+(l.isolation?.isolatedRoomIds.length??0),0);$('automatic-transports-report').textContent=state.project.source.access?'Природные области: доступны с возвратом '+state.project.source.access.accessibleRegions+' / '+state.project.source.access.significantRegions+'. Переходов: '+generated.length+'. Минимальная площадь и виды задаются в настройках карты.':generated.length?'Автоматический доступ: '+Object.entries(TRANSPORT_NAMES).map(([kind,name])=>name+' — '+generated.filter(t=>t.kind===kind).length).join(', ')+'. Изолированных комнат — '+rooms+'.':levels.some(l=>l.isolation?.enabled)?'Автоматический доступ не создан: '+[...new Set(levels.map(l=>l.isolation?.reason).filter(Boolean))].join(' '):'Автоматических переходов нет. Изоляция и её параметры задаются в настройках карты для Данжа и ярусов.';
  $('transition-selected').textContent=current?(selection.sourceId?(TRANSPORT_NAMES[current.kind]+' · '+current.name):'Переход основы')+' · '+current.layerId+' · ('+current.x+', '+current.y+')':'Точка не выбрана. Создайте её карандашом или выберите существующую.';
  $('transition-link').disabled=!current?.fixed||!!pending;$('transition-unlink').disabled=!t||t.origin!=='editor'||!!pending;$('transition-jump').disabled=!t||!!pending;$('transition-update').disabled=!t||t.origin!=='editor'||!!pending;
  $('transition-link').textContent=t?'Пересвязать кликом':'Связать кликом';$('transition-help').textContent=selection?.baseId?'Связь основы защищена. Её точки и направление показаны в списке.':current&&!current.fixed?current.reason:'Клик по второй точке свяжет их. На пустой клетке можно создать парный однократный спавнер.';
  if(token!==renderedSelection){$('transition-direction').value=(t?.bidirectional??current?.definition?.properties.transport.bidirectional)!==false?'both':'forward';$('transition-cost').value=t?.travelCost??current?.definition?.properties.transport.travelCost??1;renderedSelection=token;}
  $('transition-direction').disabled=!!pending||!!selection?.baseId;$('transition-cost').disabled=!!pending||!!selection?.baseId;
  $('link-prompt').classList.toggle('hidden',!pending);$('link-prompt-text').textContent=pending?.mode==='place'?'Выберите клетку для новой точки: '+TRANSPORT_NAMES[pending.kind]:pending?'Выберите вторую точку или пустую клетку. Первая: '+pending.name:'';
  const target=$('link-target-layer'),layerId=state.layerId;target.replaceChildren(...state.layers.map(l=>option(l.id,l.id+' · z '+l.z)));target.value=layerId;
  const box=$('transition-list');box.replaceChildren();all.forEach((link,i)=>{
   const row=node('div','',{className:'transition-row'}),name=node('span',(link.origin==='base'?(link.automatic?'Авто · ':'Основа · '):'')+(TRANSPORT_NAMES[link.kind]??'Переход')+' Т'+(i+1)+' · '+link.from.layerId+' '+(link.bidirectional?'↔':'→')+' '+link.to.layerId),result=reportChecksum===state.project.checksum?report?.transitions?.reports.find(r=>r.id===link.id):null;
   if(result&&!result.ok){row.classList.add('invalid');name.append(node('small',result.errors.join(' ')));}else name.append(node('small',link.origin==='base'?'Переход генератора':result?'Доступность и возврат проверены':'Выберите «Проверить переходы»'));
   const buttons=node('div','',{className:'row'});for(const side of ['from','to']){const b=node('button',side==='from'?'Вход':'Выход');b.onclick=guard(async()=>{selection=link.origin==='editor'?{sourceId:link[side].sourceId}:{baseId:link.id,side};pending=null;await goTo(link[side]);$('transition-panel').open=true;render();});buttons.append(b);}row.append(name,buttons);box.append(row);
  });if(!all.length)box.append(node('p','Связей пока нет.',{className:'help-text'}));
  if(pending)canvas.tool='select';canvas.transportLinks=all;canvas.transportPoints=list;canvas.linkSelection=t?.id??null;canvas.linkPending=pending;canvas.transitionErrors=new Set(reportChecksum===state.project.checksum?report?.transitions?.reports.filter(r=>!r.ok).map(r=>r.id):[]);canvas.draw();
 }
 async function validate(){report=await work('validate',{project:state.project});reportChecksum=state.project.checksum;render();feedback(report.ok?'Все переходы доступны; проверены подход, прибытие и возврат.':[...report.errors].join(' '),!report.ok);return report;}
 async function finish(operation){try{const p=await work('edit',{project:state.project,operation});if(pending?.mode==='link'){const t=p.transitions.find(t=>t.fromSourceId===operation.fromSourceId);selection={sourceId:t.toSourceId};state.sourceId=t.toSourceId;}pending=null;await commit(p);await validate();status('Переход связан и проверен. Изменение можно отменить.');}catch(e){feedback(e.message+(e.details?.length?' '+e.details.join(' '):''),true);throw new Error(e.message+(e.details?.length?' '+e.details.join(' '):''));}}
 async function click(p){
  if(pending){if(state.project.checksum!==pending.checksum){cancel();throw new Error('Проект изменился. Начните связывание заново.');}
   if(pending.mode==='place'){
    const layer=state.layers.find(l=>l.id===state.layerId),catalogId={teleport:'portal',lift:'lift',stairs:'stairs'}[pending.kind];let n=1;while(state.project.sources.some(s=>s.id===catalogId+'-'+n))n++;const source=createSource({id:catalogId+'-'+n,name:TRANSPORT_NAMES[pending.kind]+' '+n,kind:'spawner',category:'objects',layer,catalogId,seed:state.project.recipe.seed,...p});source.limits={maxAlive:1,batchSize:1,total:1,populationId:null};
    const result=await work('edit',{project:state.project,operation:{type:'source.put',source}}),checked=await work('validate',{project:result});if(!checked.ok){feedback(checked.errors.join(' '),true);throw new Error(checked.errors.join(' '));}pending=null;selection={sourceId:source.id};state.sourceId=source.id;await commit(result);feedback('Точка создана. Нажмите «Связать кликом» и выберите назначение.');status('Создана точка перехода — однократный спавнер.');return true;
   }
   const to=points().filter(s=>s.layerId===state.layerId&&s.x===p.x&&s.y===p.y);if(to.length>1)throw new Error('В клетке несколько точек. Разнесите их или выберите точку в списке.');if(!to.length&&!$('link-create-pair').checked)throw new Error('Выберите существующую точку или включите создание парной точки.');
   await finish({type:'transport.connect',fromSourceId:pending.sourceId,...(to.length?{toSourceId:to[0].sourceId}:{target:{layerId:state.layerId,...p}}),...pending.parameters});return true;
  }
  const found=points().find(s=>s.layerId===state.layerId&&s.x===p.x&&s.y===p.y);if(found){select({sourceId:found.sourceId});return true;}
  for(const t of links().filter(t=>t.origin==='base'))for(const side of ['from','to'])if(t[side].layerId===state.layerId&&t[side].x===p.x&&t[side].y===p.y){select({baseId:t.id,side});return true;}
  return false;
 }
 $('transition-point').onchange=()=>{select($('transition-point').value?{sourceId:$('transition-point').value}:null);};
 $('transition-place').onclick=guard(()=>{pending={mode:'place',kind:$('transition-kind').value,checksum:state.project.checksum};render();canvas.canvas.scrollIntoView({block:'center'});status('Выберите свободную клетку на карте для точки перехода.');});
 $('transition-link').onclick=guard(()=>{const p=chosen();if(!p?.fixed)throw new Error(p?.reason??'Выберите точку перехода.');pending={mode:'link',sourceId:p.sourceId,name:p.name,kind:p.kind,parameters:parameters(),checksum:state.project.checksum};render();canvas.canvas.scrollIntoView({block:'center'});status('Выберите вторую точку на карте. Ярус можно переключить в полосе над картой.');});
 $('link-cancel').onclick=()=>{cancel();feedback('Связывание отменено. Проект не менялся.');};
 $('link-target-layer').onchange=guard(()=>goTo({layerId:$('link-target-layer').value}));
 $('transition-jump').onclick=guard(async()=>{const t=binding();if(!t)return;const side=selection.sourceId?(t.from.sourceId===selection.sourceId?'to':'from'):selection.side==='from'?'to':'from';selection=t.origin==='editor'?{sourceId:t[side].sourceId}:{baseId:t.id,side};await goTo(t[side]);render();});
 $('transition-unlink').onclick=guard(async()=>{const t=binding();if(t?.origin!=='editor')return;await commit(await work('edit',{project:state.project,operation:{type:'transport.disconnect',linkId:t.id}}));feedback('Связь удалена. Обе точки оставлены на карте.');});
 $('transition-update').onclick=guard(async()=>{const t=binding();if(t?.origin!=='editor')return;await finish({type:'transport.connect',fromSourceId:t.fromSourceId,toSourceId:t.toSourceId,...parameters()});});
 $('transition-validate').onclick=guard(validate);
 return{render,click,cancel,validate,setReport(value){report=value;reportChecksum=state.project?.checksum;render();},get active(){return !!pending;}};
}
