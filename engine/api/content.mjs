import {planEnvironment} from './environment.mjs';
import {seededRandom} from '../core/random.mjs';
import {graphDistances} from '../core/districts.mjs';
import {roomContains} from '../core/space.mjs';
import {planSetpieces} from './setpieces.mjs';
import {planPopulation} from './population.mjs';
import {roomRouteRole} from '../core/route-patterns.mjs';
const key=p=>`${p.x}:${p.y}`,distance=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
export function planContent(level,options) {
  const random=seededRandom((level.seed^0x1a7c04e3)>>>0),walls=new Set(level.board.walls.map(key)),reserved=new Set(level.protectedTiles),used=new Set();
  const main=level.plan.mainPath??[],depth=graphDistances(level.plan,level.plan.startId),maxDepth=Math.max(1,...depth.values());
  const transportPoints=(level.transportLinks??[]).flatMap(t=>[t.from,t.to]);
  const blocked=new Set([...transportPoints.map(key),...level.mechanisms.map(m=>key(m.position)),...level.rooms.flatMap(r=>r.doors.flatMap(d=>[key(d),key(d.inside)])),key(level.spawn)]);
  for (const m of level.mechanisms) for(const[dx,dy]of[[0,0],[0,1],[0,-1],[1,0],[-1,0]]) blocked.add(key({x:m.position.x+dx,y:m.position.y+dy}));
  const hints=[],rooms=[];let combatStreak=0;
  const byId=new Map(level.rooms.map(r=>[r.id,r]));
  const order=[...main.map(id=>byId.get(id)).filter(Boolean),...level.rooms.filter(r=>!main.includes(r.id)).sort((a,b)=>(depth.get(a.id)??0)-(depth.get(b.id)??0)||level.rooms.indexOf(a)-level.rooms.indexOf(b))];
  function place(room,kind,count,{offRoute=false,nearCover=false}={}) {
    const free=room.floorTiles.filter(p=>roomContains(room,p,{interior:true})&&!walls.has(key(p))&&!blocked.has(key(p))&&!used.has(key(p))&&(!offRoute||!reserved.has(key(p))));
    const covers=level.features.filter(f=>f.roomId===room.id).flatMap(f=>f.cells);
    const ranked=free.map(p=>({p,score:random()+(nearCover&&covers.some(c=>distance(c,p)<=2)?2:0)})).sort((a,b)=>b.score-a.score);
    const chosen=[];for(const {p}of ranked){if(chosen.length>=count)break;if(chosen.some(q=>distance(p,q)<2))continue;chosen.push(p);used.add(key(p));hints.push({id:`hint-${hints.length+1}`,kind,roomId:room.id,...p});}
    return chosen.length;
  }
  for(const room of order) {
    const endpoint=room.id===level.plan.startId||room.id===level.plan.finalId,optional=room.role==='branch';
    const mainIndex=main.indexOf(room.id),progress=(depth.get(room.id)??0)/maxDepth;
    let purpose=room.id===level.plan.startId?'start':room.id===level.plan.finalId?'exit':room.role==='boss'?'boss':optional?'reward':combatStreak>=options.restEvery?'rest':random()<.18?'event':'combat';
    const routeRole=roomRouteRole(level.plan,room.id);
    if(routeRole&&!endpoint&&purpose!=='boss')purpose='combat';
    if(purpose==='combat')combatStreak++;else if(purpose==='rest')combatStreak=0;
    const danger=endpoint||purpose==='rest'?0:Math.round(Math.min(1,(options.intensity*(.45+.65*progress)+(optional?.1:0))*(routeRole?.danger??1))*100)/100;
    const area=room.floorTiles.length,budget=purpose==='boss'?Math.min(options.maxSpawnsPerRoom,1):purpose==='combat'?Math.min(options.maxSpawnsPerRoom,Math.max(0,Math.round(Math.sqrt(area)/3*danger*3))):0;
    const spawns=place(room,'enemy',budget,{offRoute:true,nearCover:true});
    const loot=place(room,'loot',endpoint?0:routeRole?.role==='pressure'?(options.lootDensity>0?Math.max(1,Math.round(options.lootDensity*3*routeRole.loot)):0):purpose==='reward'?Math.max(1,Math.round(options.lootDensity*3)):purpose==='rest'?1:random()<options.lootDensity*(routeRole?.loot??1)?1:0,{offRoute:true});
    const traps=place(room,'trap',endpoint||purpose==='rest'?0:Math.round(options.trapDensity*Math.sqrt(area)/3*(routeRole?.traps??1)),{offRoute:true});
    // Anchors are recommendations. Their occupied cells are distinct; they never
    // change walls or declare a blocking object on an obligatory route.
    const lights=place(room,'light',Math.max(1,Math.ceil(Math.sqrt(area)/options.lightSpacing)));
    rooms.push({roomId:room.id,purpose,optional,onMainPath:mainIndex>=0,depth:depth.get(room.id)??0,progress:Math.round(progress*100)/100,danger,area,budget:{enemies:spawns,loot,traps,lights},tags:[purpose,optional?'optional':'free',room.shape,room.districtKind??'unassigned',...(routeRole?['route:'+routeRole.role]:[])],...(routeRole?{routeRole:routeRole.role,routePatternId:routeRole.patternId}:{})});
  }
  const result={version:1,rooms,hints,legend:{enemy:'Рекомендуемая точка врага',loot:'Награда',trap:'Необязательная опасность вне защищённого пути',light:'Источник света'},note:'Точки и бюджеты для адаптера игры. Это не созданные игровые сущности и не симуляция боя.'};
  result.setpieces=planSetpieces(level,result,options,{occupied:[...transportPoints,...level.rooms.flatMap(r=>r.interiorTemplate?.cells??[])],excludedRooms:[...new Set(transportPoints.map(p=>p.roomId))]});
  const conditional=new Set([...result.setpieces.zones,...result.setpieces.challenges].map(z=>z.roomId));
  result.hints=result.hints.filter(h=>!conditional.has(h.roomId)||!['enemy','trap'].includes(h.kind));
  for(const r of result.rooms)if(conditional.has(r.roomId)){r.purpose='event';r.budget.enemies=r.budget.traps=0;r.tags.push('conditional');}
  const environment=planEnvironment(level,result,options);
  if(environment){result.environment=environment;result.hints=result.hints.filter(h=>h.kind!=='light').concat(environment.lights.map(l=>({id:'hint-'+l.id,kind:'light',roomId:l.roomId,...l.anchor,lightId:l.id})));}
  if(options.population?.enabled){
    const occupied=[...transportPoints,...result.hints.filter(h=>h.kind!=='enemy'),...result.setpieces.slots.flatMap(s=>[s.anchor,...s.approach]),...level.mechanisms.map(m=>m.position),...(result.environment?.circuits??[]).flatMap(c=>[c.control.anchor,...c.control.approach])];
    const excludedRooms=[...conditional,...result.rooms.filter(r=>['start','exit','rest'].includes(r.purpose)).map(r=>r.roomId)];
    result.legend.spawner='Производящий блок';
    result.population=planPopulation(level,options.population,{occupied,excludedRooms});
    result.hints=result.hints.filter(h=>h.kind!=='enemy');for(const p of result.population.placements)result.hints.push({id:p.id,kind:p.populationKind==='spawner'?'spawner':'enemy',roomId:p.roomId,x:p.x,y:p.y,populationKind:p.populationKind,family:p.family});
    for(const r of result.rooms)r.budget.enemies=result.hints.filter(h=>h.roomId===r.roomId&&h.kind==='enemy').length;
  }
  return result;
}
