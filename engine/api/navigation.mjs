import {transportNeighbors} from '../core/transports.mjs';
import {createEnvironmentState,setCircuitPower} from './environment.mjs';
import {roomContains} from '../core/space.mjs';
import {LabError} from './config.mjs';
import {createContentState,contentAction,contentBlockedCells,setpiecesOf} from './content-runtime.mjs';
const key=p=>`${p.x}:${p.y}`,near=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const levelOf=value=>value.level??value;
export function collisionWalls(value,{openedGateIds=[],brokenFeatureIds=[],blockedCells=[],content}={}) {
  const level=levelOf(value),opened=new Set(openedGateIds),broken=new Set(brokenFeatureIds);
  for(const id of opened)if(!level.gates.some(g=>g.id===id))throw new LabError('INVALID_STATE','Неизвестная открытая дверь.');
  for(const id of broken)if(!level.features.some(f=>f.id===id&&f.destructible))throw new LabError('INVALID_STATE','Можно разрушить только существующее разрушаемое укрытие.');
  const walls=new Set(level.board.walls.filter(w=>!opened.has(w.gateId)&&!broken.has(w.featureId)).map(key));
  for(const p of contentBlockedCells(value,content))walls.add(key(p));
  if(!Array.isArray(blockedCells)||blockedCells.length>250000)throw new LabError('INVALID_STATE','Неверные дополнительные препятствия.');
  for(const p of blockedCells){if(!Number.isInteger(p?.x)||!Number.isInteger(p?.y)||p.x<0||p.y<0||p.x>=level.board.width||p.y>=level.board.height)throw new LabError('INVALID_STATE','Препятствие вне карты.');walls.add(key(p));}
  return walls;
}
function footprintOf(state){const f=state.footprint??{width:1,height:1};if(!Number.isInteger(f.width)||!Number.isInteger(f.height)||f.width<1||f.height<1||f.width>8||f.height>8)throw new LabError('INVALID_STATE','Размер существа: 1–8 клеток по каждой стороне.');return f;}
function fits(level,p,walls,footprint){if(!Number.isInteger(p?.x)||!Number.isInteger(p?.y)||p.x<0||p.y<0||p.x+footprint.width>level.board.width||p.y+footprint.height>level.board.height)return false;for(let y=p.y;y<p.y+footprint.height;y++)for(let x=p.x;x<p.x+footprint.width;x++)if(walls.has(`${x}:${y}`))return false;return true;}
export function isWalkable(value,point,state={}) {
  const level=levelOf(value);return fits(level,point,collisionWalls(value,state),footprintOf(state));
}
export function findPath(value,from,to,state={}) {
  const level=levelOf(value),walls=collisionWalls(value,state),footprint=footprintOf(state);
  const valid=p=>fits(level,p,walls,footprint);
  if(!valid(from)||!valid(to))return null;
  const queue=[{...from}],previous=new Map([[key(from),null]]);
  for(let i=0;i<queue.length;i++){
    const p=queue[i];if(key(p)===key(to)){const path=[];for(let q=p;q;q=previous.get(key(q)))path.push(q);return path.reverse();}
    for(const q of [...[[0,-1],[1,0],[0,1],[-1,0]].map(([dx,dy])=>({x:p.x+dx,y:p.y+dy})),...transportNeighbors(level,p)]){if(valid(q)&&!previous.has(key(q))){previous.set(key(q),p);queue.push(q);}}
  }
  return null;
}
export function findFootprint(value,roomId,{width=3,height=3,avoidProtected=true,occupied=[],...state}={}){
  const level=levelOf(value),room=level.rooms.find(r=>r.id===roomId);if(!room)throw new LabError('INVALID_STATE','Неизвестная комната.');
  const footprint=footprintOf({footprint:{width,height}}),walls=collisionWalls(value,{...state,blockedCells:[...(state.blockedCells??[]),...occupied]}),floor=new Set(room.floorTiles.map(key)),reserved=new Set(level.protectedTiles),devices=new Set(level.mechanisms.map(m=>key(m.position)));
  const candidates=[...room.floorTiles].sort((a,b)=>near(a,room.core)-near(b,room.core)||a.y-b.y||a.x-b.x);
  for(const p of candidates){if(!fits(level,p,walls,footprint))continue;const cells=[];for(let y=p.y;y<p.y+height;y++)for(let x=p.x;x<p.x+width;x++)cells.push({x,y});if(cells.some(c=>!floor.has(key(c))||devices.has(key(c))||avoidProtected&&reserved.has(key(c))))continue;return{...p,width,height,cells};}
  return null;
}
export function createWalkthrough(value) {
  const level=levelOf(value);return{version:1,position:{...level.spawn},keys:[],pickedKeyIds:[],openedGateIds:[],brokenFeatureIds:[],levers:{},steps:0,finished:false,...(value.content?.environment?{environment:createEnvironmentState(value)}:{}),...(setpiecesOf(value)?{content:createContentState(value)}:{})};
}
export function stepWalkthrough(value,input,action) {
  const level=levelOf(value),next=structuredClone(input),reject=message=>({ok:false,state:input,message});
  try{
    let contentResult;
    if(action.type.startsWith('content-')){
      const result=contentAction(value,next.content,{...action,type:action.type.slice(8),position:next.position});if(!result.ok)return reject(result.message);next.content=result.state;
      if(['content-interact','content-destroy'].includes(action.type)){const tick=contentAction(value,next.content,{type:'tick',clock:'actions',amount:1});if(!tick.ok)return reject(tick.message);next.content=tick.state;result.events.push(...tick.events);if(tick.events.length)result.message=tick.message;}
      return{ok:true,state:next,message:result.message,events:result.events};
    }
    if(action.type==='travel'){
      const link=level.transportLinks?.find(t=>t.id===action.id);if(!link)return reject('Неизвестный переход.');
      const from=near(next.position,link.from)<=1?link.from:link.bidirectional&&near(next.position,link.to)<=1?link.to:null;
      if(!from)return reject('Нужно подойти к точке перехода.');const destination=from===link.from?link.to:link.from;
      if(!isWalkable(value,destination,next))return reject('Выход перехода перекрыт.');next.position={x:destination.x,y:destination.y};next.steps++;return{ok:true,state:next,message:'Переход выполнен.'};
    }
    if(action.type==='power'){
      const circuit=value.content?.environment?.circuits.find(c=>c.id===action.id);
      if(!circuit||near(next.position,circuit.control.anchor)>1)return reject('Нужно подойти к выключателю питания.');
      const result=setCircuitPower(value,next.environment??createEnvironmentState(value),circuit.id,!(next.environment?.power?.[circuit.id]??circuit.initiallyOn));next.environment=result.state;
      const tick=next.content?contentAction(value,next.content,{type:'tick',clock:'actions',amount:1}):null;if(tick&&!tick.ok)return reject(tick.message);if(tick)next.content=tick.state;
      return{ok:true,state:next,message:result.state.power[circuit.id]?'Питание жидкости включено.':'Питание жидкости выключено.',events:[...result.events,...(tick?.events??[])]};
    }
    if(action.type==='move'){
      if(!Number.isInteger(action.dx)||!Number.isInteger(action.dy)||Math.abs(action.dx)+Math.abs(action.dy)!==1)return reject('Перемещение — одна соседняя клетка.');
      const p={x:next.position.x+action.dx,y:next.position.y+action.dy};if(!isWalkable(value,p,next))return reject('Проход закрыт, затоплен или клетка занята стеной.');next.position=p;next.steps++;
      if(next.content){contentResult=contentAction(value,next.content,{type:'move',position:p});next.content=contentResult.state;}
    }else if(action.type==='interact'){
      const marker=level.mechanisms.find(m=>m.id===action.id),gate=level.gates.find(g=>g.id===action.id),target=marker?.position??gate?.position;
      if(!target||near(next.position,target)>1)return reject('Нужно подойти к устройству.');
      if(marker?.kind==='key'){
        if(next.pickedKeyIds.includes(marker.id))return reject('Ключ уже подобран.');next.keys.push(marker.id);next.pickedKeyIds.push(marker.id);
      }else if(marker?.kind==='lever'){
        const controlled=level.gates.find(g=>g.id===marker.edgeId);if(!controlled)return reject('Дверь рычага не найдена.');
        if(next.levers[marker.id]){if(near(next.position,controlled.position)===0)return reject('Проход занят.');next.openedGateIds=next.openedGateIds.filter(id=>id!==controlled.id);next.levers[marker.id]=false;}
        else{if(!next.openedGateIds.includes(controlled.id))next.openedGateIds.push(controlled.id);next.levers[marker.id]=true;}
      }else{
        if(next.openedGateIds.includes(gate.id))return reject('Дверь уже открыта.');
        if(gate.kind==='lever')return reject('Нужен связанный рычаг.');
        if(gate.kind==='breakable')return reject('Используйте «Разрушить».');
        if(gate.kind==='key'){if(!next.keys.includes(gate.keyId))return reject('Нужен соответствующий ключ.');next.keys=next.keys.filter(id=>id!==gate.keyId);}
        if(gate.kind==='one-way'){
          const edge=level.connections.find(e=>e.id===gate.id),room=level.rooms.find(r=>r.id===edge.from);
          if(!roomContains(room,next.position,{interior:true}))return reject('Дверь открывается с другой стороны.');
        }
        next.openedGateIds.push(gate.id);
      }
    }else if(action.type==='break'){
      const gate=level.gates.find(g=>g.id===action.id),feature=level.features.find(f=>f.id===action.id);
      if(gate?.kind==='breakable'&&near(next.position,gate.position)<=1){if(!next.openedGateIds.includes(gate.id))next.openedGateIds.push(gate.id);}
      else if(feature?.destructible&&feature.cells.some(p=>near(next.position,p)<=1)){if(!next.brokenFeatureIds.includes(feature.id))next.brokenFeatureIds.push(feature.id);}
      else return reject('Рядом нет выбранной разрушаемой преграды.');
    }else return reject('Неизвестное действие.');
    if(next.content&&action.type!=='move'){contentResult=contentAction(value,next.content,{type:'tick',clock:'actions',amount:1});if(!contentResult.ok)return reject(contentResult.message);next.content=contentResult.state;}
    const final=level.rooms.find(r=>r.id===level.plan.finalId);next.finished=key(next.position)===key(final.core);
    return{ok:true,state:next,message:next.finished?'Выход достигнут.':contentResult?.events.length?contentResult.message:action.type==='move'?'Шаг выполнен.':'Устройство сработало.',events:contentResult?.events??[]};
  }catch(error){return reject(error.message);}
}
