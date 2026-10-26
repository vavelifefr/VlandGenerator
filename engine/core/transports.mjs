import {seededRandom} from './random.mjs';
import {transportSettings} from './transport-settings.mjs';
const key=p=>p.x+':'+p.y;
// Only open bridges outside the main route may become isolated. Disjoint
// components get independent paired links; geometry never grows a long corridor.
export function isolateOptionalRoom(level){
 if(!level.options.allowDisconnected)return level;
 const settings=transportSettings(level.options.transports),{plan}=level,main=new Set(plan.mainPath??[]),nested=new Set((level.packing?.nests??[]).map(n=>n.edgeId));
 const initiallyFree=new Set([plan.startId]),freeQueue=[plan.startId];for(let i=0;i<freeQueue.length;i++)for(const e of plan.edges.filter(e=>e.kind==='open')){const id=e.from===freeQueue[i]?e.to:e.to===freeQueue[i]?e.from:null;if(id&&!initiallyFree.has(id)){initiallyFree.add(id);freeQueue.push(id);}}
 let candidates=plan.edges.filter(e=>e.kind==='open'&&!nested.has(e.id)).flatMap(edge=>{
  const reached=new Set([edge.from]),q=[edge.from];for(let i=0;i<q.length;i++)for(const e of plan.edges){if(e.id===edge.id)continue;const id=e.from===q[i]?e.to:e.to===q[i]?e.from:null;if(id&&!reached.has(id)){reached.add(id);q.push(id);}}
  if(reached.has(edge.to))return[];
  const sides=[[...reached],plan.nodes.filter(n=>!reached.has(n.id)).map(n=>n.id)];
  const isolated=sides.find(ids=>ids.length&&ids.length<=settings.maxRoomsPerGroup&&ids.every(id=>!main.has(id)&&![plan.startId,plan.finalId,plan.bossId].includes(id)));
  return isolated&&initiallyFree.has(isolated.includes(edge.from)?edge.to:edge.from)?[{isolated,edge}]:[];
 });
 level.transportLinks=[];level.isolation={enabled:true,isolatedRoomIds:[],groups:[]};
 if(!candidates.length){level.isolation.reason='Нет бокового участка с отдельным открытым входом; основной путь не изолируется.';return level;}
 const random=seededRandom((plan.seed^0x1b705d9a)>>>0),byId=new Map(level.rooms.map(r=>[r.id,r]));
 const occupied=new Set(level.mechanisms.map(m=>key(m.position)));
 const endpoint=roomId=>{const r=byId.get(roomId),unsafe=new Set(['pool','lake'].includes(r.interiorTemplate?.type)?r.interiorTemplate.cells.map(key):[]),p=[...r.floorTiles].filter(p=>!occupied.has(key(p))&&!unsafe.has(key(p))).sort((a,b)=>Math.abs(a.x-r.core.x)+Math.abs(a.y-r.core.y)-Math.abs(b.x-r.core.x)-Math.abs(b.y-r.core.y)||a.y-b.y||a.x-b.x)[0];if(!p)throw new Error('Нет места для перехода в '+roomId);occupied.add(key(p));return{roomId,...p};};
 for(let i=0;i<settings.maxGroups&&candidates.length;i++){
  const candidate=candidates.splice(Math.floor(random()*candidates.length),1)[0];if(settings.chance<1&&random()>=settings.chance)continue;
  const {isolated,edge}=candidate,connection=level.connections.find(c=>c.id===edge.id),link={id:'transport-'+edge.id,edgeId:edge.id,kind:'teleport',bidirectional:true,automatic:true,travelCost:settings.travelCost,from:endpoint(edge.from),to:endpoint(edge.to)};
  const closed=connection.footprintCells??[connection.fromDoor,...connection.cells,connection.toDoor],walls=new Map(level.board.walls.map(w=>[key(w),w])),reserved=new Set(level.protectedTiles);
  for(const p of closed){walls.set(key(p),{...p,type:'bedrock'});reserved.delete(key(p));}
  for(const r of level.rooms)r.doors=r.doors.filter(d=>d.edgeId!==edge.id);
  level.connections=level.connections.filter(c=>c.id!==edge.id);level.corridor=level.connections.flatMap(c=>c.cells);level.board.walls=[...walls.values()];
  reserved.add(key(link.from));reserved.add(key(link.to));level.protectedTiles=[...reserved];level.transportLinks.push(link);level.isolation.isolatedRoomIds.push(...isolated);level.isolation.groups.push({edgeId:edge.id,roomIds:isolated,transportId:link.id});
  candidates=candidates.filter(c=>!c.isolated.some(id=>isolated.includes(id)));
 }
 if(!level.transportLinks.length)level.isolation.reason='Изоляция не выбрана по вероятности; все комнаты сохраняют физические проходы.';
 return level;
}

