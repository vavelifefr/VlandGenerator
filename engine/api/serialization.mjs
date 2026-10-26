import {corridorSettings} from '../core/corridors.mjs';
import {environmentErrors} from './environment.mjs';
import {encounterErrors} from './encounters.mjs';
import {validateLevel} from '../core/validation.mjs';
import {roomContains} from '../core/space.mjs';
import {LEGACY_ROOM_SHAPES} from '../core/shapes.mjs';
import {normalizeConfig,isObject,LabError,MAX_JSON_BYTES,GENERATOR_VERSION,GENERATOR_KEYS} from './config.mjs';
import {setpieceErrors} from './setpieces.mjs';
import {populationErrors} from './population.mjs';
import {fingerprint} from './identity.mjs';
import {planContent} from './content.mjs';
import {analyzeLevel} from './generate.mjs';
import {diagnoseDungeon} from './diagnostics.mjs';
const int=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max,key=p=>`${p.x}:${p.y}`;
function requireThat(condition,message) {if(!condition)throw new LabError('INVALID_JSON',message);}
function boundedArray(value,max,name) {requireThat(Array.isArray(value)&&value.length<=max,`${name}: массив не более ${max} элементов.`);return value;}
function ids(records,name) {const seen=new Set();for(const r of records){requireThat(isObject(r)&&typeof r.id==='string'&&r.id.length>0&&r.id.length<=96&&!seen.has(r.id),`${name}: пустой или повторяющийся id.`);seen.add(r.id);}return seen;}
function levelStructure(level) {
  requireThat(isObject(level)&&level.schema==='room-dungeon'&&level.schemaVersion===2,'Нужен room-dungeon schemaVersion:2.');
  requireThat(int(level.seed,0,0xffffffff)&&isObject(level.board)&&int(level.board.width,5,4096)&&int(level.board.height,5,4096)&&level.board.width*level.board.height<=250000,'Неверные seed или размеры поля (максимум 250000 клеток).');
  const b=level.board,area=b.width*b.height,point=p=>isObject(p)&&int(p.x,0,b.width-1)&&int(p.y,0,b.height-1);
  const rooms=boundedArray(level.rooms,120,'rooms');requireThat(rooms.length>=2,'Нужно минимум две комнаты.');const roomIds=ids(rooms,'rooms');
  requireThat(isObject(level.plan),'Нет логического графа.');const plan=level.plan;
  const nodes=boundedArray(plan.nodes,120,'nodes'),edges=boundedArray(plan.edges,512,'edges');requireThat(nodes.length===rooms.length&&ids(nodes,'nodes').size===roomIds.size&&nodes.every(n=>roomIds.has(n.id)),'Граф не соответствует комнатам.');ids(edges,'edges');
  requireThat(roomIds.has(plan.startId)&&roomIds.has(plan.finalId)&&plan.startId!==plan.finalId,'Неверные старт/выход.');
  requireThat(['local','progressive'].includes(plan.dependencyMode),'Некорректная модель зависимостей.');
  for(const n of nodes)requireThat(int(n.x,0,128)&&int(n.y,0,128)&&int(n.spanX,1,128)&&int(n.spanY,1,128),'Неверная логическая область.');
  for(const e of edges)requireThat(roomIds.has(e.from)&&roomIds.has(e.to)&&e.from!==e.to&&['open','key','lever','secret','breakable','one-way'].includes(e.kind),'Неверная связь комнат.');
  for(const name of ['keys','controllers'])for(const m of boundedArray(plan[name],512,name))requireThat(roomIds.has(m.roomId)&&edges.some(e=>e.id===m.edgeId),'Неизвестная зависимость.');
  for(const name of ['districts','compositions'])if(plan[name]!==undefined)for(const group of boundedArray(plan[name],120,name))requireThat(isObject(group)&&boundedArray(group.roomIds,120,'roomIds').every(id=>roomIds.has(id)),'Некорректная группа комнат.');
  if(plan.mainPath!==undefined)requireThat(boundedArray(plan.mainPath,120,'mainPath').every(id=>roomIds.has(id)),'Неизвестная комната маршрута.');
  for(const r of rooms){
    requireThat(int(r.x,0,b.width-1)&&int(r.y,0,b.height-1)&&int(r.width,5,256)&&int(r.height,5,256)&&r.x+r.width<=b.width&&r.y+r.height<=b.height&&point(r.core)&&LEGACY_ROOM_SHAPES.includes(r.shape),'Неверная геометрия комнаты.');
    boundedArray(r.doors,64,'doors');for(const d of r.doors)requireThat(point(d)&&point(d.inside)&&edges.some(e=>e.id===d.edgeId),'Некорректный вход.');
    const tiles=boundedArray(r.floorTiles,area,'floorTiles');requireThat(tiles.every(point)&&new Set(tiles.map(key)).size===tiles.length,'Некорректные клетки комнаты.');
    if(r.interiorTemplate!==undefined){requireThat(isObject(r.interiorTemplate),'Неверный внутренний шаблон.');if(r.interiorTemplate.cells!==undefined)requireThat(boundedArray(r.interiorTemplate.cells,area,'template cells').every(point),'Неверные клетки шаблона.');}
    // Masks/regions are bounded before roomContains and the deeper graph solver.
    if(r.regions!==undefined)for(const a of boundedArray(r.regions,64,'regions'))requireThat(isObject(a)&&[a.x,a.y,a.width,a.height].every(Number.isInteger)&&a.width>0&&a.height>0,'Некорректная область комнаты.');
    if(r.notch!==undefined)requireThat(isObject(r.notch)&&int(r.notch.x,r.x,r.x+r.width-1)&&int(r.notch.y,r.y,r.y+r.height-1)&&int(r.notch.width,1,r.width)&&int(r.notch.height,1,r.height)&&r.notch.x+r.notch.width<=r.x+r.width&&r.notch.y+r.notch.height<=r.y+r.height,'Некорректная выемка.');
  }
  const walls=boundedArray(b.walls,area,'walls');requireThat(walls.every(w=>point(w)&&['bedrock','internal','door'].includes(w.type))&&new Set(walls.map(key)).size===walls.length,'Неверные/повторные стены.');
  const transportLinks=boundedArray(level.transportLinks??[],32,'transportLinks');ids(transportLinks,'transportLinks');for(const t of transportLinks)requireThat(isObject(t)&&typeof t.edgeId==='string'&&['teleport','lift','stairs'].includes(t.kind)&&t.bidirectional===true&&point(t.from)&&point(t.to)&&roomIds.has(t.from.roomId)&&roomIds.has(t.to.roomId),'Некорректный транспортный переход.');
  const external=boundedArray(level.externalTransports??[],4,'externalTransports');ids(external,'externalTransports');requireThat(external.every(t=>typeof t.worldLinkId==='string'&&point(t.from)&&point(t.to)),'Неверные требования внешнего перехода.');
  const connections=boundedArray(level.connections,512,'connections');requireThat(connections.length+transportLinks.length+external.length===edges.length&&ids(connections,'connections').size===connections.length,'Связи геометрии не соответствуют графу.');
  for(const c of connections){const edge=edges.find(e=>e.id===c.id);requireThat(edge&&edge.from===c.from&&edge.to===c.to&&edge.kind===c.kind&&point(c.fromDoor)&&point(c.toDoor),'Изменена связь геометрии.');requireThat(boundedArray(c.cells,corridorSettings(level.options?.corridors).maxLength,'cells').length>=corridorSettings(level.options?.corridors).minLength&&c.cells.every(point),'Проход должен занимать 1–3 клетки.');}
  const features=boundedArray(level.features,2000,'features');ids(features,'features');const wallByPoint=new Map(walls.map(w=>[key(w),w]));for(const f of features)requireThat(roomIds.has(f.roomId)&&f.destructible===(f.material==='internal')&&['bedrock','internal'].includes(f.material)&&boundedArray(f.cells,512,'feature cells').every(p=>point(p)&&wallByPoint.get(key(p))?.featureId===f.id&&wallByPoint.get(key(p))?.type===f.material),'Неверное укрытие.');
  const gates=boundedArray(level.gates,512,'gates');ids(gates,'gates');requireThat(gates.length===edges.filter(e=>e.kind!=='open').length,'Отсутствует дверь или добавлена лишняя.');
  for(const g of gates){const edge=edges.find(e=>e.id===g.id),connection=connections.find(c=>c.id===g.id),position=['one-way','breakable'].includes(g.kind)?connection?.fromDoor:connection?.toDoor;requireThat(edge&&edge.kind!=='open'&&edge.kind===g.kind&&g.keyId===edge.keyId&&g.controllerId===edge.controllerId&&point(g.position)&&key(g.position)===key(position)&&walls.some(w=>w.gateId===g.id&&key(w)===key(g.position)),'Дверь не совпадает с её проходом/стеной.');}
  const mechanisms=boundedArray(level.mechanisms,512,'mechanisms');ids(mechanisms,'mechanisms');requireThat(mechanisms.length===plan.keys.length+plan.controllers.length,'Не совпадает количество устройств.');
  for(const m of mechanisms){const expected=(m.kind==='key'?plan.keys:plan.controllers).find(p=>p.id===m.id);requireThat(['key','lever'].includes(m.kind)&&expected&&expected.edgeId===m.edgeId&&expected.roomId===m.roomId&&point(m.position)&&!wallByPoint.has(key(m.position))&&roomContains(rooms.find(r=>r.id===m.roomId),m.position,{interior:true}),'Устройство не соответствует графу.');}
  requireThat(point(level.spawn),'Нет корректной точки старта.');boundedArray(level.protectedTiles,area,'protectedTiles');requireThat(level.protectedTiles.every(k=>typeof k==='string'&&k.length<=9&&/^\d+:\d+$/.test(k)&&point(Object.fromEntries(k.split(':').map((v,i)=>[i?'y':'x',Number(v)])))),'Неверный защищённый путь.');
  const protectedCells=new Set(level.protectedTiles),reached=new Set([key(level.spawn)]),queue=[level.spawn];
  requireThat(protectedCells.has(key(level.spawn)),'Защищённый маршрут не содержит старт.');
  for(let i=0;i<queue.length;i++)for(const[dx,dy]of[[0,-1],[1,0],[0,1],[-1,0]]){const p={x:queue[i].x+dx,y:queue[i].y+dy},k=key(p);if(protectedCells.has(k)&&!wallByPoint.has(k)&&!reached.has(k)){reached.add(k);queue.push(p);}}
  requireThat(reached.has(key(rooms.find(r=>r.id===plan.finalId).core)),'Защищённые клетки не образуют свободный путь к выходу.');
  requireThat(isObject(level.options),'Нет настроек построения.');
  requireThat(isObject(level.quality)&&int(level.quality.score,0,100)&&isObject(level.quality.metrics)&&Array.isArray(level.quality.components)&&level.quality.components.length===5&&level.quality.components.every(c=>isObject(c)&&['route','topology','variety','packing','structure'].includes(c.id)&&int(c.score,0,100)),'Некорректная оценка качества.');
  if(level.packing?.nests!==undefined)boundedArray(level.packing.nests,120,'nests');
  return {point,roomIds,area};
}
export function validateDungeon(input) {return checkDungeon(input);}
// A world must separately prove its real cross-layer links and navigation.
// These requirements are used only to check the layer's original local graph.
export function validateWorldLayer(input,externalTransports) {return checkDungeon(input,{externalTransports});}
function checkDungeon(input,context={}) {
  try {
    const bundle=input?.schema==='vland'?input:null,level=bundle?.level??input;const {point,roomIds,area}=levelStructure(level);
    // Never trust a saved validation.ok flag: run the actual progression solver.
    const report=validateLevel(level,context);requireThat(report.ok,report.errors.join(' '));
    if(bundle){
      requireThat(bundle.schemaVersion===1&&bundle.apiVersion===1&&typeof bundle.generatorVersion==='string','Неподдерживаемая версия пакета.');const recipe=normalizeConfig(bundle.recipe);
      requireThat(isObject(bundle.content)&&bundle.content.version===1,'Нет плана наполнения.');
      const plans=boundedArray(bundle.content.rooms,120,'content.rooms');requireThat(plans.length===level.rooms.length&&new Set(plans.map(r=>r.roomId)).size===plans.length&&plans.every(r=>roomIds.has(r.roomId)),'План наполнения не соответствует комнатам.');
      for(const r of plans)requireThat(['start','exit','boss','combat','rest','reward','event'].includes(r.purpose)&&Number.isFinite(r.danger)&&r.danger>=0&&r.danger<=1&&isObject(r.budget)&&['enemies','loot','traps','lights'].every(k=>int(r.budget[k],0,12000)),'Неверное назначение/бюджет комнаты.');
      const hints=boundedArray(bundle.content.hints,Math.min(area,12000),'hints'),used=new Set(),walls=new Set(level.board.walls.map(key)),reserved=new Set(level.protectedTiles);ids(hints,'hints');
      for(const h of hints){requireThat(typeof h.id==='string'&&['enemy','loot','trap','light','spawner'].includes(h.kind)&&roomIds.has(h.roomId)&&point(h)&&!used.has(key(h))&&!walls.has(key(h))&&roomContains(level.rooms.find(r=>r.id===h.roomId),h,{interior:true}),'Точка наполнения перекрыта или лежит вне комнаты.');used.add(key(h));if(['enemy','trap','spawner'].includes(h.kind))requireThat(!reserved.has(key(h))&&!level.mechanisms.some(m=>Math.abs(m.position.x-h.x)+Math.abs(m.position.y-h.y)<=1),'Опасность перекрывает защищённый путь/устройство.');}
      for(const r of plans){for(const[kind,budget]of[['enemy','enemies'],['loot','loot'],['trap','traps'],['light','lights']])requireThat(hints.filter(h=>h.roomId===r.roomId&&h.kind===kind).length===r.budget[budget],'Бюджет не совпадает с точками наполнения.');if(['start','exit','rest'].includes(r.purpose))requireThat(r.budget.enemies+r.budget.traps===0,'Безопасная комната содержит опасность.');}
      const selection=bundle.selection;requireThat(isObject(selection)&&selection.baseSeed===recipe.seed&&selection.selectedSeed===level.seed&&selection.candidateCount===recipe.candidates&&int(selection.selectedIndex,0,recipe.candidates-1),'Некорректные данные подбора.');
      const rows=boundedArray(selection.candidates,9,'candidates');requireThat(rows.length===recipe.candidates&&rows.every((r,i)=>r.index===i&&r.seed===((recipe.seed+i)>>>0)&&typeof r.valid==='boolean')&&rows[selection.selectedIndex].valid,'Некорректная серия seed.');
      requireThat(isObject(bundle.analysis)&&int(bundle.analysis.score,0,100)&&Array.isArray(bundle.analysis.criteria)&&bundle.analysis.criteria.length===5&&isObject(bundle.analysis.metrics),'Некорректная оценка профиля.');
      requireThat(bundle.fingerprint===fingerprint({level,content:bundle.content}),'Отпечаток JSON не совпадает с картой/наполнением.');
      if(bundle.content.setpieces!==undefined){const errors=setpieceErrors(level,bundle.content.setpieces);requireThat(!errors.length,errors.join(' '));}
      if(bundle.content.environment!==undefined){const errors=environmentErrors(level,bundle.content.environment,bundle.content);requireThat(!errors.length,errors.join(' '));requireThat(bundle.content.environment.lights.length===hints.filter(h=>h.kind==='light').length&&bundle.content.environment.lights.every(l=>hints.some(h=>h.kind==='light'&&h.lightId===l.id&&h.roomId===l.roomId&&key(h)===key(l.anchor))),'Крепления света не совпадают с точками.');}
      if(bundle.content.population!==undefined){const errors=populationErrors(level,bundle.content.population,hints);requireThat(!errors.length,errors.join(' '));}
      if(bundle.content.encounters!==undefined){const errors=encounterErrors(bundle,bundle.content.encounters);requireThat(!errors.length,errors.join(' '));}
    }
    return{ok:true,errors:[],warnings:level.quality?.warnings??[],rooms:level.rooms.length,maxConnectorLength:report.maxConnectorLength,checkedStates:report.checkedStates};
  }catch(error){return{ok:false,errors:[error.message],code:error.code??'INVALID_JSON'};}
}
export function importDungeon(source) {
  if(typeof source==='string'){
    if(new TextEncoder().encode(source).byteLength>MAX_JSON_BYTES)throw new LabError('JSON_TOO_LARGE','JSON превышает лимит 24 MiB.');
    try{source=JSON.parse(source.replace(/^\uFEFF/,''));}catch{throw new LabError('INVALID_JSON','JSON не читается.');}
  }
  const report=validateDungeon(source);if(!report.ok)throw new LabError(report.code??'INVALID_JSON',report.errors.join(' '));
  if(source.schema==='vland'){const result=structuredClone(source);result.analysis=analyzeLevel(result.level,result.recipe.profile??'balanced');if(source.analysis.diagnostics!==undefined)result.analysis.diagnostics=diagnoseDungeon(result);return result;}
  const level=structuredClone(source),generator=Object.fromEntries(Object.entries(level.options).filter(([k])=>GENERATOR_KEYS.includes(k)));
  const recipe=normalizeConfig({seed:level.seed,candidates:1,generator}),content=planContent(level,recipe.content);
  return{schema:'vland',schemaVersion:1,apiVersion:1,generatorVersion:GENERATOR_VERSION,recipe,level,content,analysis:analyzeLevel(level),selection:{baseSeed:level.seed,selectedSeed:level.seed,selectedIndex:0,candidateCount:1,candidates:[{index:0,seed:level.seed,valid:true,score:analyzeLevel(level).score}]},fingerprint:fingerprint({level,content})};
}
export function exportDungeon(bundle,{format='bundle',pretty=true}={}) {
  if(!['bundle','level'].includes(format))throw new LabError('INVALID_FORMAT','Формат: bundle или level.');
  if(format==='bundle'&&bundle?.schema!=='vland')throw new LabError('INVALID_FORMAT','Для bundle сначала используйте importDungeon(rawLevel).');
  const report=validateDungeon(bundle);if(!report.ok)throw new LabError('INVALID_JSON',report.errors.join(' '));
  return JSON.stringify(format==='level'?(bundle.level??bundle):bundle,null,pretty?2:0)+'\n';
}
