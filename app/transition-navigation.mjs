import {gridNeighbors} from '../engine/core/topology.mjs';
import {createMovementField,canMovementStep} from '../engine/api/movement.mjs';
import {resolveTransitions,nativeTransitions,transportPoint} from './transitions.mjs';
import {checkPlacement,occupancyIndex} from '../content/validation.mjs';
const key=p=>p.x+':'+p.y,dirs=[[1,0],[-1,0],[0,1],[0,-1]];

// The source-provider validator still proves core progression. This graph adds
// authored links, physical approaches, cross-layer reachability and return.
export async function analyzeTransitions(project,layers,scene,emissions=[]){
 const authored=resolveTransitions(project),base=nativeTransitions(project,layers),errors=[],reports=[];
 if(!authored.length&&!base.some(t=>t.automatic))return{ok:true,errors,reports,links:base,network:null};
 const types=new Map(project.catalog.map(e=>[e.id,e])),fields=new Map(),arcs=new Map(),positions=new Map();let side=null;
 for(const l of layers){const solid=[...l.solid];for(const o of emissions.filter(o=>o.layerId===l.id)){const e=types.get(o.catalogId);if(e?.blocking)for(let dy=0;dy<e.footprint.height;dy++)for(let dx=0;dx<e.footprint.width;dx++){const x=o.x+dx,y=o.y+dy;if(x>=0&&y>=0&&x<l.width&&y<l.height)solid[y*l.width+x]=1;}}
  for(const g of l.gates??[]){const p=g.position;if(!project.edits.some(e=>e.layerId===l.id&&e.x===p.x&&e.y===p.y&&!e.field)&&!emissions.some(o=>{const e=types.get(o.catalogId);return e?.blocking&&o.layerId===l.id&&p.x>=o.x&&p.y>=o.y&&p.x<o.x+e.footprint.width&&p.y<o.y+e.footprint.height;}))solid[p.y*l.width+p.x]=0;}
  if(l.kind==='sideview'){
   const {createPlatformerModel,platformerEdges}=await import('../engine/core/platformer-physics.mjs'),copy={...project.source,board:{...project.source.board,walls:solid.flatMap((v,i)=>v?[{x:i%l.width,y:Math.floor(i/l.width)}]:[])}};
   const model=createPlatformerModel(copy),abilities=new Set([...copy.request.abilities.initial,...copy.grants.map(g=>g.ability)]),cache=new Map();side={layerId:l.id,physics:copy.request.physics,stable:p=>model.fits(p.x,p.y)&&!model.lethal(p.x,p.y)&&(model.grounded(p.x,p.y)||model.onLadder(p.x,p.y)),edges:p=>{const k=key(p);if(!cache.has(k)){if(cache.size>=6000)throw new Error('Превышен бюджет физических опор переходов (6000).');cache.set(k,platformerEdges(model,p).filter(e=>e.requires.every(a=>abilities.has(a))).map(e=>e.to));}return cache.get(k);}};
  }else{
   const natural=l.sourceFields?createMovementField({schema:'vland.atlas.layer',topology:l.topology,board:{width:l.width,height:l.height,walls:solid.flatMap((v,i)=>v?[{x:i%l.width,y:Math.floor(i/l.width)}]:[])},fields:l.sourceFields},project.source.request?.profile??'walker'):null;if(natural)for(let i=0;i<solid.length;i++)if(!natural.passable[i])solid[i]=1;
   const components=new Int32Array(solid.length).fill(-1);let count=0;for(let i=0;i<solid.length;i++){if(solid[i]||components[i]>=0)continue;const q=[i];components[i]=count;for(let n=0;n<q.length;n++){const x=q[n]%l.width,y=Math.floor(q[n]/l.width);for(const j of gridNeighbors(q[n],l.width,l.height,l.topology)){const xx=j%l.width,yy=Math.floor(j/l.width);if((!natural||canMovementStep(natural,{x,y},{x:xx,y:yy}))&&!solid[j]&&components[j]<0){components[j]=count;q.push(j);}}}count++;}fields.set(l.id,{components,width:l.width,height:l.height});
  }
 }
 const node=p=>{
  if(!p||!Number.isInteger(p.x)||!Number.isInteger(p.y))return null;
  if(side?.layerId===p.layerId){const f=p.footprint??side.physics,pose={x:p.x+Math.floor((f.width-side.physics.width)/2),y:p.y+f.height-side.physics.height};if(!side.stable(pose))return null;const id=p.layerId+'@'+key(pose);positions.set(id,pose);return id;}
  const f=fields.get(p.layerId);if(!f||p.x<0||p.y<0||p.x>=f.width||p.y>=f.height)return null;const c=f.components[p.y*f.width+p.x];return c<0?null:p.layerId+'#'+c;
 };
 const add=(a,b)=>{if(a&&b){if(!arcs.has(a))arcs.set(a,new Set());arcs.get(a).add(b);}};
 const usable=[];
 for(const t of authored){const report={id:t.id,kind:t.kind,from:t.from,to:t.to,bidirectional:t.bidirectional,ok:true,errors:[]};
  for(const p of [t.from,t.to]){const s=project.sources.find(s=>s.id===p.sourceId),point=transportPoint(s,project.catalog),l=scene.map.layers.find(l=>l.id===p.layerId);if(!point?.fixed||point.kind!==t.kind){report.errors.push(p.name+': '+(point?.reason||'Вид объекта не соответствует связи.'));continue;}
   const problems=checkPlacement(l,point.definition,point,{filters:point.rule.filters,occupancy:occupancyIndex(l,scene.catalog,[...scene.map.fixtures,...emissions])});if(problems.length)report.errors.push(p.name+': '+problems.map(p=>p.message).join(' '));if(!node(p))report.errors.push(p.name+': нет свободной безопасной точки прибытия с опорой для игрока.');}
  reports.push(report);if(!report.errors.length)usable.push(t);
 }
 for(const t of base.filter(t=>t.automatic)){
  const report={id:t.id,origin:'base',kind:t.kind,from:t.from,to:t.to,bidirectional:t.bidirectional,ok:true,errors:[]};
  for(const p of [t.from,t.to]){const l=scene.map.layers.find(l=>l.id===p.layerId),foot=p.footprint??{width:1,height:1};if(!l||!node(p)){report.errors.push('Нет свободной точки прибытия на ярусе '+p.layerId+'.');continue;}
   for(let dy=0;dy<foot.height;dy++)for(let dx=0;dx<foot.width;dx++){const x=p.x+dx,y=p.y+dy,i=y*l.width+x;if(x<0||y<0||x>=l.width||y>=l.height||l.solid[i]||(['sea','lava','water'].includes(l.material[i])&&!layers.find(v=>v.id===l.id)?.sourceFields?.bridge?.[i]&&!l.frozen?.[i])||emissions.some(o=>{const e=types.get(o.catalogId);return e?.blocking&&o.layerId===l.id&&x>=o.x&&y>=o.y&&x<o.x+e.footprint.width&&y<o.y+e.footprint.height;}))report.errors.push('Площадка перехода перекрыта или находится в опасной среде.');}
  }reports.push(report);
 }
 for(const t of [...base,...usable]){const a=node(t.from),b=node(t.to);add(a,b);if(t.bidirectional)add(b,a);}
 const first=layers.find(l=>l.id===project.source.spawn?.layerId)??layers[0],start=project.source.spawn?.layerId?project.source.spawn:{...first.spawn,layerId:first.id},root=node(start),seen=new Set(),reverse=new Map(),q=root?[root]:[];if(root)seen.add(root);
 for(let i=0;i<q.length;i++){
  const a=q[i],next=new Set(arcs.get(a)??[]);if(side&&a.startsWith(side.layerId+'@'))for(const p of side.edges(positions.get(a))){const b=node({...p,layerId:side.layerId});if(b)next.add(b);}
  for(const b of next){if(!reverse.has(b))reverse.set(b,new Set());reverse.get(b).add(a);if(!seen.has(b)){if(q.length>=300000)throw new Error('Превышен бюджет графа переходов.');seen.add(b);q.push(b);}}
 }
 const back=new Set(root?[root]:[]),rq=[...back];for(let i=0;i<rq.length;i++)for(const a of reverse.get(rq[i])??[])if(!back.has(a)){back.add(a);rq.push(a);}
 for(const report of reports){for(const [label,p]of [['Вход',report.from],['Выход',report.to]]){const n=node(p);if(!n||!seen.has(n))report.errors.push(label+': точка недоступна от входа карты.');else if(!back.has(n))report.errors.push(label+': нет безопасного маршрута возврата к входу карты.');}report.ok=!report.errors.length;errors.push(...report.errors.map(e=>report.id+' · '+e));}
 return{ok:!errors.length,errors:[...new Set(errors)],reports,links:[...base,...authored],network:{hasPoint:(layerId,p)=>seen.has(node({...p,layerId})),canReturn:(layerId,p)=>back.has(node({...p,layerId}))}};
}
