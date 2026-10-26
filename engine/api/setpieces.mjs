import {seededRandom} from '../core/random.mjs';
import {reachableRooms} from '../core/validation.mjs';
import {roomContains} from '../core/space.mjs';
import {CONTENT_TYPES,CONTENT_THEMES,GENRE_POLICIES,thematicOptions} from './content-catalog.mjs';
const key=p=>`${p.x}:${p.y}`,near=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y),dirs=[[0,-1],[1,0],[0,1],[-1,0]];

export function findRoomPath(room,from,to) {
  const floor=new Set(room.floorTiles.map(key)),seen=new Map([[key(from),null]]),queue=[from];
  if(!floor.has(key(from))||!floor.has(key(to)))return null;
  for(let i=0;i<queue.length;i++){
    const p=queue[i];if(key(p)===key(to)){const path=[];for(let q=p;q;q=seen.get(key(q)))path.push(q);return path.reverse();}
    for(const[dx,dy]of dirs){const q={x:p.x+dx,y:p.y+dy},k=key(q);if(floor.has(k)&&!seen.has(k)){seen.set(k,p);queue.push(q);}}
  }
  return null;
}

export function planSetpieces(level,content,options={}, {occupied=[],timingObstacles=[],excludedRooms=[]}={}) {
  const rules=thematicOptions(options),random=seededRandom((level.seed^0x52ae713b)>>>0);
  const walls=new Set(level.board.walls.map(key)),reserved=new Set(level.protectedTiles??[]);
  const devices=level.mechanisms??[],used=new Set([...content.hints,...occupied,...devices.map(m=>m.position),level.spawn].map(key));
  const freeRooms=new Set(reachableRooms(level.plan)),main=new Set(level.plan.mainPath),excluded=new Set(excludedRooms);
  const slots=[],zones=[],challenges=[],warnings=[],byId=new Map(level.rooms.map(r=>[r.id,r]));
  const floor=r=>r.floorTiles.filter(p=>!walls.has(key(p)));
  function place(room,typeId,extra={},target=room.core) {
    const available=floor(room).filter(p=>!used.has(key(p))&&!reserved.has(key(p))&&!devices.some(m=>near(m.position,p)<=1));
    const candidates=available.map(p=>({p,score:near(p,target)+random()})).sort((a,b)=>a.score-b.score);
    for(const {p}of candidates){
      const approach=dirs.map(([dx,dy])=>({x:p.x+dx,y:p.y+dy})).filter(q=>roomContains(room,q,{interior:true})&&!walls.has(key(q))&&!used.has(key(q)));
      if(!approach.length)continue;
      const d=CONTENT_TYPES[typeId],slot={id:`slot-${slots.length+1}`,roomId:room.id,typeId,category:d.category,name:d.name,material:d.material,anchor:{...p},cells:[{...p}],footprint:{width:1,height:1},approach,placement:'floor',collision:'soft',destructible:d.destructible,interaction:d.interaction,tags:[rules.theme,d.category],...extra};
      slots.push(slot);used.add(key(p));for(const q of approach)used.add(key(q));return slot;
    }
    return null;
  }
  // Conditional rooms are optional leaves. Their controller is outside the
  // affected room in a room already reachable with all ordinary gates closed.
  const leaves=level.rooms.filter(r=>!main.has(r.id)&&!excluded.has(r.id)&&!['boss','start','final'].includes(r.role)&&!devices.some(m=>m.roomId===r.id)&&level.plan.edges.filter(e=>e.from===r.id||e.to===r.id).length===1);
  for(const room of leaves){
    const edge=level.plan.edges.find(e=>e.from===room.id||e.to===room.id),other=byId.get(edge.from===room.id?edge.to:edge.from);
    if(edge.kind==='one-way'||!other||!freeRooms.has(other.id)||excluded.has(other.id)||zones.some(z=>z.roomId===other.id))continue;
    const flooded=random()<rules.floodFrequency,ability=!flooded&&random()<rules.abilityFrequency;
    if(!flooded&&!ability)continue;
    const id=`zone-${zones.length+1}`,capability=flooded?'swim':GENRE_POLICIES[rules.genre].ability;
    const control=place(other,flooded?'drain-pump':'ability-cache',{controlsZoneId:id,grantCapability:ability?capability:null},room.core);
    if(!control){warnings.push(`Пропущена условная зона ${room.id}: нет доступного места под устройство.`);continue;}
    zones.push({id,roomId:room.id,type:flooded?'flood':'ability-seal',cells:floor(room).map(p=>({...p})),controllerId:control.id,requiredFlag:`cleared:${id}`,bypassCapability:capability,blocksMovement:true,optional:true,name:flooded?'Полностью затопленная комната':'Проход для способности'});
  }
  const palette=Object.entries(CONTENT_TYPES).filter(([,d])=>d.themes.includes(rules.theme)).map(([id])=>id);
  for(const room of level.rooms){
    if(['start','final','boss'].includes(room.role))continue;
    const count=Math.min(6,Math.round(Math.sqrt(room.floorTiles.length)/5*rules.propDensity));
    for(let i=0;i<count;i++)place(room,rules.theme==='sci-fi'&&room.purpose==='laboratory'&&i<2?['research-console','glass-vials'][i]:palette[Math.floor(random()*palette.length)]);
    if(excluded.has(room.id)||zones.some(z=>z.roomId===room.id)||room.doors.length<2||random()>=rules.timedFrequency)continue;
    // Measure the route INSIDE the room, not a graph shortcut through a neighbour.
    // Encounters are removed from traversal trials by the adapter. Only lasting
    // hazards/devices count toward the calibrated shortest route.
    const obstacleKeys=new Set(timingObstacles.map(key)),obstacles=floor(room).filter(p=>obstacleKeys.has(key(p)));
    const timingRoom={...room,floorTiles:floor(room).filter(p=>!obstacleKeys.has(key(p)))};let route=null;
    for(let i=0;i<room.doors.length;i++)for(const door of room.doors.slice(i+1)){
      const p=findRoomPath(timingRoom,room.doors[i].inside,door.inside);if(p&&p.length>2&&(!route||p.length>route.length))route=p;
    }
    if(!route)continue;
    const minimumActions=route.length-1,errorAllowance=2+Math.floor(random()*2),policy=GENRE_POLICIES[rules.genre];
    challenges.push({id:`challenge-${challenges.length+1}`,roomId:room.id,type:'timed-crossing',name:'Испытание быстрого прохода',entry:route[0],goal:route.at(-1),route,obstacles,clock:policy.clock,minimumActions,errorAllowance,cellsPerSecond:policy.cellsPerSecond,reactionSeconds:2,budget:policy.clock==='actions'?minimumActions+errorAllowance:Math.ceil((minimumActions+errorAllowance)/policy.cellsPerSecond+2),onSuccess:'reward',onFailure:'alarm',retry:true,blocksExit:false});
  }
  return{version:1,genre:rules.genre,theme:rules.theme,slots,zones,challenges,warnings,note:'Семантические места и сценарии. Адаптер задаёт графику, коллизии soft-объектов, физику, боевые эффекты и стоимость действий.'};
}

