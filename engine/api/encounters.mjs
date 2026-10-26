import {LabError,GENERATOR_VERSION} from './config.mjs';
import {fingerprint} from './identity.mjs';
import {deriveStageSeed} from '../core/streams.mjs';
import {seededRandom} from '../core/random.mjs';
import {createMovementField,movementProfile,movementFits,findMovementPath} from './movement.mjs';
const key=p=>p.x+':'+p.y,near=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y),dirs=[[0,-1],[1,0],[0,1],[-1,0]];
export const ENCOUNTER_ROLES=Object.freeze({frontline:{name:'Передняя линия',cost:1,profile:'walker'},ranged:{name:'Стрелок с линией огня',cost:2,profile:'walker'},flanker:{name:'Фланговый боец',cost:2,profile:'walker'},support:{name:'Поддержка у укрытия',cost:2,profile:'walker'},heavy:{name:'Крупный боец',cost:4,profile:'large'},ambusher:{name:'Засада вне первого обзора',cost:2,profile:'walker'},neutral:{name:'Нейтральный с путём отхода',cost:0,profile:'walker'}});
export const ENCOUNTER_TYPES=Object.freeze({crossfire:{name:'Перекрёстный огонь',roles:['ranged','flanker','frontline'],requires:[]},flanking:{name:'Бой и обход',roles:['frontline','flanker','support'],requires:[]},holdout:{name:'Оборона укрытия',roles:['support','ranged','frontline'],requires:['cover']},'hazard-bait':{name:'Заманивание в среду',roles:['frontline','flanker','ranged'],requires:['medium']},'guardian-cache':{name:'Тяжёлый охранник награды',roles:['heavy','support','ranged'],requires:[]},ambush:{name:'Читаемая засада',roles:['ambusher','frontline','flanker'],requires:['cover']}});
for(const definition of Object.values(ENCOUNTER_ROLES))Object.freeze(definition);for(const definition of Object.values(ENCOUNTER_TYPES)){Object.freeze(definition.roles);Object.freeze(definition.requires);Object.freeze(definition);}
function sight(a,b,walls){let x=a.x,y=a.y,dx=Math.abs(b.x-x),sx=x<b.x?1:-1,dy=-Math.abs(b.y-y),sy=y<b.y?1:-1,error=dx+dy;for(;;){if(walls.has(x+':'+y))return false;if(x===b.x&&y===b.y)return true;const e=error*2;if(e>=dy){error+=dy;x+=sx;}if(e<=dx){error+=dx;y+=sy;}}}
function reserved(value){const level=value.level;return new Set([...level.protectedTiles,...level.mechanisms.flatMap(m=>[m.position,...dirs.map(([dx,dy])=>({x:m.position.x+dx,y:m.position.y+dy}))]).map(key),...(value.content.setpieces?.slots??[]).flatMap(s=>[...s.cells,...s.approach]).map(key),...(value.content.environment?.circuits??[]).flatMap(c=>[c.control.anchor,...c.control.approach]).map(key),...(value.content.population?.placements??[]).filter(p=>p.controller).flatMap(p=>[p.controller,...p.controller.approach]).map(key)]);}
const footprint=(p,profile)=>Array.from({length:profile.width*profile.height},(_,i)=>({x:p.x+i%profile.width,y:p.y+Math.floor(i/profile.width)}));
function sourceCells(value,hint){const population=value.content.population?.placements.find(p=>p.id===hint.id);return population?.spawnArea??(hint.footprint?footprint(hint,hint.footprint):[hint]);}
function roomField(base,room){const floor=new Set(room.floorTiles.map(key)),passable=base.passable.map((v,i)=>v&&footprint({x:i%base.width,y:Math.floor(i/base.width)},base.profile).every(p=>floor.has(key(p)))?1:0);return{...base,passable};}
function origin(field,room){const p={x:room.core.x-Math.floor(field.profile.width/2),y:room.core.y-Math.floor(field.profile.height/2)};return movementFits(field,p)?p:room.floorTiles.find(p=>movementFits(field,p));}
function affordances(value,room){return{coverIds:value.level.features.filter(f=>f.roomId===room.id).map(f=>f.id),mediumIds:(value.content.environment?.media??[]).filter(m=>m.roomId===room.id).map(m=>m.id),circuitIds:(value.content.environment?.circuits??[]).filter(c=>c.roomId===room.id).map(c=>c.id),propIds:(value.content.setpieces?.slots??[]).filter(s=>s.roomId===room.id).map(s=>s.id)};}
export function planEncounters(value,options={}){
 const allowed=['seed','types','roomIds','budget','roleProfiles','maxActors'];if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>!allowed.includes(k)))throw new LabError('INVALID_ENCOUNTER','Неизвестная настройка ситуаций.');
 const {seed=value.level.seed,budget=12,maxActors=6}=options,types=options.types??Object.keys(ENCOUNTER_TYPES),roleProfiles=options.roleProfiles??{};
 if(!Number.isInteger(seed)||seed<0||seed>0xffffffff||!Number.isFinite(budget)||budget<0||budget>100||!Number.isInteger(maxActors)||maxActors<1||maxActors>12||!Array.isArray(types)||!types.length||types.some(t=>!Object.hasOwn(ENCOUNTER_TYPES,t))||options.roomIds!==undefined&&(!Array.isArray(options.roomIds)||options.roomIds.some(id=>!value.level.rooms.some(r=>r.id===id)))||!roleProfiles||typeof roleProfiles!=='object'||Array.isArray(roleProfiles)||Object.keys(roleProfiles).some(r=>!Object.hasOwn(ENCOUNTER_ROLES,r)))throw new LabError('INVALID_ENCOUNTER','Неверные seed, бюджет0–100, типы, комнаты или роли.');
 for(const p of Object.values(roleProfiles))movementProfile(p);
 const level=value.level,protectedCells=reserved(value),used=new Set(value.content.hints.flatMap(h=>sourceCells(value,h)).map(key)),walls=new Set(level.board.walls.map(key)),fields=new Map(),rooms=[],warnings=[];
 const getField=profile=>{const id=JSON.stringify(profile);if(!fields.has(id))fields.set(id,createMovementField(value,profile));return fields.get(id);};
 const candidates=level.rooms.filter(r=>!['start','final'].includes(r.purpose)&&(!options.roomIds||options.roomIds.includes(r.id))).sort((a,b)=>a.id.localeCompare(b.id));
 for(const room of candidates){
  const hints=value.content.hints.filter(h=>h.kind==='enemy'&&h.roomId===room.id).sort((a,b)=>a.id.localeCompare(b.id));if(!hints.length)continue;
  const assets=affordances(value,room),eligible=types.filter(t=>ENCOUNTER_TYPES[t].requires.every(r=>r==='cover'?assets.coverIds.length:assets.mediumIds.length));
  if(!eligible.length){warnings.push(room.id+': нет признаков для выбранных ситуаций.');continue;}
  const random=seededRandom(deriveStageSeed(seed,room.id,'encounter',GENERATOR_VERSION)),type=eligible[Math.floor(random()*eligible.length)],entry=room.doors[0]?.inside??room.core,actors=[],unassigned=[],cover=level.features.filter(f=>f.roomId===room.id).flatMap(f=>f.cells);let spent=0;
  for(const [index,hint]of hints.entries()){
   if(index>=maxActors){unassigned.push({id:hint.id,reason:'Лимит участников ситуации.'});continue;}
   const role=hint.populationKind==='neutral'?'neutral':ENCOUNTER_TYPES[type].roles[index%ENCOUNTER_TYPES[type].roles.length],definition=ENCOUNTER_ROLES[role];
   if(spent+definition.cost>budget){unassigned.push({id:hint.id,reason:'Исчерпан бюджет ситуации.'});continue;}
   let profile=movementProfile(roleProfiles[role]??definition.profile);const population=value.content.population?.placements.find(p=>p.id===hint.id);
   if(population){const size=population.populationKind==='boss'?3:1;if(role==='heavy'&&size<3||roleProfiles[role]&&(profile.width!==size||profile.height!==size)){unassigned.push({id:hint.id,reason:'Роль требует другого габарита; размер существующего существа сохранён.'});continue;}profile={...profile,width:size,height:size};}
   const field=roomField(getField(profile),room),start=origin(field,room);if(!start){unassigned.push({id:hint.id,reason:'Нет опорной области нужного габарита.'});continue;}
   for(const p of sourceCells(value,hint))used.delete(key(p));
   const ranked=room.floorTiles.map(p=>({p,tie:random(),distance:near(p,entry),cover:cover.length?Math.min(...cover.map(c=>near(c,p))):99,visible:sight(p,entry,walls)})).filter(c=>{
    if(!movementFits(field,c.p)||footprint(c.p,profile).some(p=>used.has(key(p))||protectedCells.has(key(p))))return false;
    if(role==='ranged'&&(!c.visible||c.distance<4))return false;if(role==='ambusher'&&c.visible)return false;if(role==='support'&&c.cover>2)return false;return true;
   }).map(c=>({...c,score:(role==='frontline'?-c.distance:role==='ranged'?Math.min(c.distance,12):role==='flanker'?Math.abs((c.p.x-room.core.x)*(entry.y-room.core.y)-(c.p.y-room.core.y)*(entry.x-room.core.x))/Math.max(1,near(entry,room.core)):role==='neutral'?-Math.min(...room.doors.map(d=>near(c.p,d.inside))):role==='support'?-c.cover:Math.min(c.distance,10))+c.tie})).sort((a,b)=>b.score-a.score);
   let placed=false;for(const {p}of ranked.slice(0,60)){const path=findMovementPath(value,start,p,profile,{},field);if(!path)continue;const cells=footprint(p,profile);for(const c of cells)used.add(key(c));actors.push({id:hint.id,sourceHintId:hint.id,role,profile,anchor:{x:p.x,y:p.y},cells,approachPath:path,cost:definition.cost,cues:role==='ambusher'?['Визуальное предупреждение до атаки']:[],lineOfFire:role==='ranged'?{from:{...p},to:{...entry}}:null});spent+=definition.cost;placed=true;break;}
   if(!placed){for(const p of sourceCells(value,hint))used.add(key(p));unassigned.push({id:hint.id,reason:'Нет безопасного места с нужным габаритом, подходом и боевой ролью.'});}
  }
  rooms.push({id:'encounter-'+room.id,roomId:room.id,type,name:ENCOUNTER_TYPES[type].name,entry:{...entry},exits:room.doors.map(d=>({...d.inside})),budget,spent,actors,unassigned,affordances:assets,protectedRoute:true});
 }
 const plan={schema:'vland.encounters',schemaVersion:1,sourceFingerprint:fingerprint(level),seed,rooms,warnings,note:'Роли привязаны к существующим enemy hints по sourceHintId. Адаптер заменяет их позиции, а не создаёт вторую группу. Профили/линии/подходы проверяются по клеткам; бой и предупреждения исполняет игра.'};
 const errors=encounterErrors(value,plan);if(errors.length)throw new LabError('INVALID_ENCOUNTER',errors.join(' '));return plan;
}
export function encounterErrors(value,plan){
 try{
  if(plan?.schema!=='vland.encounters'||plan.schemaVersion!==1||plan.sourceFingerprint!==fingerprint(value.level)||!Array.isArray(plan.rooms)||plan.rooms.length>120)throw new Error('Неверный контракт ситуаций или геометрия-источник.');
  const reservedCells=reserved(value),actorIds=new Set(plan.rooms.flatMap(r=>r.actors??[]).map(a=>a.sourceHintId)),occupied=new Set(value.content.hints.filter(h=>!actorIds.has(h.id)).flatMap(h=>sourceCells(value,h)).map(key)),ids=new Set(),roomIds=new Set(),walls=new Set(value.level.board.walls.map(key));
  for(const c of plan.rooms){
   const room=value.level.rooms.find(r=>r.id===c.roomId);if(!room||roomIds.has(c.roomId)||!Object.hasOwn(ENCOUNTER_TYPES,c.type)||!Array.isArray(c.actors)||c.actors.length>12||!Number.isFinite(c.budget)||c.budget<0||c.budget>100||key(c.entry)!==key(room.doors[0]?.inside??room.core)||fingerprint(c.affordances)!==fingerprint(affordances(value,room))||!c.protectedRoute)throw new Error('Неверная комната/тип/бюджет ситуации.');roomIds.add(c.roomId);let spent=0;
   if(ENCOUNTER_TYPES[c.type].requires.some(r=>r==='cover'?!c.affordances.coverIds.length:!c.affordances.mediumIds.length))throw new Error('Не выполнены признаки ситуации.');
   for(const a of c.actors){
    const hint=value.content.hints.find(h=>h.id===a.sourceHintId&&h.kind==='enemy'&&h.roomId===room.id);if(!hint||ids.has(a.id)||a.id!==a.sourceHintId||!Object.hasOwn(ENCOUNTER_ROLES,a.role))throw new Error('Неизвестный или повторный участник ситуации.');ids.add(a.id);
    const profile=movementProfile(a.profile),field=roomField(createMovementField(value,profile),room),cells=footprint(a.anchor,profile);
    const population=value.content.population?.placements.find(p=>p.id===hint.id);if(population){const size=population.populationKind==='boss'?3:1;if(profile.width!==size||profile.height!==size||a.role==='heavy'&&size<3)throw new Error('Ситуация меняет габарит существующего существа.');}
    if(!movementFits(field,a.anchor)||cells.some(p=>reservedCells.has(key(p))||occupied.has(key(p)))||JSON.stringify(cells)!==JSON.stringify(a.cells))throw new Error('Существо перекрывает подход/объект или не помещается.');
    const path=a.approachPath,start=origin(field,room);if(!Array.isArray(path)||!path.length||!start||key(path[0])!==key(start)||key(path.at(-1))!==key(a.anchor)||path.some((p,i)=>!movementFits(field,p)||i>0&&near(p,path[i-1])!==1))throw new Error('Непроходимый подход к участнику.');
    if(a.role==='ranged'&&(!sight(a.anchor,c.entry,walls)||near(a.anchor,c.entry)<4))throw new Error('Стрелку недоступна заявленная линия огня.');
    if(a.role==='ambusher'&&sight(a.anchor,c.entry,walls))throw new Error('Засада видна прямо со входа.');
    if(a.role==='support'&&!value.level.features.filter(f=>f.roomId===room.id).some(f=>f.cells.some(p=>near(p,a.anchor)<=2)))throw new Error('Поддержка размещена без укрытия.');
    if(!Array.isArray(a.cues)||a.cues.length>8||a.cues.some(c=>typeof c!=='string'||c.length>128)||a.role==='ambusher'&&!a.cues.length||a.role==='ranged'&&(!a.lineOfFire||key(a.lineOfFire.from)!==key(a.anchor)||key(a.lineOfFire.to)!==key(c.entry)))throw new Error('Неверное предупреждение/направление огня.');
    if(a.cost!==ENCOUNTER_ROLES[a.role].cost)throw new Error('Неверная стоимость участника.');spent+=a.cost;for(const p of cells)occupied.add(key(p));
   }
   if(spent!==c.spent||spent>c.budget)throw new Error('Превышен бюджет ситуации.');
  }return[];
 }catch(error){return[error.message];}
}
export function applyEncounterPlan(value,plan){
 const errors=encounterErrors(value,plan);if(errors.length)throw new LabError('INVALID_ENCOUNTER',errors.join(' '));
 const next=structuredClone(value),actors=new Map(plan.rooms.flatMap(r=>r.actors).map(a=>[a.sourceHintId,a]));
 for(const hint of next.content.hints){const a=actors.get(hint.id);if(a){hint.x=a.anchor.x;hint.y=a.anchor.y;hint.combatRole=a.role;hint.footprint={width:a.profile.width,height:a.profile.height};}}
 for(const actor of next.content.population?.placements??[]){const a=actors.get(actor.id);if(a){actor.x=a.anchor.x;actor.y=a.anchor.y;actor.spawnArea=structuredClone(a.cells);actor.combatRole=a.role;}}
 next.content.encounters=structuredClone(plan);next.fingerprint=fingerprint({level:next.level,content:next.content});return next;
}
