import {corridorSettings} from './corridors.mjs';
import {transportNeighbors,transportErrors} from './transports.mjs';
import {templateErrors} from './templates.mjs';
import {roomAreaErrors} from './area.mjs';
import {DIRECTIONS,pointKey} from './random.mjs';
import {adjacentFootprints} from './growth.mjs';
import {districtErrors} from './districts.mjs';
import {compositionErrors} from './compositions.mjs';
import {roomEnvelopesOverlap,roomContains} from './space.mjs';
import {nestingErrors} from './interlocking.mjs';
import {routePatternErrors} from './route-patterns.mjs';
export function reachableRooms(plan,opened=new Set()){
 const reached=new Set([plan.startId]),queue=[plan.startId];for(let i=0;i<queue.length;i++)for(const edge of plan.edges){if(edge.kind!=='open'&&!opened.has(edge.id))continue;const n=edge.from===queue[i]?edge.to:edge.to===queue[i]?edge.from:null;if(n&&!reached.has(n)){reached.add(n);queue.push(n);}}return reached;
}
export function solveLevelRules(plan,{mainOnly=false}={}){
 const opened=new Set(),actions=[],keys=new Set();let reached=reachableRooms(plan,opened);
 for(let round=0;!mainOnly&&round<=plan.edges.length;round++){
  let changed=false;
  for(const marker of plan.keys)if(reached.has(marker.roomId))keys.add(marker.id);
  for(const edge of plan.edges){if(edge.kind==='open'||opened.has(edge.id))continue;const accessible=reached.has(edge.from)||reached.has(edge.to),control=plan.controllers.find(c=>c.edgeId===edge.id);
   if(edge.kind==='key'&&accessible&&keys.has(edge.keyId)||edge.kind==='lever'&&control&&reached.has(control.roomId)||['secret','breakable'].includes(edge.kind)&&accessible||edge.kind==='one-way'&&reached.has(edge.from)){opened.add(edge.id);actions.push({type:edge.kind,edgeId:edge.id});changed=true;}
  }
  reached=reachableRooms(plan,opened);if(!changed)break;
 }
 return{ok:mainOnly?reached.has(plan.finalId):reached.size===plan.nodes.length,reached:[...reached],opened:[...opened],actions};
}
export function reachableTiles(level,{opened=new Set(),destroyInternal=false}={}){
 const blocked=new Set(level.board.walls.filter(w=>!(w.gateId&&opened.has(w.gateId))&&!(destroyInternal&&w.type==='internal')).map(pointKey)),seen=new Set([pointKey(level.spawn)]),q=[level.spawn];
 for(let i=0;i<q.length;i++)for(const p of [...DIRECTIONS.map(([dx,dy])=>({x:q[i].x+dx,y:q[i].y+dy})),...transportNeighbors(level,q[i])]){const k=pointKey(p);if(p.x<0||p.y<0||p.x>=level.board.width||p.y>=level.board.height||blocked.has(k)||seen.has(k))continue;seen.add(k);q.push(p);}return seen;
}
export function findTilePath(level,from,to,{opened=new Set(),blocked=[]}={}){
 const walls=new Set([...level.board.walls.filter(w=>!w.gateId||!opened.has(w.gateId)),...blocked].map(pointKey)),previous=new Map([[pointKey(from),null]]),q=[from];
 if(walls.has(pointKey(from))||walls.has(pointKey(to)))return null;
 for(let i=0;i<q.length;i++){const p=q[i];if(pointKey(p)===pointKey(to)){const path=[];let n=p;while(n){path.unshift(n);n=previous.get(pointKey(n));}return path;}for(const n of [...DIRECTIONS.map(([dx,dy])=>({x:p.x+dx,y:p.y+dy})),...transportNeighbors(level,p)]){const k=pointKey(n);if(n.x<0||n.y<0||n.x>=level.board.width||n.y>=level.board.height||walls.has(k)||previous.has(k))continue;previous.set(k,p);q.push(n);}}
 return null;
}
export function validateLevel(level,context={}){
 if(!level?.plan||!Array.isArray(level.plan.nodes)||!Array.isArray(level.plan.edges)||!Array.isArray(level.plan.keys)||!Array.isArray(level.plan.controllers)||!Array.isArray(level.rooms)||!Array.isArray(level.board?.walls))return{ok:false,errors:['Неполная структура уровня.']};
 const {plan}=level,transportProblems=transportErrors(level,context);if(context.externalTransports?.length)level={...level,transportLinks:[...(level.transportLinks??[]),...context.externalTransports]};
 const errors=[...transportProblems,...templateErrors(level),...roomAreaErrors(level),...districtErrors(plan),...compositionErrors(plan),...nestingErrors(level),...routePatternErrors(plan)],ids=new Set(plan.nodes.map(n=>n.id)),main=solveLevelRules(plan,{mainOnly:true}),complete=solveLevelRules(plan),byId=new Map(level.rooms.map(r=>[r.id,r]));
 if(ids.size!==plan.count||level.rooms.length!==plan.count)errors.push('Количество комнат или ID не совпало.');
 if(!main.ok)errors.push('Основной путь требует дополнительный механизм.');if(!complete.ok)errors.push('Не разрешаются зависимости.');
 const covered=new Set();for(const n of plan.nodes)for(let y=n.y;y<n.y+n.spanY;y++)for(let x=n.x;x<n.x+n.spanX;x++){const k=x+':'+y;if(covered.has(k))errors.push('Комнаты перекрылись.');covered.add(k);}
 for(let i=0;i<level.rooms.length;i++)for(const b of level.rooms.slice(i+1))if(roomEnvelopesOverlap(level.rooms[i],b))errors.push('Физические области комнат перекрылись.');
 const pairs=new Set();for(const e of plan.edges){const a=plan.nodes.find(n=>n.id===e.from),b=plan.nodes.find(n=>n.id===e.to),pair=[e.from,e.to].sort().join('/');if(!a||!b||!adjacentFootprints(a,b))errors.push('Соединены несоседние комнаты.');if(pairs.has(pair))errors.push('Повторное ребро.');pairs.add(pair);}
 for(const e of plan.edges)if(!['open','key','lever','secret','breakable','one-way'].includes(e.kind))errors.push('Неизвестный вид соединения.');
 if(new Set(plan.edges.map(e=>e.id)).size!==plan.edges.length)errors.push('Повторный ID соединения.');
 for(const marker of plan.keys)if(plan.edges.filter(e=>e.kind==='key'&&e.keyId===marker.id&&e.id===marker.edgeId).length!==1)errors.push('Ключ должен соответствовать одному замку.');
 for(const e of plan.edges.filter(e=>e.kind==='lever'))if(plan.controllers.filter(c=>c.id===e.controllerId&&c.edgeId===e.id).length!==1)errors.push('Рычаг должен соответствовать двери.');
 if(!ids.has(plan.startId)||!ids.has(plan.finalId))errors.push('Неизвестный старт или выход.');
 const base=new Set(main.reached);for(const marker of [...plan.keys,...plan.controllers]){const edge=plan.edges.find(e=>e.id===marker.edgeId);if(!edge||!ids.has(marker.roomId))errors.push('Неверная зависимость.');else if(plan.dependencyMode!=='progressive'&&(![edge.from,edge.to].includes(marker.roomId)||!base.has(marker.roomId)))errors.push('Контроллер должен быть рядом и доступен без других устройств.');}
 const transportIds=new Set((level.transportLinks??[]).map(t=>t.edgeId)),physical=plan.edges.filter(e=>!transportIds.has(e.id));
 if(level.connections.length!==physical.length||new Set(level.connections.map(c=>c.id)).size!==physical.length||physical.some(e=>!level.connections.some(c=>c.id===e.id&&c.from===e.from&&c.to===e.to&&c.kind===e.kind)))errors.push('Не каждому ребру соответствует проход или явный переход.');
 for(const c of level.connections)for(const [roomId,otherId,cap]of [[c.from,c.to,c.fromDoor],[c.to,c.from,c.toDoor]]){const room=byId.get(roomId),door=room?.doors.find(d=>d.edgeId===c.id);if(!door||pointKey(door)!==pointKey(cap)||door.toRoomId!==otherId||Math.abs(door.x-door.inside.x)+Math.abs(door.y-door.inside.y)!==1)errors.push('Дверная клетка не соответствует своему проходу: '+c.id);}
 const owners=new Map();for(const c of level.connections){const sequence=[c.fromDoor,...c.cells,c.toDoor];if(c.cells.length<corridorSettings(level.options?.corridors).minLength||c.cells.length>corridorSettings(level.options?.corridors).maxLength||Math.abs(c.fromDoor.x-c.toDoor.x)+Math.abs(c.fromDoor.y-c.toDoor.y)!==c.cells.length+1||sequence.slice(1).some((p,i)=>Math.abs(p.x-sequence[i].x)+Math.abs(p.y-sequence[i].y)!==1))errors.push('Соединение должно быть непрерывным и соответствовать диапазону corridors.');for(const p of c.cells){if(owners.has(pointKey(p)))errors.push('Коридоры пересеклись.');owners.set(pointKey(p),c.id);}}
 for(const[k,id]of owners){const[x,y]=k.split(':').map(Number);for(const[dx,dy]of DIRECTIONS)if(owners.has((x+dx)+':'+(y+dy))&&owners.get((x+dx)+':'+(y+dy))!==id)errors.push('Коридоры образовали необъявленную развилку.');}
 const settings=corridorSettings(level.options?.corridors);for(const c of level.connections){const width=c.kind==='open'?settings.openWidth:1,dx=Math.sign(c.toDoor.x-c.fromDoor.x),dy=Math.sign(c.toDoor.y-c.fromDoor.y),expected=[];for(const p of [c.fromDoor,...c.cells,c.toDoor])for(let n=0;n<width;n++){const d=n-Math.floor(width/2);expected.push((p.x+dy*d)+':'+(p.y+dx*d));}const actual=c.footprintCells?.map(pointKey);if(c.openWidth!==width||!actual||actual.length!==expected.length||new Set(actual).size!==expected.length||expected.some(k=>!actual.includes(k)))errors.push('Неверный полный габарит коридора: '+c.id);}
 const opened=new Set(),states=[null,...complete.actions];for(const action of states){if(action)opened.add(action.edgeId);const expected=reachableRooms(plan,opened),actual=reachableTiles(level,{opened});for(const r of level.rooms)if(actual.has(pointKey(r.core))!==expected.has(r.id))errors.push('Клеточная достижимость расходится с графом: '+r.id);}
 const broken=new Set(plan.edges.filter(e=>['secret','breakable'].includes(e.kind)).map(e=>e.id)),afterBreak=reachableTiles(level,{opened:broken,destroyInternal:true}),expected=reachableRooms(plan,broken);for(const r of level.rooms)if(afterBreak.has(pointKey(r.core))!==expected.has(r.id))errors.push('Разрушение обошло замок: '+r.id);
 const all=reachableTiles(level,{opened:new Set(plan.edges.map(e=>e.id))}),walls=new Set(level.board.walls.map(pointKey));
 const actualWalls=new Map(level.board.walls.map(w=>[pointKey(w),w]));
 for(const c of level.connections)for(const p of c.footprintCells??[c.fromDoor,...c.cells,c.toDoor]){const wall=actualWalls.get(pointKey(p));if(!all.has(pointKey(p))||wall&&wall.gateId!==c.id)errors.push('Проход перекрыт посторонней стеной: '+c.id);}
 for(const r of level.rooms){const q=[r.core],local=new Set([pointKey(r.core)]);for(let i=0;i<q.length;i++)for(const[dx,dy]of DIRECTIONS){const p={x:q[i].x+dx,y:q[i].y+dy},k=pointKey(p);if(roomContains(r,p,{interior:true})&&!walls.has(k)&&!local.has(k)){local.add(k);q.push(p);}}if(r.doors.some(d=>!local.has(pointKey(d.inside))))errors.push('Внутренний подход к двери разорван: '+r.id);}
 if(walls.has(pointKey(level.spawn)))errors.push('Старт в стене.');
 for(const r of level.rooms){if(!all.has(pointKey(r.core)))errors.push('Изолирована комната.');for(const p of r.floorTiles??[])if(!all.has(pointKey(p))||!roomContains(r,p,{interior:true}))errors.push('Изолирован или неверно назначен карман пола.');if(!r.doors.every(d=>!walls.has(pointKey(d.inside))&&roomContains(r,d.inside,{interior:true})))errors.push('Вход упирается в стену или чужую комнату.');}
 const initial=reachableTiles(level);for(const marker of level.mechanisms??[])if(!all.has(pointKey(marker.position))||plan.dependencyMode!=='progressive'&&!initial.has(pointKey(marker.position)))errors.push('Контроллер размещён в недоступной клетке.');
 for(let x=0;x<level.board.width;x++)if(!walls.has(x+':0')||!walls.has(x+':'+(level.board.height-1)))errors.push('Нарушена внешняя оболочка.');for(let y=0;y<level.board.height;y++)if(!walls.has('0:'+y)||!walls.has((level.board.width-1)+':'+y))errors.push('Нарушена внешняя оболочка.');
 return{ok:!errors.length,errors:[...new Set(errors)],checkedStates:states.length+2,rooms:level.rooms.length,loops:plan.edges.length-plan.nodes.length+1,junctions:plan.nodes.filter(n=>plan.edges.filter(e=>e.from===n.id||e.to===n.id).length>=3).length,branches:plan.nodes.filter(n=>n.role==='branch').length,shapes:[...new Set(level.rooms.map(r=>r.shape))],dimensions:[...new Set(level.rooms.map(r=>r.width+'x'+r.height))],maxConnectorLength:Math.max(...level.connections.map(c=>c.cells.length)),walkableCells:all.size,destructibleFeatures:level.features.filter(f=>f.destructible).length,solidFeatures:level.features.filter(f=>!f.destructible).length};
}
