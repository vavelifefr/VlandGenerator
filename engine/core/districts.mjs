import {seededRandom} from './random.mjs';
export const DISTRICT_TYPES=Object.freeze({
 utilities:Object.freeze({name:'Инженерный блок',color:'#77acbd',theme:'water',surface:'water',light:.9,families:['mechanical','human'],loot:['scrap','reagent']}),
 research:Object.freeze({name:'Исследовательское крыло',color:'#a3b780',theme:'chemical',surface:'poison',light:.8,families:['monster','mechanical'],loot:['reagent','mana_potion']}),
 security:Object.freeze({name:'Сектор охраны',color:'#ad9193',theme:'industrial',light:1,families:['human','mechanical'],loot:['class-ammo']}),
 logistics:Object.freeze({name:'Складской сектор',color:'#baa17c',theme:'fuel',surface:'oil',light:.85,families:['human'],loot:['scrap','health_potion']}),
 derelict:Object.freeze({name:'Заброшенное крыло',color:'#9993b0',theme:'abandoned',light:.65,families:['monster'],loot:['health_potion','reagent']})
});
for(const profile of Object.values(DISTRICT_TYPES)){Object.freeze(profile.families);Object.freeze(profile.loot);}
const affinity={pump:'utilities',laboratory:'research',control:'security',ambush:'security',vault:'logistics',arsenal:'logistics',secret:'derelict'};
export function graphDistances(plan,start,allowed=new Set(plan.nodes.map(n=>n.id))){
 const distances=new Map([[start,0]]),queue=[start];for(let i=0;i<queue.length;i++)for(const e of plan.edges){const id=e.from===queue[i]?e.to:e.to===queue[i]?e.from:null;if(id&&allowed.has(id)&&!distances.has(id)){distances.set(id,distances.get(queue[i])+1);queue.push(id);}}return distances;
}
// Frontier growth keeps each district connected. Endpoints inherit their neighbour.
export function assignDistricts(plan,{districts=true}={}){
 if(typeof districts!=='boolean')throw new Error('districts должен быть boolean.');
 for(const n of plan.nodes){delete n.districtId;delete n.districtKind;}
 plan.districts=[];if(!districts)return plan;
 const random=seededRandom((plan.seed^0x28c5e1a7)>>>0),ordinary=plan.nodes.filter(n=>!['start','final','boss'].includes(n.purpose)),pool=ordinary.length?ordinary:plan.nodes,allowed=new Set(pool.map(n=>n.id)),count=Math.min(5,Math.ceil(pool.length/4)),seeds=[];
 const first=pool.find(n=>n.purpose==='pump')??pool[Math.floor(random()*pool.length)];seeds.push(first);
 while(seeds.length<count){const distances=seeds.map(n=>graphDistances(plan,n.id,allowed)),choices=pool.filter(n=>!seeds.includes(n)).map(n=>({n,score:Math.min(...distances.map(d=>d.get(n.id)??1000))+(affinity[n.purpose]&&!seeds.some(s=>affinity[s.purpose]===affinity[n.purpose])?.3:0)+random()*.1})).sort((a,b)=>b.score-a.score);seeds.push(choices[0].n);}
 const kinds=Object.keys(DISTRICT_TYPES),used=new Set(),owners=new Map();
 for(const [i,seed]of seeds.entries()){
  const preferred=affinity[seed.purpose],kind=preferred&&!used.has(preferred)?preferred:kinds.filter(k=>!used.has(k))[Math.floor(random()*(kinds.length-used.size))];used.add(kind);
  const district={id:'district-'+(i+1),kind,name:DISTRICT_TYPES[kind].name,anchorId:seed.id,roomIds:[seed.id],neighbors:[]};plan.districts.push(district);owners.set(seed.id,district);
 }
 while(owners.size<pool.length){
  const candidates=[];for(const edge of plan.edges)for(const[from,to]of [[edge.from,edge.to],[edge.to,edge.from]])if(owners.has(from)&&allowed.has(to)&&!owners.has(to)){const owner=owners.get(from),node=pool.find(n=>n.id===to);candidates.push({to,owner,score:owner.roomIds.length+(affinity[node.purpose]===owner.kind?-.4:0)+random()*.2});}
  candidates.sort((a,b)=>a.score-b.score);const choice=candidates[0];if(!choice)throw new Error('Обычные комнаты районов не связаны.');owners.set(choice.to,choice.owner);choice.owner.roomIds.push(choice.to);
 }
 const pending=plan.nodes.filter(n=>!owners.has(n.id));for(let round=0;pending.length&&round<plan.nodes.length;round++)for(let i=pending.length-1;i>=0;i--){const n=pending[i],edge=plan.edges.find(e=>e.from===n.id&&owners.has(e.to)||e.to===n.id&&owners.has(e.from));if(edge){const owner=owners.get(edge.from===n.id?edge.to:edge.from);owners.set(n.id,owner);owner.roomIds.push(n.id);pending.splice(i,1);}}
 if(pending.length)throw new Error('Район не назначен изолированной комнате.');
 for(const n of plan.nodes){const d=owners.get(n.id);n.districtId=d.id;n.districtKind=d.kind;}
 for(const e of plan.edges){const a=owners.get(e.from),b=owners.get(e.to);if(a!==b){if(!a.neighbors.includes(b.id))a.neighbors.push(b.id);if(!b.neighbors.includes(a.id))b.neighbors.push(a.id);}}
 return plan;
}
export const districtProfile=room=>DISTRICT_TYPES[room?.districtKind];
export function districtErrors(plan){
 if(plan.districts===undefined)return[];if(!Array.isArray(plan.districts))return['Районы должны быть массивом.'];const errors=[],seen=new Set(),groupIds=new Set();
 for(const d of plan.districts){
  if(!d||!Array.isArray(d.roomIds)){errors.push('Неполный район.');continue;}
  if(!DISTRICT_TYPES[d.kind]||groupIds.has(d.id)||!d.roomIds.length||!d.roomIds.includes(d.anchorId))errors.push('Неверный район '+d.id);groupIds.add(d.id);
  const allowed=new Set(d.roomIds),reached=graphDistances(plan,d.anchorId,allowed);if(reached.size!==allowed.size)errors.push('Разорван район '+d.id);
  for(const id of d.roomIds){const node=plan.nodes.find(n=>n.id===id);if(seen.has(id)||!node||node.districtId!==d.id||node.districtKind!==d.kind)errors.push('Неверная принадлежность району '+id);seen.add(id);}
 }
 if(plan.districts.length&&seen.size!==plan.nodes.length)errors.push('Не все комнаты имеют район.');return errors;
}
