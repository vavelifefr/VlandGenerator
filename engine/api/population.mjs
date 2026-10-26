import {seededRandom} from '../core/random.mjs';
import {spawnerProgram} from './spawner-program.mjs';
const key=p=>`${p.x}:${p.y}`;
export const POPULATION_TYPES=Object.freeze({ordinary:{name:'Обычные',color:'#e7827b',symbol:'О'},rare:{name:'Редкие',color:'#bb92ed',symbol:'Р'},neutral:{name:'Нейтральные',color:'#78ceba',symbol:'Н'},boss:{name:'Боссы',color:'#ed4e84',symbol:'Б'},spawner:{name:'Спавнеры',color:'#e5ad52',symbol:'С'}});
export const POPULATION_FAMILIES=Object.freeze({any:'По теме комнаты',human:'Люди',monster:'Монстры',mechanical:'Механические',neutral:'Нейтральные'});
export const POPULATION_DEFAULTS=Object.freeze({enabled:false,rules:Object.freeze({ordinary:Object.freeze({scope:'room',min:2,max:4,family:'any'}),rare:Object.freeze({scope:'floor',min:1,max:2,family:'any'}),neutral:Object.freeze({scope:'floor',min:2,max:2,family:'neutral'}),boss:Object.freeze({scope:'floor',min:1,max:1,family:'any'}),spawner:Object.freeze({scope:'floor',min:0,max:0,family:'monster',period:3,batch:1,aliveLimit:3,totalLimit:6})})});
export function populationSettings(input=POPULATION_DEFAULTS,{requireBoss=false}={}){
 const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
 if(!object(input)||Object.keys(input).some(k=>!['enabled','rules'].includes(k))||input.enabled!==undefined&&typeof input.enabled!=='boolean'||input.rules!==undefined&&!object(input.rules))throw new Error('Заселение: требуется объект enabled/rules.');
 const result={enabled:input.enabled??false,rules:{}};
 if(Object.keys(input.rules??{}).some(id=>!Object.hasOwn(POPULATION_TYPES,id)))throw new Error('Неизвестная группа заселения.');
 for(const id of Object.keys(POPULATION_TYPES)){
  const supplied=input.rules?.[id]??{},allowed=['scope','min','max','family',...(id==='spawner'?['period','batch','aliveLimit','totalLimit','activation','waves','repeat']:[])];if(!object(supplied)||Object.keys(supplied).some(k=>!allowed.includes(k)))throw new Error('Неизвестное поле правила '+id);
  const r={...POPULATION_DEFAULTS.rules[id],...supplied},cap=r.scope==='room'?(id==='boss'?4:24):id==='boss'?4:240;
  if(!['room','floor'].includes(r.scope)||!Number.isInteger(r.min)||!Number.isInteger(r.max)||r.min<0||r.max<r.min||r.max>cap)throw new Error(`${POPULATION_TYPES[id].name}: целое количество 0–${cap}, минимум ≤ максимум.`);
  if(!Object.hasOwn(POPULATION_FAMILIES,r.family)||id==='neutral'&&r.family!=='neutral'||id!=='neutral'&&r.family==='neutral'||id==='boss'&&r.family!=='any')throw new Error('Недопустимое семейство группы '+id);
  if(requireBoss&&result.enabled&&id==='boss'&&(r.min<1||r.scope!=='floor'))throw new Error('В адаптере нужен минимум один босс на этаж; боссы размещаются в большой арене.');
  if(id==='spawner'&&(!Number.isInteger(r.period)||r.period<2||r.period>60||!Number.isInteger(r.batch)||r.batch<1||r.batch>8||!Number.isInteger(r.aliveLimit)||r.aliveLimit<r.batch||r.aliveLimit>24||!Number.isInteger(r.totalLimit)||r.totalLimit<0||r.totalLimit>240||r.totalLimit>0&&r.totalLimit<r.batch))throw new Error('Спавнер: интервал2–60, волна1–8, живых до24 (не меньше волны), общий лимит0–240; 0 — бесконечно.');
  if(id==='spawner'){
   const program=spawnerProgram(r),size=Math.max(r.batch,...program.waves.map(w=>w.members.reduce((n,m)=>n+m.count,0)));
   if(r.aliveLimit<size)throw new Error('Лимит живых мобов должен вмещать самую большую волну.');
   if(['activation','waves','repeat'].some(k=>Object.hasOwn(supplied,k)))Object.assign(r,program);
  }
  result.rules[id]=r;
 }
 return result;
}
export function populationKind(actor){return actor.populationKind??(actor.spawner?'spawner':actor.type==='boss'?'boss':actor.type==='neutral'||actor.ambient?'neutral':actor.elite?'rare':'ordinary');}
export function populationErrors(level,data,hints){
 try{
  if(!data||data.version!==1||data.enabled!==true||!Array.isArray(data.placements)||data.placements.length>12000)throw new Error('Неверный план заселения.');
  populationSettings({enabled:true,rules:data.rules});
  const floor=new Map(level.rooms.map(r=>[r.id,new Set(r.floorTiles.map(key))])),walls=new Set(level.board.walls.map(key)),reserved=new Set(level.protectedTiles??[]),seen=new Set(),areas=new Set();
  for(const p of data.placements){if(!Object.hasOwn(POPULATION_TYPES,p.populationKind)||!Number.isInteger(p.x)||!Number.isInteger(p.y)||!floor.get(p.roomId)?.has(key(p))||walls.has(key(p))||reserved.has(key(p))||seen.has(key(p))||!hints.some(h=>h.id===p.id&&h.kind===(p.populationKind==='spawner'?'spawner':'enemy')&&h.populationKind===p.populationKind&&h.roomId===p.roomId&&h.x===p.x&&h.y===p.y))throw new Error('Место заселения не соответствует полу/точкам/типу.');if(p.populationKind==='spawner'&&JSON.stringify(p.spawnRule)!==JSON.stringify(data.rules.spawner))throw new Error('Неверное правило спавнера.');seen.add(key(p));}
  for(const p of data.placements){const size=p.populationKind==='boss'?3:1;if(!Object.hasOwn(POPULATION_FAMILIES,p.family)||!Array.isArray(p.spawnArea)||p.spawnArea.length!==size*size)throw new Error('Неверная область размещения существа.');const expected=new Set();for(let dy=0;dy<size;dy++)for(let dx=0;dx<size;dx++)expected.add(`${p.x+dx}:${p.y+dy}`);for(const c of p.spawnArea){const k=key(c);if(!Number.isInteger(c.x)||!Number.isInteger(c.y)||!expected.delete(k)||areas.has(k)||!floor.get(p.roomId).has(k)||walls.has(k)||reserved.has(k))throw new Error('Область заселения перекрыта.');areas.add(k);}}
  const controls=new Set();for(const p of data.placements){if(p.populationKind!=='spawner')continue;const lever=spawnerProgram(p.spawnRule).activation.type==='lever';if(lever!==!!p.controller)throw new Error('Спавнеру нужен собственный рычаг активации.');if(!lever)continue;const c=p.controller;if(c.id!==p.id+'-control'||c.roomId!==p.roomId||!Array.isArray(c.approach)||c.approach.length!==1)throw new Error('Неверная связь рычага спавнера.');for(const q of [c,...c.approach]){const k=key(q);if(!Number.isInteger(q.x)||!Number.isInteger(q.y)||!floor.get(p.roomId).has(k)||walls.has(k)||areas.has(k)||controls.has(k)||hints.some(h=>key(h)===k))throw new Error('Рычаг спавнера или подход перекрыт.');controls.add(k);}if(Math.abs(c.x-c.approach[0].x)+Math.abs(c.y-c.approach[0].y)!==1)throw new Error('Нет подхода к рычагу спавнера.');}
  if(hints.filter(h=>['enemy','spawner'].includes(h.kind)).length!==data.placements.length)throw new Error('Число точек заселения не совпадает.');
  for(const id of Object.keys(POPULATION_TYPES)){const s=data.summary?.[id];if(!s||!['requested','placed','protected','shortfall','aboveQuota'].every(k=>Number.isSafeInteger(s[k])&&s[k]>=0&&s[k]<=12000)||s.placed!==data.placements.filter(p=>p.populationKind===id).length||s.protected!==data.placements.filter(p=>p.populationKind===id&&p.protected).length||s.aboveQuota!==Math.max(0,s.placed-s.requested))throw new Error('Неверный итог заселения.');}
  return[];
 }catch(error){return[error.message];}
}

