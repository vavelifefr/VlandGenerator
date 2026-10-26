// Roles on two existing, physically open arcs. Never invent a connection or
// turn an optional mechanism into a requirement of the main route.
export const ROUTE_PATTERNS=Object.freeze({
 'risk-reward':Object.freeze({name:'Риск и награда / укрытия',roles:['pressure','cover']}),
 'quiet-bypass':Object.freeze({name:'Открытая дорога / тихий обход',roles:['exposed','quiet']}),
 'cache-or-sprint':Object.freeze({name:'Сбор припасов / быстрый проход',roles:['scavenge','sprint']}),
 'engineering-detour':Object.freeze({name:'Служебный сектор / спокойный обход',roles:['engineering','detour']}),
 'range-or-cover':Object.freeze({name:'Дальний бой / тесные укрытия',roles:['long-range','close-range']}),
 'recovery-risk':Object.freeze({name:'Восстановление / полоса риска',roles:['recovery','gauntlet']})
});
export const ROUTE_ROLES=Object.freeze({
 pressure:Object.freeze({name:'Риск и награда',danger:1.35,traps:1.3,loot:1.6,cover:.65,color:'#9b5b53'}),
 cover:Object.freeze({name:'Путь с укрытиями',danger:.7,traps:.5,loot:1,cover:1.4,color:'#4c8270'}),
 exposed:Object.freeze({name:'Открытая дорога',danger:1.15,traps:1,loot:1,cover:.55,color:'#9b7c48'}),
 quiet:Object.freeze({name:'Тихий обход',danger:.4,traps:.2,loot:.6,cover:1.35,color:'#567c99'}),
 scavenge:Object.freeze({name:'Поиск припасов',danger:.65,traps:.7,loot:1.8,cover:1.1,color:'#7f8957'}),
 sprint:Object.freeze({name:'Быстрый проход',danger:1.1,traps:0,loot:.3,cover:.55,color:'#8b6d53'}),
 engineering:Object.freeze({name:'Техническая зона',danger:.85,traps:1.2,loot:1.2,cover:1.4,color:'#678783'}),
 detour:Object.freeze({name:'Спокойный обход',danger:.45,traps:.2,loot:.7,cover:1.3,color:'#5d7e8f'}),
 'long-range':Object.freeze({name:'Дальние дистанции',danger:1.15,traps:.4,loot:1.2,cover:.45,color:'#927161'}),
 'close-range':Object.freeze({name:'Ближние укрытия',danger:.9,traps:1.3,loot:1,cover:1.7,color:'#6e7760'}),
 recovery:Object.freeze({name:'Мягкий участок',danger:.25,traps:0,loot:.8,cover:1.2,color:'#5a8b73'}),
 gauntlet:Object.freeze({name:'Полоса риска',danger:1.4,traps:1.6,loot:1.6,cover:.8,color:'#9d6263'})
});
for(const pattern of Object.values(ROUTE_PATTERNS))Object.freeze(pattern.roles);
const path=(plan,from,to,omit)=>{
 const queue=[from],previous=new Map([[from,null]]);
 for(let i=0;i<queue.length;i++){
  const id=queue[i];if(id===to){const result=[];for(let p=id;p!==null;p=previous.get(p))result.unshift(p);return result;}
  for(const edge of plan.edges){if(edge===omit||edge.kind!=='open')continue;const next=edge.from===id?edge.to:edge.to===id?edge.from:null;if(next&&!previous.has(next)){previous.set(next,id);queue.push(next);}}
 }return null;
};
export function planRoutePatterns(plan,{limit=Math.max(1,Math.min(4,Math.floor(plan.nodes.length/5)))}={}){
 const patterns=[],occupied=new Set(),seen=new Set(),catalog=Object.keys(ROUTE_PATTERNS);
 for(const edge of plan.edges.filter(e=>e.kind==='open')){
  if(patterns.length>=limit)break;
  const cycle=path(plan,edge.from,edge.to,edge);if(!cycle||cycle.length<4)continue;
  const signature=[...cycle].sort().join('/');if(seen.has(signature))continue;seen.add(signature);
  const depths=cycle.map(id=>path(plan,plan.startId,id)?.length??Infinity),at=depths.indexOf(Math.min(...depths)),ring=[...cycle.slice(at),...cycle.slice(0,at)],middle=Math.floor(ring.length/2);
  const arcs=[ring.slice(0,middle+1),[ring[0],...ring.slice(middle).reverse()]];
  if(arcs.some(a=>a.slice(1,-1).some(id=>occupied.has(id)||[plan.startId,plan.finalId,plan.bossId].includes(id))))continue;
  arcs.sort((a,b)=>a.length-b.length||a.join('/').localeCompare(b.join('/')));
  const type=catalog[((plan.seed>>>0)+patterns.length)%catalog.length],definition=ROUTE_PATTERNS[type],id='route-pattern-'+(patterns.length+1);
  const branches=arcs.map((roomIds,i)=>({role:definition.roles[i],roomIds,edgeIds:roomIds.slice(1).map((to,j)=>plan.edges.find(e=>e.kind==='open'&&[e.from,e.to].includes(to)&&[e.from,e.to].includes(roomIds[j])).id)}));
  patterns.push({id,type,name:definition.name,entryRoomId:ring[0],exitRoomId:ring[middle],branches});
  for(const branch of branches)for(const roomId of branch.roomIds.slice(1,-1))occupied.add(roomId);
 }return patterns;
}
export function roomRouteRole(plan,roomId){
 for(const pattern of plan.routePatterns??[])for(const branch of pattern.branches)if(branch.roomIds.slice(1,-1).includes(roomId))return{patternId:pattern.id,role:branch.role,...ROUTE_ROLES[branch.role]};
 return null;
}
export function routePatternErrors(plan){
 if(plan.routePatterns===undefined)return[];
 if(!Array.isArray(plan.routePatterns)||plan.routePatterns.length>4)return['routePatterns: массив не более4 циклов.'];
 const ids=new Set(),used=new Set(),errors=[];
 for(const p of plan.routePatterns){
  if(!p||typeof p.id!=='string'||ids.has(p.id)||!Object.hasOwn(ROUTE_PATTERNS,p.type)||!Array.isArray(p.branches)||p.branches.length!==2){errors.push('Некорректный сценарный цикл.');continue;}ids.add(p.id);
  const roles=ROUTE_PATTERNS[p.type].roles;
  for(const [i,b]of p.branches.entries()){
   if(!b||b.role!==roles[i]||!Array.isArray(b.roomIds)||b.roomIds.length<3||b.roomIds.length>120||new Set(b.roomIds).size!==b.roomIds.length||!Array.isArray(b.edgeIds)||b.edgeIds.length!==b.roomIds.length-1||b.roomIds[0]!==p.entryRoomId||b.roomIds.at(-1)!==p.exitRoomId){errors.push('Некорректная дуга сценарного цикла.');continue;}
   for(let j=0;j<b.edgeIds.length;j++){const e=plan.edges.find(e=>e.id===b.edgeIds[j]);if(!e||e.kind!=='open'||!([e.from,e.to].includes(b.roomIds[j])&&[e.from,e.to].includes(b.roomIds[j+1])))errors.push('Дуга цикла содержит отсутствующую или закрытую связь.');}
   for(const id of b.roomIds.slice(1,-1)){if(used.has(id)||[plan.startId,plan.finalId,plan.bossId].includes(id))errors.push('Внутренняя комната цикла занята другой ролью или обязательной конечной точкой.');used.add(id);}
  }
 }return[...new Set(errors)];
}
