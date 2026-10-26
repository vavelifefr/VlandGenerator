import {roomContains} from '../core/space.mjs';
const key=p=>`${p.x}:${p.y}`,near=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const capabilitiesOkay=a=>Array.isArray(a)&&a.length<=64&&a.every(s=>typeof s==='string'&&/^[a-z][a-z0-9-]{0,31}$/.test(s));
export const setpiecesOf=value=>value.content?.setpieces??value.setpieces;
export function createContentState(value,{capabilities=[]}={}) {
  if(!capabilitiesOkay(capabilities))throw new Error('Способности: до 64 символьных имён длиной до 32.');
  return {version:1,flags:{},capabilities:[...new Set(capabilities)],usedSlotIds:[],destroyedSlotIds:[],challenges:Object.fromEntries((setpiecesOf(value)?.challenges??[]).map(c=>[c.id,{state:'idle',elapsed:0,attempts:0,paid:false}]))};
}
export function zoneCleared(zone,state) {
  return !!state?.flags?.[zone.requiredFlag]||(state?.capabilities??[]).includes(zone.bypassCapability);
}
export function contentBlockedCells(value,state) {
  return (setpiecesOf(value)?.zones??[]).filter(z=>z.blocksMovement&&!zoneCleared(z,state)).flatMap(z=>z.cells);
}

// Explicit clocks, no Date.now(), RNG or game callbacks. Returned events are data
// for an adapter; importing JSON never executes an effect or a script.
export function contentAction(value,input,action) {
  const data=setpiecesOf(value),events=[];let state;
  const reject=message=>({ok:false,state:input,events:[],message});
  if(!data)return reject('В карте нет сценарного слоя.');
  function finish(c,record,success){
    record.state=success?'success':'failed';
    const reward=success&&!record.paid;if(success)record.paid=true;
    events.push({type:success?'challenge-success':'challenge-failed',id:c.id,roomId:c.roomId,position:c.entry,outcome:success?(reward?c.onSuccess:'already-rewarded'):c.onFailure,reward});
  }
  try {
    if(!input||input.version!==1||!input.flags||typeof input.flags!=='object'||Array.isArray(input.flags)||Object.keys(input.flags).length>120||!Object.entries(input.flags).every(([id,v])=>typeof v==='boolean'&&data.zones.some(z=>z.requiredFlag===id))||!capabilitiesOkay(input.capabilities)||!['usedSlotIds','destroyedSlotIds'].every(k=>Array.isArray(input[k])&&input[k].length<=data.slots.length&&new Set(input[k]).size===input[k].length&&input[k].every(id=>data.slots.some(s=>s.id===id&&(k!=='destroyedSlotIds'||s.destructible))))||!input.challenges||Object.keys(input.challenges).length!==data.challenges.length||!data.challenges.every(c=>{const r=input.challenges[c.id];return r&&['idle','active','success','failed'].includes(r.state)&&Number.isFinite(r.elapsed)&&r.elapsed>=0&&r.elapsed<=c.budget&&Number.isSafeInteger(r.attempts)&&r.attempts>=0&&typeof r.paid==='boolean';}))return reject('Состояние окружения не соответствует карте.');
    state=structuredClone(input);
    if(!action||typeof action.type!=='string')return reject('Неизвестное действие сценария.');
    if(action.type==='interact'||action.type==='destroy'){
      const slot=data.slots.find(s=>s.id===action.id);
      if(!slot||!Number.isInteger(action.position?.x)||!Number.isInteger(action.position?.y)||near(slot.anchor,action.position)>1)return reject('Подойдите к выбранному объекту.');
      if(state.destroyedSlotIds.includes(slot.id))return reject('Объект уже разрушен.');
      if(action.type==='destroy'){
        if(!slot.destructible)return reject('Этот объект нельзя разрушить.');
        state.destroyedSlotIds.push(slot.id);events.push({type:'slot-destroyed',id:slot.id,typeId:slot.typeId,roomId:slot.roomId,position:slot.anchor,material:slot.material,outcome:slot.material==='glass'?'spill':'salvage'});
      }else{
        if(state.usedSlotIds.includes(slot.id))return reject('Устройство уже использовано.');
        state.usedSlotIds.push(slot.id);
        if(slot.controlsZoneId){const zone=data.zones.find(z=>z.id===slot.controlsZoneId);if(!zone)return reject('Условная зона не найдена.');state.flags[zone.requiredFlag]=true;if(slot.grantCapability&&!state.capabilities.includes(slot.grantCapability))state.capabilities.push(slot.grantCapability);events.push({type:'zone-cleared',id:zone.id,roomId:zone.roomId,capability:slot.grantCapability});}
        events.push({type:'slot-used',id:slot.id,typeId:slot.typeId,roomId:slot.roomId,outcome:slot.interaction});
      }
    }else if(!['move','tick','retry'].includes(action.type))return reject('Неизвестное действие сценария.');
    if(action.type==='retry'){
      const c=data.challenges.find(c=>c.id===action.id),record=state.challenges[action.id];
      if(!c||!record||!action.position||near(c.entry,action.position)>1)return reject('Вернитесь к началу испытания.');
      record.state='idle';record.elapsed=0;record.warning=false;
    }
    if(action.type==='tick'&&(!['actions','seconds'].includes(action.clock)||!Number.isFinite(action.amount)||action.amount<0||action.amount>3600||action.clock==='actions'&&!Number.isInteger(action.amount)))return reject('Неверный шаг часов испытания.');
    for(const c of data.challenges){
      const record=state.challenges[c.id];if(!record)return reject('Состояние испытаний не соответствует карте.');
      let justStarted=false;
      if(action.type==='move'){
        if(!Number.isInteger(action.position?.x)||!Number.isInteger(action.position?.y))return reject('Неверная позиция шага.');
        if(key(action.position)===key(c.entry)&&record.state!=='active'&&(record.state==='idle'||record.state==='failed'&&c.retry)){
          Object.assign(record,{state:'active',elapsed:0,warning:false,attempts:record.attempts+1});justStarted=true;
          events.push({type:'challenge-start',id:c.id,roomId:c.roomId,budget:c.budget,clock:c.clock});
        }
        if(record.state==='active'&&!roomContains((value.level??value).rooms.find(r=>r.id===c.roomId),action.position,{interior:true})){finish(c,record,false);continue;}
      }
      if(record.state!=='active'||justStarted)continue;
      const elapsed=action.type==='move'&&c.clock==='actions'?1:action.type==='tick'&&action.clock===c.clock?action.amount:0;
      record.elapsed=Math.min(c.budget,record.elapsed+elapsed);
      const remaining=c.budget-record.elapsed;
      if(action.type==='move'&&key(action.position)===key(c.goal)){finish(c,record,true);continue;}
      if(remaining<=c.errorAllowance&&!record.warning){record.warning=true;events.push({type:'challenge-warning',id:c.id,remaining,clock:c.clock});}
      if(remaining<=0)finish(c,record,false);
    }
    const last=events.at(-1);
    return {ok:true,state,events,message:last?.type==='zone-cleared'?'Проход открыт.':events.some(e=>e.type==='zone-cleared')?'Условие выполнено: комната доступна.':last?.type==='challenge-failed'?'Время вышло. Выход открыт; испытание можно повторить.':last?.type==='challenge-success'?'Испытание пройдено.':events.some(e=>e.type==='challenge-start')?'Испытание началось.':action.type==='destroy'?'Объект разрушен.':'Действие окружения выполнено.'};
  }catch(error){return reject(error.message);}
}
