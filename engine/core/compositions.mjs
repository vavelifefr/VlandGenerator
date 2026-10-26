import {seededRandom} from './random.mjs';
import {graphDistances} from './districts.mjs';
export const COMPOSITION_TYPES=Object.freeze({
 'hub-suite':{name:'Центральный зал и службы',shapes:['T','cross','rectangle'],pattern:'pillars'},
 'guarded-store':{name:'Пост охраны и хранилище',shapes:['L','rectangle','beveled'],pattern:'baffles'},
 'utility-suite':{name:'Машинный зал и обслуживание',shapes:['L','stepped','rectangle'],pattern:'islands'},
 'ring-complex':{name:'Квартал с круговым обходом',shapes:['beveled','courtyard','L'],pattern:'ruins'}
});
for(const profile of Object.values(COMPOSITION_TYPES)){Object.freeze(profile.shapes);Object.freeze(profile);}
export function assignCompositions(plan,{compositions=true}={}){
 if(typeof compositions!=='boolean')throw new Error('compositions должен быть boolean.');
 for(const n of plan.nodes)delete n.composition;plan.compositions=[];if(!compositions)return plan;
 const random=seededRandom((plan.seed^0x3e4290b1)>>>0),ordinary=plan.nodes.filter(n=>!['start','final','boss'].includes(n.purpose)),allowed=new Set(ordinary.map(n=>n.id)),used=new Set(),byId=new Map(plan.nodes.map(n=>[n.id,n]));
 const candidates=[],neighbors=id=>plan.edges.filter(e=>e.from===id||e.to===id).map(e=>({e,node:byId.get(e.from===id?e.to:e.from)})).filter(p=>allowed.has(p.node.id));
 for(const n of ordinary){
  const near=neighbors(n.id).sort((a,b)=>Number(b.node.districtId===n.districtId)-Number(a.node.districtId===n.districtId)||a.node.id.localeCompare(b.node.id));
  const open=near.filter(p=>p.e.kind==='open');
  if(open.length>=3)candidates.push({kind:'hub-suite',anchor:n.id,ids:[n.id,...open.slice(0,3).map(p=>p.node.id)],roles:['hall','service','service','service'],priority:2});
  if((['pump','control'].includes(n.purpose)||n.purpose==='chamber'&&random()<.4)&&near.length)candidates.push({kind:'utility-suite',anchor:n.id,ids:[n.id,near[0].node.id],roles:['machinery','service'],priority:1.5});
  if(['vault','arsenal','laboratory','secret','bonus'].includes(n.purpose)){
   const parent=near.find(p=>['key','lever','secret','breakable'].includes(p.e.kind));if(parent)candidates.push({kind:'guarded-store',anchor:parent.node.id,ids:[parent.node.id,n.id],roles:['guard','store'],priority:1.7});
  }
  for(const a of open)for(const b of neighbors(a.node.id).filter(p=>p.e.kind==='open'&&p.node!==n))for(const c of neighbors(b.node.id).filter(p=>p.e.kind==='open'&&p.node.id!==a.node.id&&p.node!==n))if(neighbors(c.node.id).some(p=>p.e.kind==='open'&&p.node===n)){
   const ids=[n.id,a.node.id,b.node.id,c.node.id];if(new Set(ids).size===4)candidates.push({kind:'ring-complex',anchor:n.id,ids,roles:['court','gallery','gallery','gallery'],priority:2.1});
  }
 }
 for(const c of candidates)c.score=c.priority+new Set(c.ids.map(id=>byId.get(id).districtId)).size*-.2+random()*.8;
 candidates.sort((a,b)=>b.score-a.score);const limit=Math.max(1,Math.floor(ordinary.length/2));
 for(const c of candidates){if(plan.compositions.length>=limit)break;if(c.ids.some(id=>used.has(id)))continue;
  const type=COMPOSITION_TYPES[c.kind],composition={id:'composition-'+(plan.compositions.length+1),kind:c.kind,name:type.name,anchorId:c.anchor,roomIds:c.ids,edgeIds:plan.edges.filter(e=>c.ids.includes(e.from)&&c.ids.includes(e.to)).map(e=>e.id)};
  plan.compositions.push(composition);
  for(const[id,role]of c.ids.map((id,i)=>[id,c.roles[i]])){used.add(id);byId.get(id).composition={id:composition.id,kind:c.kind,role,preferredShapes:[...type.shapes],featurePattern:type.pattern,formation:role==='guard'?'entrances':role==='hall'||role==='machinery'?'cover':'spread'};}
 }
 return plan;
}
export function compositionErrors(plan){
 if(plan.compositions!==undefined&&!Array.isArray(plan.compositions))return['Композиции должны быть массивом.'];
 const errors=[],used=new Set(),groupIds=new Set();for(const c of plan.compositions??[]){if(!c||!Array.isArray(c.roomIds)||!Array.isArray(c.edgeIds)){errors.push('Неполная композиция.');continue;}const ids=new Set(c.roomIds);if(!COMPOSITION_TYPES[c.kind]||groupIds.has(c.id)||ids.size!==c.roomIds.length||ids.size<2||ids.size>4||graphDistances(plan,c.anchorId,ids).size!==ids.size||c.edgeIds.some(id=>!plan.edges.some(e=>e.id===id&&ids.has(e.from)&&ids.has(e.to))))errors.push('Неверная композиция '+c.id);groupIds.add(c.id);
  for(const id of ids){const n=plan.nodes.find(n=>n.id===id);if(used.has(id)||!n||n.composition?.id!==c.id)errors.push('Неверная принадлежность композиции '+id);used.add(id);}
 }return errors;
}