// Counts are quotas for suitable rooms. Essential actors are preserved even if
// they exceed a quota; shortages are explicit, never solved by blocking a route.
export function planPopulation(level,input,{occupied=[],excludedRooms=[],base=[]}={}){
 const config=populationSettings(input);if(!config.enabled)return null;
 const random=seededRandom((level.seed^0x7349b02f)>>>0),walls=new Set(level.board.walls.map(key)),reserved=new Set(level.protectedTiles??[]),used=new Set([...occupied,...base].map(key)),excluded=new Set(excludedRooms);
 for(const m of level.mechanisms??[])for(const[dx,dy]of[[0,0],[0,-1],[1,0],[0,1],[-1,0]])used.add(key({x:m.position.x+dx,y:m.position.y+dy}));
 const placements=base.map(p=>({...p,populationKind:populationKind(p),protected:true})),summary={},roomById=new Map(level.rooms.map(r=>[r.id,r]));let nextId=0;
 const endpoint=r=>['start','final'].includes(r.role)||['start','final','exit'].includes(r.purpose),bossRoom=r=>r.role==='boss'||r.purpose==='boss';
 function fit(room,kind){
  const size=kind==='boss'?3:1,cells=room.floorTiles.filter(p=>!walls.has(key(p))&&!used.has(key(p))&&!reserved.has(key(p))),floor=new Set(room.floorTiles.map(key));
  // Shuffle once, with a stable stream independent of geometry/combat RNG.
  for(let i=cells.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[cells[i],cells[j]]=[cells[j],cells[i]];}
  for(const p of cells){const footprint=[];for(let dy=0;dy<size;dy++)for(let dx=0;dx<size;dx++)footprint.push({x:p.x+dx,y:p.y+dy});
   if(footprint.some(q=>!floor.has(key(q))||walls.has(key(q))||used.has(key(q))||reserved.has(key(q))))continue;
   for(const q of footprint)used.add(key(q));return{...p,spawnArea:footprint};
  }return null;
 }
 // Big actors reserve their spawn area before small actors.
 for(const kind of ['boss','spawner','ordinary','rare','neutral']){
  const rule=config.rules[kind];let eligible=level.rooms.filter(r=>!endpoint(r)&&!excluded.has(r.id)&&(kind==='boss'?bossRoom(r):!bossRoom(r)));
  if(kind==='boss'&&!eligible.length){const largest=level.rooms.filter(r=>!endpoint(r)&&!excluded.has(r.id)).sort((a,b)=>b.floorTiles.length-a.floorTiles.length)[0];eligible=largest?[largest]:[];}
  const chooseCount=()=>rule.min+Math.floor(random()*(rule.max-rule.min+1));
  let requested=0,missing=0;
  const quota=room=>{const desired=chooseCount(),existing=placements.filter(p=>p.populationKind===kind&&(!room||p.roomId===room.id)).length;requested+=desired;return Math.max(0,desired-existing);};
  const place=room=>{const p=fit(room,kind);if(!p)return false;const id=`population-${kind}-${++nextId}`;let controller;
   if(kind==='spawner'&&spawnerProgram(rule).activation.type==='lever'){
    const available=q=>!walls.has(key(q))&&!used.has(key(q))&&!reserved.has(key(q)),cells=room.floorTiles.filter(available).sort((a,b)=>(Math.abs(a.x-p.x)+Math.abs(a.y-p.y))-(Math.abs(b.x-p.x)+Math.abs(b.y-p.y))),floor=new Set(room.floorTiles.map(key));
    for(const c of cells){const approach=[[0,-1],[1,0],[0,1],[-1,0]].map(([dx,dy])=>({x:c.x+dx,y:c.y+dy})).find(q=>floor.has(key(q))&&available(q));if(approach){controller={id:id+'-control',roomId:room.id,x:c.x,y:c.y,approach:[approach]};used.add(key(c));used.add(key(approach));break;}}
    if(!controller){for(const q of p.spawnArea)used.delete(key(q));return false;}
   }
   placements.push({...p,id,roomId:room.id,populationKind:kind,family:rule.family,protected:false,...(kind==='spawner'?{spawnRule:structuredClone(rule),...(controller?{controller}:{})}:{})});return true;};
  if(rule.scope==='room')for(const room of eligible){const count=quota(room);for(let i=0;i<count;i++)if(!place(room)){missing+=count-i;break;}}
  else {const count=quota(null);for(let i=0;i<count;i++){
   const start=Math.floor(random()*Math.max(1,eligible.length));let placed=false;
   for(let j=0;j<eligible.length;j++)if(place(eligible[(start+j)%eligible.length])){placed=true;break;}
   if(!placed){missing+=count-i;break;}
  }}
  const selected=placements.filter(p=>p.populationKind===kind),protectedCount=selected.filter(p=>p.protected).length;
  summary[kind]={requested,placed:selected.length,protected:protectedCount,shortfall:missing,aboveQuota:Math.max(0,selected.length-requested)};
 }
 const warnings=Object.entries(summary).flatMap(([id,s])=>[...(s.shortfall?[`${POPULATION_TYPES[id].name}: не размещено ${s.shortfall}, нет безопасного места.`]:[]),...(s.aboveQuota?[`${POPULATION_TYPES[id].name}: ${s.aboveQuota} обязательных участников сверх квоты.`]:[])]);
 for(const p of placements)if(!roomById.has(p.roomId))throw new Error('Участник заселения вне комнаты.');
 return{version:1,enabled:true,rules:config.rules,placements,summary,warnings};
}
