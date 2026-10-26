import {roomContains} from '../core/space.mjs';
import {collisionWalls} from './navigation.mjs';
import {spawnerProgram,spawnerWave} from './spawner-program.mjs';
const key=p=>`${p.x}:${p.y}`,blocks=value=>(value.content?.population??value.population)?.placements.filter(p=>p.populationKind==='spawner')??[];
const initial=p=>({elapsed:0,emitted:0,destroyed:false,warned:false,activated:spawnerProgram(p.spawnRule).activation.type==='proximity',armed:false,delayElapsed:0,waveIndex:0,waveOffset:0});
export function createSpawnerState(value,{clock=value.content?.setpieces?.genre&&value.content.setpieces.genre!=='turn-based'?'seconds':'actions'}={}){
 if(!['actions','seconds'].includes(clock))throw new Error('Часы спавнеров: actions/seconds.');
 return{version:1,clock,blocks:Object.fromEntries(blocks(value).map(p=>[p.id,initial(p)]))};
}
export function stepSpawners(value,input,action,{actors=[],blockedCells=[],activeIds=null,content}={}){
 const reject=message=>({ok:false,state:input,events:[],message});
 try{
  const definitions=blocks(value),level=value.level??value;
  if(!input||input.version!==1||!['actions','seconds'].includes(input.clock)||!input.blocks||Object.keys(input.blocks).length!==definitions.length)return reject('Неверное состояние спавнеров.');
  const state=structuredClone(input),events=[];
  for(const p of definitions){const raw=state.blocks[p.id];if(!raw)return reject('Нет состояния блока.');const s={...initial(p),...raw},wave=spawnerWave(p.spawnRule,s.waveIndex);
   if(!Number.isFinite(s.elapsed)||s.elapsed<0||s.elapsed>p.spawnRule.period||!Number.isSafeInteger(s.emitted)||s.emitted<0||s.emitted>1000000||!['destroyed','warned','activated','armed'].every(k=>typeof s[k]==='boolean')||!Number.isFinite(s.delayElapsed)||s.delayElapsed<0||s.delayElapsed>60||!Number.isSafeInteger(s.waveIndex)||s.waveIndex<0||s.waveIndex>1000000||!Number.isInteger(s.waveOffset)||s.waveOffset<0||s.waveOffset>=(wave?.length??1))return reject('Неверное состояние спавнеров.');state.blocks[p.id]=s;
  }
  if(['destroy','activate'].includes(action?.type)){
   const p=definitions.find(p=>p.id===action.id),target=action.type==='activate'?p?.controller:p;
   if(!p||!target||!Number.isInteger(action.position?.x)||!Number.isInteger(action.position?.y)||Math.abs(target.x-action.position.x)+Math.abs(target.y-action.position.y)>1||state.blocks[p.id].destroyed)return reject('Спавнер или его рычаг недоступен.');
   const s=state.blocks[p.id];if(action.type==='activate'){if(spawnerProgram(p.spawnRule).activation.type!=='lever'||s.activated)return reject('Этот спавнер нельзя включить повторно.');s.activated=s.armed=true;}else s.destroyed=true;
   events.push({type:action.type==='activate'?'spawner-activated':'spawner-destroyed',id:p.id,position:{x:target.x,y:target.y},roomId:p.roomId});return{ok:true,state,events,message:action.type==='activate'?'Рычаг запустил спавнер.':'Спавнер уничтожен.'};
  }
  if(action?.type!=='tick'||action.clock!==state.clock||!Number.isFinite(action.amount)||action.amount<0||action.amount>60||state.clock==='actions'&&!Number.isInteger(action.amount)||action.position!==undefined&&(!Number.isInteger(action.position.x)||!Number.isInteger(action.position.y)))return reject('Неверный шаг часов спавнера.');
  const living=actors.filter(a=>a.hp===undefined||a.hp>0),walls=collisionWalls(value,{content,blockedCells:[...blockedCells,...living,...definitions,...definitions.filter(p=>p.controller).flatMap(p=>[p.controller,...p.controller.approach])]}),reserved=new Set(level.protectedTiles??[]),active=activeIds===null?null:new Set(activeIds);
  for(const p of definitions){
   const s=state.blocks[p.id],rule=p.spawnRule,program=spawnerProgram(rule),room=level.rooms.find(r=>r.id===p.roomId);if(s.destroyed||rule.totalLimit&&s.emitted>=rule.totalLimit||!spawnerWave(rule,s.waveIndex))continue;
   if(!s.armed&&!s.activated&&['room-entry','timer'].includes(program.activation.type)&&action.amount>0&&action.position&&roomContains(room,action.position,{interior:true})){
    s.armed=true;s.activated=program.activation.type==='room-entry'||program.activation.delay===0;
    events.push({type:s.activated?'spawner-activated':'spawner-armed',id:p.id,roomId:p.roomId,position:{x:p.x,y:p.y}});continue;
   }
   if(active&&!active.has(p.id))continue;
   let amount=action.amount;
   if(!s.activated){if(!s.armed||program.activation.type!=='timer')continue;const needed=Math.max(0,program.activation.delay-s.delayElapsed),used=Math.min(needed,amount);s.delayElapsed+=used;amount-=used;if(s.delayElapsed<program.activation.delay)continue;s.activated=true;events.push({type:'spawner-activated',id:p.id,roomId:p.roomId,position:{x:p.x,y:p.y}});}
   let alive=living.filter(a=>a.spawnerId===p.id).length;s.elapsed=Math.min(rule.period+60,s.elapsed+amount);
   if(alive>=rule.aliveLimit){s.elapsed=Math.min(s.elapsed,rule.period);continue;}
   if(s.elapsed>=rule.period-1&&!s.warned){s.warned=true;events.push({type:'spawner-warning',id:p.id,position:{x:p.x,y:p.y},roomId:p.roomId,waveIndex:s.waveIndex});}
   while(s.elapsed>=rule.period&&alive<rule.aliveLimit&&(!rule.totalLimit||s.emitted<rule.totalLimit)){
    const wave=spawnerWave(rule,s.waveIndex);if(!wave)break;
    const queue=[{x:p.x,y:p.y,depth:0}],seen=new Set([key(p)]),free=[];
    for(let i=0;i<queue.length;i++){const q=queue[i];if(q.depth>=2)continue;for(const[dx,dy]of[[0,-1],[1,0],[0,1],[-1,0]]){const n={x:q.x+dx,y:q.y+dy,depth:q.depth+1},k=key(n);if(!roomContains(room,n,{interior:true})||walls.has(k)||seen.has(k))continue;seen.add(k);queue.push(n);if(!reserved.has(k))free.push(n);}}
    const count=Math.min(wave.length-s.waveOffset,rule.aliveLimit-alive,rule.totalLimit?rule.totalLimit-s.emitted:wave.length,free.length);
    if(!count){s.elapsed=rule.period;break;}
    for(const cell of free.slice(0,count)){const mobId=wave[s.waveOffset++];s.emitted++;alive++;walls.add(key(cell));events.push({type:'spawner-spawn',id:`${p.id}-mob-${s.emitted}`,spawnerId:p.id,roomId:p.roomId,x:cell.x,y:cell.y,family:p.family,waveIndex:s.waveIndex,...(mobId?{mobId}:{})});}
    if(s.waveOffset<wave.length){s.elapsed=rule.period;break;}
    s.waveIndex++;s.waveOffset=0;s.elapsed-=rule.period;s.warned=false;
   }
   s.elapsed=Math.min(s.elapsed,rule.period);
  }
  return{ok:true,state,events,message:events.some(e=>e.type==='spawner-spawn')?'Спавнер выпустил мобов.':events.length?'Состояние спавнеров изменилось.':'Часы спавнеров обновлены.'};
 }catch(error){return reject(error.message);}
}
