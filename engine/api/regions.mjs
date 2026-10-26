import {LabError,API_VERSION,GENERATOR_VERSION} from './config.mjs';
import {generateLevel} from '../core/index.mjs';
import {resolveRecipe} from './request.mjs';
import {analyzeLevel} from './generate.mjs';
import {planContent} from './content.mjs';
import {validateDungeon} from './serialization.mjs';
import {fingerprint} from './identity.mjs';
import {deriveStageSeed} from '../core/streams.mjs';
import {createContentState} from './content-runtime.mjs';
import {createEnvironmentState,setCircuitPower} from './environment.mjs';
import {createMovementField,findMovementPath,movementFits,movementProfile} from './movement.mjs';
const key=p=>p.x+':'+p.y,idOkay=s=>typeof s==='string'&&/^[a-zA-Z0-9_-]{1,48}$/.test(s)&&!['__proto__','constructor','prototype'].includes(s),fields=(v,keys,name)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!keys.includes(k)))throw new LabError('INVALID_REGION',name+': неверный объект/неизвестное поле.');};
const seal=value=>({...value,fingerprint:fingerprint({...value,fingerprint:undefined})});
export function boundaryContract(level){
 const endpoints=[level.plan.startId,level.plan.finalId].map(id=>level.rooms.find(r=>r.id===id));
 return{version:1,width:level.board.width,height:level.board.height,ports:[{id:'entry',roomId:level.plan.startId,anchor:{...level.spawn},footprint:{width:1,height:1}},{id:'exit',roomId:level.plan.finalId,anchor:{...endpoints[1].core},footprint:{width:1,height:1}}],endpointRooms:endpoints.map(r=>({id:r.id,x:r.x,y:r.y,width:r.width,height:r.height,core:r.core,doors:r.doors,floorTiles:r.floorTiles})),outerWalls:level.board.walls.filter(w=>w.x===0||w.y===0||w.x===level.board.width-1||w.y===level.board.height-1)};
}
function regionReachable(plan,from,reverse=false){const seen=new Set([from]),q=[from];for(let i=0;i<q.length;i++)for(const l of plan.connections){const a=reverse?l.to.regionId:l.from.regionId,b=reverse?l.from.regionId:l.to.regionId,next=a===q[i]?b:l.direction==='both'&&b===q[i]?a:null;if(next&&!seen.has(next)){seen.add(next);q.push(next);}}return seen;}
export function createRegionPlan(input){
 fields(input,['schema','schemaVersion','seed','regions','connections','entryRegionId','exitRegionId'],'План регионов');if(input.schema!=='vland.regions.request'||input.schemaVersion!==1||!Number.isInteger(input.seed??42)||(input.seed??42)<0||(input.seed??42)>0xffffffff||!Array.isArray(input.regions)||input.regions.length<1||input.regions.length>12)throw new LabError('INVALID_REGION','Нужен vland.regions.request v1, uint32 seed и1–12 регионов.');
 const seed=input.seed??42,ids=new Set();let area=0;
 const regions=input.regions.map(spec=>{fields(spec,['id','request'],'Регион');if(!idOkay(spec.id)||ids.has(spec.id))throw new LabError('INVALID_REGION','Повторный/неверный ID региона.');ids.add(spec.id);const request=spec.request??{schema:'vland.request',schemaVersion:1,rooms:{count:5},search:{candidates:1}},recipe=resolveRecipe({...request,seed:deriveStageSeed(seed,spec.id,'geometry',GENERATOR_VERSION)});if(recipe.candidates!==1||recipe.generator.roomCount>32)throw new LabError('INVALID_REGION','Регион: один кандидат и не более30 комнат плюс старт/выход.');
  const level=generateLevel({...recipe.generator,seed:recipe.seed}),analysis=analyzeLevel(level,recipe.profile),m=analysis.metrics,r=recipe.requirements;if(m.loops<r.minLoops||m.mainRooms<r.minMainRooms||m.shapeTypes<r.minShapes||m.unmarkedDeadEnds>r.maxDeadEnds)throw new LabError('TARGETS_NOT_MET','Регион '+spec.id+' не выполнил требования.');area+=level.board.width*level.board.height;return{id:spec.id,recipe,level,boundary:boundaryContract(level)};
 }).sort((a,b)=>a.id.localeCompare(b.id));if(area>250000)throw new LabError('WORLD_TOO_LARGE','Регионы суммарно превышают250000 клеток.');
 const raw=input.connections??regions.slice(1).map((r,i)=>({id:'transition-'+(i+1),from:{regionId:regions[i].id,port:'exit'},to:{regionId:r.id,port:'entry'}}));if(!Array.isArray(raw)||raw.length>32)throw new LabError('INVALID_REGION','Не более32 переходов.');const linkIds=new Set();
 const connections=raw.map(l=>{fields(l,['id','from','to','direction'],'Переход');for(const end of [l.from,l.to]){fields(end,['regionId','port'],'Порт');if(!ids.has(end.regionId)||!['entry','exit'].includes(end.port))throw new LabError('INVALID_REGION','Неизвестный порт региона.');}const direction=l.direction??'both';if(!idOkay(l.id)||linkIds.has(l.id)||l.from.regionId===l.to.regionId||!['both','forward'].includes(direction))throw new LabError('INVALID_REGION','Неверный ID/направление перехода.');linkIds.add(l.id);return{id:l.id,kind:'portal',from:{...l.from},to:{...l.to},direction};}).sort((a,b)=>a.id.localeCompare(b.id));
 const plan={schema:'vland.regions',schemaVersion:1,apiVersion:API_VERSION,generatorVersion:GENERATOR_VERSION,seed,regions,connections,entryRegionId:input.entryRegionId??regions[0].id,exitRegionId:input.exitRegionId??regions.at(-1).id,note:'Геометрия и порты планируются заранее, наполнение загружается отдельно. Межрегиональные связи — портальные переходы, не длинные физические коридоры. Посещённые регионы не перегенерируются.'};
 const report=validateRegionPlan(seal(plan));if(!report.ok)throw new LabError('INVALID_REGION',report.errors.join(' '));return seal(plan);
}
export function validateRegionPlan(plan){try{
 if(plan?.schema!=='vland.regions'||plan.schemaVersion!==1||plan.apiVersion!==1||typeof plan.generatorVersion!=='string'||!Number.isInteger(plan.seed)||plan.seed<0||plan.seed>0xffffffff||!Array.isArray(plan.regions)||plan.regions.length<1||plan.regions.length>12||!Array.isArray(plan.connections)||plan.connections.length>32||plan.fingerprint!==fingerprint({...plan,fingerprint:undefined}))throw new Error('Неверная схема/отпечаток плана регионов.');
 const ids=new Set(),linkIds=new Set();let cells=0;
 for(const r of plan.regions){if(!idOkay(r.id)||ids.has(r.id)||!validateDungeon(r.level).ok||fingerprint(r.boundary)!==fingerprint(boundaryContract(r.level)))throw new Error('Неверный регион или контракт границ.');ids.add(r.id);resolveRecipe(r.recipe);cells+=r.level.board.width*r.level.board.height;}
 if(cells>250000||!ids.has(plan.entryRegionId)||!ids.has(plan.exitRegionId))throw new Error('Слишком большой план или неверный вход/выход.');
 for(const l of plan.connections){if(!idOkay(l.id)||linkIds.has(l.id)||l.kind!=='portal'||!['both','forward'].includes(l.direction)||!l.from||!l.to||l.from.regionId===l.to.regionId||[l.from,l.to].some(p=>!ids.has(p.regionId)||!['entry','exit'].includes(p.port)))throw new Error('Неверный межрегиональный переход.');linkIds.add(l.id);}
 if(regionReachable(plan,plan.entryRegionId).size!==ids.size||regionReachable(plan,plan.exitRegionId,true).size!==ids.size)throw new Error('Регион недоступен либо из него нет выхода.');return{ok:true,errors:[],regions:ids.size};
}catch(error){return{ok:false,errors:[error.message]};}}
const runtime=dungeon=>({openedGateIds:[],brokenFeatureIds:[],blockedCells:[],content:createContentState(dungeon),...(dungeon.content.environment?{environment:createEnvironmentState(dungeon)}:{})});
export function createRegionState(plan){const report=validateRegionPlan(plan);if(!report.ok)throw new LabError('INVALID_REGION',report.errors.join(' '));return seal({schema:'vland.region-state',schemaVersion:1,planFingerprint:plan.fingerprint,originals:{},regions:{},visited:[],journal:[]});}
function contentBundle(plan,id,revision,source=null){
 const r=plan.regions.find(r=>r.id===id);if(!r)throw new LabError('INVALID_REGION','Неизвестный регион.');const level=structuredClone(source?.level??r.level),recipe=source?.recipe??r.recipe,contentSeed=deriveStageSeed(plan.seed,id,'content:'+revision,plan.generatorVersion),content=planContent({...level,seed:contentSeed},recipe.content),analysis=analyzeLevel(level,recipe.profile),b={schema:'vland',schemaVersion:1,apiVersion:1,generatorVersion:plan.generatorVersion,recipe:structuredClone(recipe),level,content,analysis,selection:source?structuredClone(source.selection):{baseSeed:level.seed,selectedSeed:level.seed,selectedIndex:0,candidateCount:1,candidates:[{index:0,seed:level.seed,valid:true,score:analysis.score}]}};b.fingerprint=fingerprint({level,content});return b;
}
export function loadRegion(plan,input,id){
 if(input.planFingerprint!==plan.fingerprint||!plan.regions.some(r=>r.id===id))throw new LabError('INVALID_REGION','Регион не принадлежит плану.');if(input.regions[id])return{state:input,dungeon:input.regions[id].dungeon};
 const b=contentBundle(plan,id,0),report=validateDungeon(b);if(!report.ok)throw new LabError('INVALID_REGION',report.errors.join(' '));const next=structuredClone(input);next.originals[id]=structuredClone(b);next.regions[id]={dungeon:b,runtime:runtime(b),contentRevision:0};return{state:seal(next),dungeon:b};
}
const regionDigest=region=>fingerprint(region);
function actorList(actors,regionId){if(!Array.isArray(actors)||actors.length>256)throw new LabError('INVALID_STATE','Не более256 акторов.');const ids=new Set();return actors.filter(a=>a.regionId===undefined||a.regionId===regionId).map(a=>{if(typeof a.id!=='string'||!a.id.length||a.id.length>96||ids.has(a.id)||!Number.isInteger(a.position?.x)||!Number.isInteger(a.position?.y))throw new LabError('INVALID_STATE','Неверный актор.');ids.add(a.id);return{id:a.id,position:{...a.position},profile:movementProfile(a.profile??'walker'),...(a.safetyTarget?{safetyTarget:{...a.safetyTarget}}:{})};});}
function overlaySafety(value,before,after,actors){
 const level=value.level,field=createMovementField(value,'walker',after),exit=level.rooms.find(r=>r.id===level.plan.finalId).core;if(!findMovementPath(value,level.spawn,exit,'walker',after,field))throw new Error('Изменение закрывает основной выход.');
 for(const room of level.rooms){const mask=new Set([...room.floorTiles,...level.features.filter(f=>f.roomId===room.id).flatMap(f=>f.cells)].map(key)),allowed=[...mask].map(k=>{const[x,y]=k.split(':').map(Number);return{x,y};}).filter(p=>movementFits(field,p));if(!allowed.length)continue;const q=[allowed[0]],seen=new Set([key(q[0])]);for(let i=0;i<q.length;i++)for(const[dx,dy]of[[0,-1],[1,0],[0,1],[-1,0]]){const p={x:q[i].x+dx,y:q[i].y+dy};if(mask.has(key(p))&&movementFits(field,p)&&!seen.has(key(p))){seen.add(key(p));q.push(p);}}if(seen.size!==allowed.length)throw new Error('Изменение разделяет свободный пол комнаты '+room.id+'.');}
 for(const m of level.mechanisms)if(findMovementPath(value,level.spawn,m.position,'walker',before)&&!findMovementPath(value,level.spawn,m.position,'walker',after,field))throw new Error('Изменение закрывает доступ к устройству.');
 for(const a of actors){const profile=a.profile,old=createMovementField(value,profile,before),next=createMovementField(value,profile,after);if(!movementFits(old,a.position)||!movementFits(next,a.position))throw new Error('Изменение перекрывает существующего актора.');const room=level.rooms.find(r=>r.floorTiles.some(p=>key(p)===key(a.position))),target=a.safetyTarget??(profile.width===1&&profile.height===1?exit:room?{x:room.core.x-Math.floor(profile.width/2),y:room.core.y-Math.floor(profile.height/2)}:null);if(target&&findMovementPath(value,a.position,target,profile,before,old)&&!findMovementPath(value,a.position,target,profile,after,next))throw new Error('Изменение запирает актора.');}
}
function applyOperations(value,input,operations,actors){
 if(!Array.isArray(operations)||!operations.length||operations.length>64)throw new LabError('INVALID_TRANSACTION','Транзакция:1–64 операции.');const next=structuredClone(input),level=value.level,protectedCells=new Set([...level.protectedTiles,...boundaryContract(level).endpointRooms.flatMap(r=>r.floorTiles).map(key),...level.mechanisms.map(m=>key(m.position)),...value.content.hints.map(key),...(value.content.setpieces?.slots??[]).flatMap(s=>[...s.cells,...s.approach]).map(key),...(value.content.environment?.circuits??[]).flatMap(c=>[c.control.anchor,...c.control.approach]).map(key),...(value.content.population?.placements??[]).filter(p=>p.controller).flatMap(p=>[p.controller,...p.controller.approach]).map(key)]),floor=new Set(level.rooms.flatMap(r=>r.floorTiles).map(key));
 for(const op of operations){
  fields(op,['type','position','id','on','cleared'],'Операция');
  if(op.type==='add-wall'||op.type==='remove-wall'){
   if(!Number.isInteger(op.position?.x)||!Number.isInteger(op.position?.y)||!floor.has(key(op.position)))throw new Error('Стена за пределами разрешённого пола.');const k=key(op.position),at=next.blockedCells.findIndex(p=>key(p)===k);
   if(op.type==='add-wall'){if(protectedCells.has(k)||actors.some(a=>a.position.x<=op.position.x&&a.position.y<=op.position.y&&op.position.x<a.position.x+a.profile.width&&op.position.y<a.position.y+a.profile.height))throw new Error('Стена занимает обязательный подход, объект или актора.');if(at<0)next.blockedCells.push({...op.position});}
   else{if(at<0)throw new Error('Можно убрать только добавленную журналом стену.');next.blockedCells.splice(at,1);}
  }else if(op.type==='open-gate'||op.type==='close-gate'){
   if(!level.gates.some(g=>g.id===op.id))throw new Error('Неизвестная дверь.');next.openedGateIds=op.type==='open-gate'?[...new Set([...next.openedGateIds,op.id])]:next.openedGateIds.filter(id=>id!==op.id);
  }else if(op.type==='break-feature'){
   if(!level.features.some(f=>f.id===op.id&&f.destructible))throw new Error('Нельзя разрушить эту стену.');next.brokenFeatureIds=[...new Set([...next.brokenFeatureIds,op.id])];
  }else if(op.type==='set-zone'){
   const zone=value.content.setpieces?.zones.find(z=>z.id===op.id);if(!zone||typeof op.cleared!=='boolean')throw new Error('Неверная зона/состояние.');next.content.flags[zone.requiredFlag]=op.cleared;
  }else if(op.type==='power'){
   if(typeof op.on!=='boolean')throw new Error('Питание: boolean.');next.environment=setCircuitPower(value,next.environment??createEnvironmentState(value),op.id,op.on).state;
  }else throw new Error('Неизвестная операция изменения.');
 }
 next.blockedCells.sort((a,b)=>a.y-b.y||a.x-b.x);next.openedGateIds.sort();next.brokenFeatureIds.sort();overlaySafety(value,input,next,actors);return next;
}
function journalAppend(state,event){if(state.journal.some(e=>e.id===event.id))throw new LabError('INVALID_JOURNAL','Повторный ID события.');state.journal.push({...event,sequence:state.journal.length+1});if(state.journal.length>256)throw new LabError('JOURNAL_LIMIT','Журнал: не более256 изменений; сохраните новый checkpoint.');return seal(state);}
export function transactRegion(plan,input,transaction,{actors=[]}={}){
 const reject=message=>({ok:false,state:input,error:message});try{
  fields(transaction,['id','regionId','operations'],'Транзакция');if(!idOkay(transaction.id))throw new Error('Неверный ID транзакции.');const prior=input.journal.find(e=>e.id===transaction.id),digest=fingerprint(transaction);if(prior){if(prior.transactionFingerprint!==digest)throw new Error('ID транзакции уже использован для другого изменения.');return{ok:true,state:input,replayed:true};}
  const next=structuredClone(loadRegion(plan,input,transaction.regionId).state),r=next.regions[transaction.regionId],live=actorList(actors,transaction.regionId),before=regionDigest(r);r.runtime=applyOperations(r.dungeon,r.runtime,transaction.operations,live);const event={type:'transaction',id:transaction.id,regionId:transaction.regionId,operations:structuredClone(transaction.operations),actors:live,transactionFingerprint:digest,before,after:regionDigest(r)};return{ok:true,state:journalAppend(next,event)};
 }catch(error){return reject(error.message);}
}
export function visitRegion(plan,input,id){
 const next=structuredClone(loadRegion(plan,input,id).state);if(next.visited.includes(id))return input;next.visited.push(id);next.visited.sort();return journalAppend(next,{type:'visit',id:'visit-'+id,regionId:id});
}
function replaceAccepted(plan,input,id,candidate,event){
 if(input.visited.includes(id))throw new LabError('FROZEN_REGION','Посещённый регион заморожен.');const source=plan.regions.find(r=>r.id===id);if(!source)throw new Error('Неизвестный регион.');const report=validateDungeon(candidate);if(!report.ok||fingerprint(boundaryContract(candidate.level))!==fingerprint(source.boundary))throw new Error('Новая область не прошла проверку или изменила зафиксированные границы.');
 const next=structuredClone(loadRegion(plan,input,id).state),before=regionDigest(next.regions[id]);next.regions[id]={dungeon:structuredClone(candidate),runtime:runtime(candidate),contentRevision:next.regions[id].contentRevision+1};return journalAppend(next,{...event,regionId:id,before,after:regionDigest(next.regions[id]),dungeon:structuredClone(candidate)});
}
export function replaceRegion(plan,input,id,candidate,{actors=[]}={}){try{if(actorList(actors,id).length)throw new Error('В регионе находится актор.');return{ok:true,state:replaceAccepted(plan,input,id,candidate,{type:'replace',id:'replace-'+(input.journal.length+1)})};}catch(error){return{ok:false,state:input,error:error.message};}}
export function regenerateRegionContent(plan,input,id,{actors=[]}={}){try{if(actorList(actors,id).length)throw new Error('В регионе находится актор.');const next=loadRegion(plan,input,id).state,revision=next.regions[id].contentRevision+1,bundle=contentBundle(plan,id,revision,next.regions[id].dungeon);return{ok:true,state:replaceAccepted(plan,next,id,bundle,{type:'regenerate',id:'regenerate-'+(input.journal.length+1)})};}catch(error){return{ok:false,state:input,error:error.message};}}
export function replayRegionJournal(plan,originals,journal){
 let state=createRegionState(plan);if(!originals||typeof originals!=='object'||Array.isArray(originals)||Object.keys(originals).length>12||!Array.isArray(journal)||journal.length>256)throw new LabError('INVALID_JOURNAL','Неверный исходный мир или журнал.');
 for(const id of Object.keys(originals).sort()){const source=plan.regions.find(r=>r.id===id),b=originals[id];if(!source||!validateDungeon(b).ok||fingerprint(source.level)!==fingerprint(b.level))throw new LabError('INVALID_JOURNAL','Исходный регион не соответствует геометрическому плану.');state.originals[id]=structuredClone(b);state.regions[id]={dungeon:structuredClone(b),runtime:runtime(b),contentRevision:0};}state=seal(state);
 for(const event of journal){if(event.sequence!==state.journal.length+1)throw new LabError('INVALID_JOURNAL','Неверный порядок журнала.');if(event.type==='visit')state=visitRegion(plan,state,event.regionId);
  else if(event.type==='transaction'){const result=transactRegion(plan,state,{id:event.id,regionId:event.regionId,operations:event.operations},{actors:event.actors});if(!result.ok)throw new LabError('INVALID_JOURNAL',result.error);state=result.state;}
  else if(['regenerate','replace'].includes(event.type))state=replaceAccepted(plan,state,event.regionId,event.dungeon,{type:event.type,id:event.id});else throw new LabError('INVALID_JOURNAL','Неизвестное событие журнала.');
  if(fingerprint(state.journal.at(-1))!==fingerprint(event))throw new LabError('INVALID_JOURNAL','Событие не воспроизводится точно.');
 }return state;
}
export function validateRegionState(plan,state){try{
 if(state?.schema!=='vland.region-state'||state.schemaVersion!==1||state.planFingerprint!==plan.fingerprint||state.fingerprint!==fingerprint({...state,fingerprint:undefined}))throw new Error('Неверная схема/отпечаток состояния.');const replayed=replayRegionJournal(plan,state.originals,state.journal);if(replayed.fingerprint!==state.fingerprint)throw new Error('Состояние не совпадает с повтором журнала.');return{ok:true,errors:[],loaded:Object.keys(state.regions).length,events:state.journal.length};
}catch(error){return{ok:false,errors:[error.message]};}}
export function travelRegion(plan,input,position,connectionId){
 try{
  const connection=plan.connections.find(c=>c.id===connectionId);if(!connection)throw new Error('Неизвестный переход.');const from=connection.from.regionId===position.regionId?connection.from:connection.direction==='both'&&connection.to.regionId===position.regionId?connection.to:null,to=from===connection.from?connection.to:connection.from;if(!from)throw new Error('Переход недоступен с этой стороны.');
  const source=plan.regions.find(r=>r.id===from.regionId).boundary.ports.find(p=>p.id===from.port),target=plan.regions.find(r=>r.id===to.regionId).boundary.ports.find(p=>p.id===to.port);if(key(position)!==key(source.anchor))throw new Error('Нужно встать на порт региона.');
  const loaded=loadRegion(plan,input,from.regionId).state;if(!movementFits(createMovementField(loaded.regions[from.regionId].dungeon,'walker',loaded.regions[from.regionId].runtime),position))throw new Error('Исходная площадка недоступна.');let next=loadRegion(plan,loaded,to.regionId).state;if(!movementFits(createMovementField(next.regions[to.regionId].dungeon,'walker',next.regions[to.regionId].runtime),target.anchor))throw new Error('Конечная площадка недоступна.');next=visitRegion(plan,next,to.regionId);return{ok:true,state:next,position:{regionId:to.regionId,...target.anchor},event:{type:'region-transition',id:connection.id,from:{...position},to:{regionId:to.regionId,...target.anchor}}};
 }catch(error){return{ok:false,state:input,position,error:error.message};}
}
export const REGIONS_REQUEST_TEMPLATE=Object.freeze({schema:'vland.regions.request',schemaVersion:1,seed:42,regions:[{id:'hub'},{id:'laboratory'},{id:'storage'}]});