export function setpieceErrors(level,data){
  const errors=[],rooms=new Map(level.rooms.map(r=>[r.id,r])),walls=new Set(level.board.walls.map(key)),ids=new Set(),main=new Set(level.plan.mainPath),free=reachableRooms(level.plan);
  const fail=(test,message)=>{if(!test)errors.push(message);},point=p=>Number.isInteger(p?.x)&&Number.isInteger(p?.y)&&p.x>=0&&p.y>=0&&p.x<level.board.width&&p.y<level.board.height;
  if(!data||data.version!==1||!Object.hasOwn(GENRE_POLICIES,data.genre)||!CONTENT_THEMES.includes(data.theme)||!Array.isArray(data.slots)||!Array.isArray(data.zones)||!Array.isArray(data.challenges)||data.slots.length>1500||data.zones.length>120||data.challenges.length>120)return['Неверный план тематического окружения.'];
  const anchors=new Set(),zoneRooms=new Set(),trialRooms=new Set();
  const unique=id=>{const okay=typeof id==='string'&&id.length>0&&id.length<=96&&!ids.has(id);ids.add(id);return okay;};
  for(const s of data.slots){
    const room=rooms.get(s.roomId),definition=CONTENT_TYPES[s.typeId];
    fail(unique(s.id)&&room&&definition&&s.category===definition.category&&s.material===definition.material&&s.interaction===definition.interaction&&s.destructible===definition.destructible&&s.collision==='soft'&&s.placement==='floor'&&typeof s.name==='string'&&s.name.length<=160,'Неверный тип/идентификатор места окружения.');
    fail(room&&point(s.anchor)&&roomContains(room,s.anchor,{interior:true})&&!walls.has(key(s.anchor)),'Место окружения в стене или вне комнаты.');
    fail(Array.isArray(s.cells)&&s.cells.length===1&&point(s.cells[0])&&key(s.cells[0])===key(s.anchor)&&s.footprint?.width===1&&s.footprint.height===1,'Неверная область объекта.');
    fail(Array.isArray(s.approach)&&s.approach.length>0&&s.approach.length<=4&&s.approach.every(p=>point(p)&&room&&roomContains(room,p,{interior:true})&&!walls.has(key(p))&&near(p,s.anchor)===1),'Нет подхода к окружению.');
    if(point(s.anchor)){fail(!anchors.has(key(s.anchor)),'Объекты окружения пересекаются.');anchors.add(key(s.anchor));}
    if(s.controlsZoneId)fail(data.zones.some(z=>z.id===s.controlsZoneId&&z.controllerId===s.id),'Устройство ссылается на отсутствующую зону.');
  }
  for(const z of data.zones){
    const room=rooms.get(z.roomId),edges=level.plan.edges.filter(e=>e.from===z.roomId||e.to===z.roomId),control=data.slots.find(s=>s.id===z.controllerId);
    fail(unique(z.id)&&room&&!main.has(z.roomId)&&edges.length===1&&edges[0].kind!=='one-way'&&z.optional===true&&z.blocksMovement===true&&['flood','ability-seal'].includes(z.type),'Условная комната перекрывает обязательный маршрут или имеет неверную связь.');
    const neighbor=edges[0]&&(edges[0].from===z.roomId?edges[0].to:edges[0].from);
    fail(control&&control.controlsZoneId===z.id&&control.roomId===neighbor&&free.has(control.roomId)&&!data.zones.some(other=>other.roomId===control.roomId),'Устройство затопления/способности недоступно снаружи.');
    const capability=z.type==='flood'?'swim':GENRE_POLICIES[data.genre].ability;
    fail(z.requiredFlag===`cleared:${z.id}`&&z.bypassCapability===capability&&control?.typeId===(z.type==='flood'?'drain-pump':'ability-cache')&&control?.grantCapability===(z.type==='flood'?null:capability),'Неверное условие зоны.');
    fail(!zoneRooms.has(z.roomId),'Две условные зоны в одной комнате.');zoneRooms.add(z.roomId);
    fail(room&&Array.isArray(z.cells)&&z.cells.length===room.floorTiles.length&&new Set(z.cells.map(key)).size===z.cells.length&&z.cells.every(p=>point(p)&&roomContains(room,p,{interior:true})&&!walls.has(key(p))),'Условная зона должна занимать пол комнаты.');
  }
  for(const c of data.challenges){
    const room=rooms.get(c.roomId),policy=GENRE_POLICIES[data.genre];
    fail(unique(c.id)&&room&&c.type==='timed-crossing'&&c.clock===policy.clock&&c.blocksExit===false&&c.retry===true&&c.onSuccess==='reward'&&c.onFailure==='alarm','Неверный сценарий испытания.');
    fail(!zoneRooms.has(c.roomId)&&!trialRooms.has(c.roomId)&&!['start','final','boss'].includes(room?.role),'Недопустимая комната испытания.');trialRooms.add(c.roomId);
    fail(room?.doors.some(d=>point(c.entry)&&key(d.inside)===key(c.entry))&&room?.doors.some(d=>point(c.goal)&&key(d.inside)===key(c.goal)),'Испытание должно связывать два входа комнаты.');
    const route=c.route;fail(Array.isArray(route)&&route.length>=3&&route.length<=level.board.width*level.board.height&&route.every((p,i)=>point(p)&&room&&roomContains(room,p,{interior:true})&&!walls.has(key(p))&&(!i||near(p,route[i-1])===1)),'Неверный маршрут испытания.');
    if(Array.isArray(route)&&route.length){fail(point(c.entry)&&point(c.goal)&&key(c.entry)===key(route[0])&&key(c.goal)===key(route.at(-1))&&c.minimumActions===route.length-1&&[2,3].includes(c.errorAllowance)&&c.cellsPerSecond===policy.cellsPerSecond&&c.reactionSeconds===2&&c.budget===(c.clock==='actions'?c.minimumActions+c.errorAllowance:Math.ceil((c.minimumActions+c.errorAllowance)/c.cellsPerSecond+2)),'Неверный бюджет или границы испытания.');
      if(Array.isArray(c.obstacles)&&c.obstacles.length<=room?.floorTiles.length&&c.obstacles.every(p=>point(p)&&roomContains(room,p,{interior:true}))){const blocked=new Set(c.obstacles.map(key)),actual=findRoomPath({...room,floorTiles:room.floorTiles.filter(p=>!blocked.has(key(p)))},c.entry,c.goal);fail(actual?.length===route.length,'Бюджет испытания рассчитан не по кратчайшему пути.');}else errors.push('Неверные препятствия испытания.');
    }
  }
  return [...new Set(errors)];
}