export function transportNeighbors(level,p){const result=[];for(const link of level.transportLinks??[]){if(key(link.from)===key(p))result.push(link.to);if(link.bidirectional&&key(link.to)===key(p))result.push(link.from);}return result;}

export function transportErrors(level,{externalTransports=[]}={}){
 const errors=[],external=level.externalTransports??[],links=[...(level.transportLinks??[]),...external],ids=new Set(),edges=new Set(),positions=new Set(),walls=new Set(level.board.walls.map(key));
 let settings;try{settings=transportSettings(level.options?.transports);}catch(e){errors.push(e.message);return errors;}
 if(external.length&&JSON.stringify(external)!==JSON.stringify(externalTransports))errors.push('Внешние переходы требуют проверки в составе мира с реальными ярусами.');
 if(typeof(level.options?.allowDisconnected??false)!=='boolean')errors.push('allowDisconnected должен быть boolean.');
 if(links.length&&!level.options?.allowDisconnected)errors.push('Изолированные комнаты не разрешены настройками.');
 for(const link of links){const edge=level.plan.edges.find(e=>e.id===link.edgeId);
  if(ids.has(link.id)||edges.has(link.edgeId)||!edge||edge.kind!=='open'||!['teleport','lift','stairs'].includes(link.kind)||link.bidirectional!==true||link.from?.roomId!==edge.from||link.to?.roomId!==edge.to||level.connections.some(c=>c.id===link.edgeId)||link.automatic!==undefined&&link.automatic!==true||link.travelCost!==undefined&&(!Number.isFinite(link.travelCost)||link.travelCost<1||link.travelCost>1000)||external.includes(link)&&(!['stairs','lift'].includes(link.kind)||typeof link.worldLinkId!=='string')){errors.push('Неверная или повторная транспортная связь.');continue;}
  ids.add(link.id);edges.add(link.edgeId);
  for(const p of [link.from,link.to]){const room=level.rooms.find(r=>r.id===p.roomId);if(!room?.floorTiles.some(t=>key(t)===key(p))||walls.has(key(p))||!level.protectedTiles.includes(key(p))||positions.has(key(p))||level.mechanisms.some(m=>key(m.position)===key(p)))errors.push('Точка перехода должна находиться на защищённом свободном полу своей комнаты и не перекрывать другие устройства.');positions.add(key(p));}
 }
 if(links.length>settings.maxGroups)errors.push('Превышено заданное число изолированных участков.');
 if(links.length&&!settings.chance)errors.push('При нулевой вероятности изолированных участков быть не должно.');
 if(links.some(t=>t.automatic&&t.travelCost!==settings.travelCost))errors.push('Стоимость автоматического перехода не соответствует настройкам.');
 const reached=new Set([level.plan.startId]),queue=[level.plan.startId];for(let i=0;i<queue.length;i++)for(const e of level.plan.edges){if(edges.has(e.id))continue;const id=e.from===queue[i]?e.to:e.to===queue[i]?e.from:null;if(id&&!reached.has(id)){reached.add(id);queue.push(id);}}
 const isolated=level.rooms.filter(r=>!reached.has(r.id)).map(r=>r.id).sort();if(JSON.stringify(isolated)!==JSON.stringify([...(level.isolation?.isolatedRoomIds??[])].sort()))errors.push('Список изолированных комнат не соответствует физическим разрывам.');
 if(level.isolation?.groups){const groups=level.isolation.groups,rooms=groups.flatMap(g=>g.roomIds);if(groups.length!==links.length||new Set(rooms).size!==rooms.length||JSON.stringify([...rooms].sort())!==JSON.stringify([...level.isolation.isolatedRoomIds].sort())||groups.some(g=>g.roomIds.length<1||g.roomIds.length>settings.maxRoomsPerGroup||g.roomIds.some(id=>!level.rooms.some(r=>r.id===id)||level.plan.mainPath.includes(id))||!links.some(t=>t.id===g.transportId&&t.edgeId===g.edgeId)))errors.push('Состав изолированных участков не соответствует переходам или настройкам.');}
 return errors;
}
