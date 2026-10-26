import {LabError} from './config.mjs';
import {fingerprint} from './identity.mjs';
import {validateAtlas} from './atlas.mjs';
const seal=s=>({...s,fingerprint:fingerprint({...s,fingerprint:undefined})});
export function createAtlasRuntime(atlas){
  const report=validateAtlas(atlas);if(!report.ok)throw new LabError('INVALID_ATLAS',report.errors.join(' '));
  return seal({schema:'vland.atlas.runtime',schemaVersion:1,sourceFingerprint:atlas.fingerprint,time:0,spawners:Object.fromEntries(atlas.layers.flatMap(l=>l.sites.filter(s=>s.kind==='spawner').map(s=>[s.id,{layerId:l.id,active:false,wave:0,emitted:0,nextAt:0}]))),events:{},harvested:{}});
}
function check(atlas,state){
  const reject=()=>{throw new LabError('INVALID_ATLAS_STATE','Состояние не соответствует atlas или изменено.');};
  if(state?.schema!=='vland.atlas.runtime'||state.schemaVersion!==1||state.sourceFingerprint!==atlas.fingerprint||state.fingerprint!==fingerprint({...state,fingerprint:undefined})||!Number.isFinite(state.time)||state.time<0||![state.spawners,state.events,state.harvested].every(o=>o&&typeof o==='object'&&!Array.isArray(o)))reject();
  const sources=atlas.layers.flatMap(l=>l.sites.filter(s=>s.kind==='spawner').map(s=>({s,layerId:l.id})));
  if(Object.keys(state.spawners).length!==sources.length)reject();
  for(const{s,layerId}of sources){const v=state.spawners[s.id];if(!v||v.layerId!==layerId||typeof v.active!=='boolean'||!Number.isInteger(v.wave)||v.wave<0||v.wave>s.program.waves.length||!Number.isFinite(v.nextAt)||v.nextAt<0||v.emitted!==s.program.waves.slice(0,v.wave).reduce((sum,w)=>sum+w.members.reduce((a,m)=>a+m.count,0),0))reject();}
  for(const[id,choice]of Object.entries(state.events)){const event=atlas.layers.flatMap(l=>l.sites).find(s=>s.kind==='event'&&s.id===id);if(!event?.choices.some(c=>c.id===choice))reject();}
  for(const[id,amount]of Object.entries(state.harvested)){const split=id.lastIndexOf(':'),layer=atlas.layers.find(l=>l.id===id.slice(0,split)),index=Number(id.slice(split+1));if(!layer||!Number.isInteger(index)||index<0||index>=layer.fields.resourceAmount.length||!Number.isInteger(amount)||amount<1||amount>layer.fields.resourceAmount[index])reject();}
}
export function tickAtlas(atlas,state,{elapsed=1,actors=[],aliveBySpawner={}}={}){
  check(atlas,state);if(!Number.isFinite(elapsed)||elapsed<=0||elapsed>60||!Array.isArray(actors)||actors.length>1000||actors.some(a=>!atlas.layers.some(l=>l.id===a.layerId)||!Number.isFinite(a.x)||!Number.isFinite(a.y)))throw new LabError('INVALID_ATLAS_ACTION','elapsed0–60 и позиции акторов обязательны.');
  const next=structuredClone(state),orders=[];next.time+=elapsed;
  for(const l of atlas.layers)for(const site of l.sites.filter(s=>s.kind==='spawner')){
    const runtime=next.spawners[site.id],alive=aliveBySpawner[site.id]??0;if(!runtime||!Number.isInteger(alive)||alive<0||alive>10000)throw new LabError('INVALID_ATLAS_STATE','Неверное число живых мобов.');
    if(!runtime.active&&actors.some(a=>a.layerId===l.id&&Math.hypot(a.x-site.position.x,a.y-site.position.y)<=site.radius)){runtime.active=true;runtime.nextAt=next.time;}
    if(!runtime.active||runtime.nextAt>next.time||runtime.wave>=site.program.waves.length||alive>=site.aliveLimit)continue;
    const wave=site.program.waves[runtime.wave],members=wave.members.flatMap(m=>Array(m.count).fill(m.mobId));if(alive+members.length>site.aliveLimit)continue;
    orders.push({type:'spawn-wave',spawnerId:site.id,layerId:l.id,position:{...site.position},wave:runtime.wave,members});runtime.wave++;runtime.emitted+=members.length;runtime.nextAt=next.time+site.period;
  }
  return{state:seal(next),orders,note:'Не более одной волны спавнера за вызов. Адаптер сообщает число живых и выбирает свободные клетки рядом с источником.'};
}
export function actOnAtlas(atlas,state,action){
  check(atlas,state);const next=structuredClone(state),orders=[];
  if(action?.type==='choose-event'){
    const layer=atlas.layers.find(l=>l.id===action.layerId),site=layer?.sites.find(s=>s.id===action.id&&s.kind==='event'),choice=site?.choices.find(c=>c.id===action.choice);
    if(!choice)throw new LabError('INVALID_ATLAS_ACTION','Неизвестное событие или выбор.');if(next.events[site.id])return{state,orders,replayed:true};next.events[site.id]=choice.id;orders.push(...choice.outcomes.map(o=>({...o,sourceId:site.id,layerId:layer.id,position:{...site.position}})));
  }else if(action?.type==='harvest'){
    const layer=atlas.layers.find(l=>l.id===action.layerId),p=action.position;if(!layer||!Number.isInteger(p?.x)||!Number.isInteger(p?.y)||p.x<0||p.y<0||p.x>=layer.board.width||p.y>=layer.board.height||!Number.isInteger(action.amount)||action.amount<1||action.amount>10000)throw new LabError('INVALID_ATLAS_ACTION','Неверная добыча.');
    const i=p.y*layer.board.width+p.x,id=layer.id+':'+i,available=layer.fields.resourceAmount[i]-(next.harvested[id]??0),amount=Math.min(available,action.amount);if(amount<=0)throw new LabError('RESOURCE_DEPLETED','Здесь больше нет ресурса.');next.harvested[id]=(next.harvested[id]??0)+amount;orders.push({type:'resource',resource:layer.fields.resource[i],amount,layerId:layer.id,position:{...p}});
  }else throw new LabError('INVALID_ATLAS_ACTION','Поддерживаются harvest и choose-event.');
  return{state:seal(next),orders,replayed:false,note:'Близость, инструменты, урон и выдачу предметов проверяет адаптер игры. Blueprint остаётся неизменным.'};
}
