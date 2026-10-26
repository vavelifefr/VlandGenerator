import {corridorSettings} from '../core/corridors.mjs';
import {ROUTE_ROLES} from '../core/route-patterns.mjs';
import {validateLevel} from '../core/validation.mjs';
const round=n=>Math.round(n*1000)/1000;
function walk(plan,from,{omitNode=null,omitEdge=null,openOnly=false,to=null}={}){
 const previous=new Map(),queue=[];if(from!==omitNode){previous.set(from,null);queue.push(from);}
 for(let i=0;i<queue.length;i++)for(const e of plan.edges){
  if(e.id===omitEdge||openOnly&&e.kind!=='open')continue;const next=e.from===queue[i]?e.to:e.to===queue[i]?e.from:null;
  if(next&&next!==omitNode&&!previous.has(next)){previous.set(next,queue[i]);queue.push(next);}
 }
 let path=null;if(to&&previous.has(to)){path=[];for(let id=to;id!==null;id=previous.get(id))path.unshift(id);}
 return{reached:new Set(queue),path};
}
export function levelSignature(level){
 const m=level.quality.metrics,n=level.rooms.length;
 return{loopDensity:round(m.loops/Math.max(1,n)),mainCoverage:m.mainCoverage,junctionRatio:round(m.junctions/n),fillRatio:m.fillRatio,
  shapeDiversity:round(m.shapeTypes/Math.max(1,Math.min(20,n-2))),sizeDiversity:round(m.sizeTypes/Math.max(1,n-2)),
  branchRatio:round(level.rooms.filter(r=>r.role==='branch').length/n),nestedRatio:round(m.nestedRooms/n),
  coverRatio:round(level.features.reduce((s,f)=>s+f.cells.length,0)/Math.max(1,level.rooms.reduce((s,r)=>s+r.floorArea,0)))};
}
export function signatureDistance(a,b){const keys=Object.keys(a);return round(Math.sqrt(keys.reduce((s,k)=>s+(a[k]-(b[k]??0))**2,0)/Math.max(1,keys.length)));}
export function compareCandidates(rows){
 const valid=rows.filter(r=>r.valid),archive=new Map();
 const enriched=rows.map(row=>{
  if(!row.valid)return{...row};const others=valid.filter(r=>r.index!==row.index);
  const novelty=others.length?round(others.reduce((s,r)=>s+signatureDistance(row.signature,r.signature),0)/others.length):0;
  const m=row.metrics,category=[m.loops===0?'tree':m.loops/Math.max(1,m.totalRooms)>.2?'many-loops':'some-loops',m.mainCoverage<.5?'short-route':'long-route',m.fillRatio<.4?'spread':'compact',m.shapeTypes<4?'few-shapes':'varied'].join('/');
  const record={...row,novelty,category},old=archive.get(category);if(!old||row.score>old.score)archive.set(category,record);return record;
 });
 return{candidates:enriched,archive:[...archive.values()].map(r=>({index:r.index,seed:r.seed,score:r.score,novelty:r.novelty,category:r.category})),
  note:'Категории и расстояние структурных признаков. Это разнообразие карт, не оценка качества боя.'};
}
export function diagnoseDungeon(input){
 const level=input.level??input,plan=level.plan;
 if(!Array.isArray(plan?.nodes)||plan.nodes.length>120||!Array.isArray(plan.edges)||plan.edges.length>512)throw new Error('Диагностике нужен проверенный уровень из2–120комнат.');
 const rooms=level.rooms,ids=plan.nodes.map(n=>n.id);
 const componentCount=omitNode=>{const all=new Set(ids.filter(id=>id!==omitNode));let count=0;while(all.size){const reached=walk(plan,all.values().next().value,{omitNode}).reached;count++;for(const id of reached)all.delete(id);}return count;};
 const components=componentCount(null),validation=validateLevel(level);
 const open=walk(plan,plan.startId,{openOnly:true,to:plan.finalId}),articulation=[],critical=[];
 for(const id of ids){
  if(componentCount(id)>components)articulation.push(id);
  if(id!==plan.startId&&id!==plan.finalId&&!walk(plan,plan.startId,{openOnly:true,omitNode:id}).reached.has(plan.finalId))critical.push(id);
 }
 const useful=plan.edges.map(e=>{const alternative=walk(plan,e.from,{omitEdge:e.id,openOnly:true,to:e.to}).path;return alternative&&e.kind==='open'?{edgeId:e.id,alternativeSteps:alternative.length-1,savedSteps:alternative.length-2}:null;}).filter(Boolean);
 const maxPassage=Math.max(0,...level.connections.map(c=>c.cells.length)),invalidPassages=level.connections.filter(c=>c.cells.length<corridorSettings(level.options?.corridors).minLength||c.cells.length>corridorSettings(level.options?.corridors).maxLength).map(c=>c.id);
 const routePatterns=(plan.routePatterns??[]).map(p=>({...p,branches:p.branches.map(b=>({...b,name:ROUTE_ROLES[b.role].name,
  rooms:b.roomIds.slice(1,-1).map(id=>{const content=input.content?.rooms.find(r=>r.roomId===id);return{roomId:id,features:level.features.filter(f=>f.roomId===id).length,...(content?{purpose:content.purpose,danger:content.danger,budget:content.budget}:{} )};})}))}));
 return{version:1,graph:{rooms:ids.length,edges:plan.edges.length,components,cycleRank:plan.edges.length-ids.length+components,articulationRoomIds:articulation,unavoidableRoomIds:critical},
  freeRoute:{reachable:!!open.path,roomIds:open.path??[],reachableRooms:open.reached.size},connections:{maxPassage,invalidPassages,usefulShortcuts:useful},signature:levelSignature(level),routePatterns,
  packing:structuredClone(level.packing),checks:[
   {id:'short-passages',ok:!invalidPassages.length,message:'Все проходы соответствуют заданному диапазону corridors.',relatedIds:invalidPassages},
   {id:'free-exit',ok:!!open.path,message:open.path?'Выход достижим по открытым связям.':'Нет свободного маршрута к выходу.',relatedIds:open.path??[]},
   {id:'geometry',ok:validation.ok,message:validation.ok?'Геометрия и зависимости повторно проверены.':validation.errors.join(' '),relatedIds:[]}],
  stages:[{id:'topology',name:'Граф и зависимости',count:plan.edges.length},{id:'packing',name:'Размещение и входы',count:rooms.length},{id:'geometry',name:'Маски и укрытия',count:level.features.length},{id:'content',name:'Наполнение',count:input.content?.hints.length??0}],
  note:'Неизбежные комнаты — точки, удаление которых разрывает свободный путь. Они могут быть намеренной частью дизайна. Анализ не симулирует физику и бой.'};
}
