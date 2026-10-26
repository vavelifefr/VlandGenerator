import {analyzeAtlasAccess} from '../engine/api/atlas-transports.mjs';
import {findMovementPath} from '../engine/api/movement.mjs';
import {gridNeighbors} from '../engine/core/topology.mjs';
function route(layer,solid){
 const start=layer.spawn,end=layer.exit;if(!start||!end)return{ok:true};const first=start.y*layer.width+start.x,last=end.y*layer.width+end.x;if(solid[first]||solid[last])return{ok:false};
 const jumps=new Map();for(const t of layer.transportLinks??[])for(const [a,b]of [[t.from,t.to],...(t.bidirectional?[[t.to,t.from]]:[])]){const i=a.y*layer.width+a.x;if(!jumps.has(i))jumps.set(i,[]);jumps.get(i).push(b.y*layer.width+b.x);}const seen=new Uint8Array(solid.length),q=[first];seen[first]=1;for(let k=0;k<q.length;k++){const i=q[k],x=i%layer.width,y=Math.floor(i/layer.width);for(const j of gridNeighbors(i,layer.width,layer.height,layer.topology))if(!seen[j]&&!solid[j]){seen[j]=1;q.push(j);}for(const j of jumps.get(i)??[])if(!seen[j]&&!solid[j]){seen[j]=1;q.push(j);}}return{ok:!!seen[last],seen};
}
export function checkEditedNavigation(project,layers,adapter,emissions=[],network=null){
 const errors=[],types=new Map(project.catalog.map(e=>[e.id,e]));
 if(['landscape','hexlandscape','caves','relief','settlements'].includes(project.recipe.mode)){
  const copy=structuredClone(project.recipe.mode==='settlements'?project.source.atlas:project.source);for(const original of copy.layers){const l=layers.find(l=>l.id===original.id);original.fields=structuredClone(l.sourceFields);original.topology=l.topology;original.board.walls=l.solid.flatMap((v,i)=>v?[{x:i%l.width,y:Math.floor(i/l.width)}]:[]);for(const o of emissions.filter(o=>o.layerId===l.id)){const def=types.get(o.catalogId);if(def?.blocking)for(let dy=0;dy<def.footprint.height;dy++)for(let dx=0;dx<def.footprint.width;dx++)original.board.walls.push({x:o.x+dx,y:o.y+dy});}if(!findMovementPath(original,original.spawn,original.exit,copy.request.profile))errors.push('После правок нет физического пути по ярусу '+l.id);}
  errors.push(...analyzeAtlasAccess(copy).errors);
 }
 for(const l of layers){const solid=[...l.solid];for(const o of emissions.filter(o=>o.layerId===l.id)){const e=types.get(o.catalogId);if(e?.blocking)for(let dy=0;dy<e.footprint.height;dy++)for(let dx=0;dx<e.footprint.width;dx++){const x=o.x+dx,y=o.y+dy;if(x>=0&&y>=0&&x<l.width&&y<l.height)solid[y*l.width+x]=1;}}
  if(l.kind==='sideview'){
   if(project.edits.length||emissions.some(o=>o.layerId===l.id&&types.get(o.catalogId)?.blocking)){const report=adapter.editedNavigation(project.source,{...l,solid});if(!report.ok)errors.push('Слой '+l.id+': после правок не подтверждены прыжки, получение способностей или возврат.');}continue;
  }
  if(!route(l,solid).ok){errors.push('Слой '+l.id+': перекрыт маршрут от входа до выхода.');continue;}
  const possible=[...solid];for(const g of l.gates??[]){const{x,y}=g.position;const blocked=project.edits.some(e=>e.layerId===l.id&&e.x===x&&e.y===y&&!e.field)||emissions.some(o=>{const e=types.get(o.catalogId);return o.layerId===l.id&&e?.blocking&&x>=o.x&&x<o.x+e.footprint.width&&y>=o.y&&y<o.y+e.footprint.height;});if(!blocked)possible[y*l.width+x]=0;}
  const optional=route(l,possible);for(const r of l.rooms)if(r.cells.length&&!r.cells.some(p=>optional.seen?.[p.y*l.width+p.x]||network?.hasPoint(l.id,p)))errors.push('Слой '+l.id+': недоступная комната '+r.id);
  for(const o of emissions.filter(o=>o.layerId===l.id&&true)){const e=types.get(o.catalogId);if(['air','subsurface','cover','trigger'].includes(e.channel))continue;const around=[];for(let y=o.y-1;y<=o.y+e.footprint.height;y++)for(let x=o.x-1;x<=o.x+e.footprint.width;x++)if(x>=0&&y>=0&&x<l.width&&y<l.height)around.push(y*l.width+x);if(!around.some(i=>optional.seen?.[i]||network?.hasPoint(l.id,{x:i%l.width,y:Math.floor(i/l.width)})))errors.push('Нет подхода к экземпляру '+o.id);}
 }
 return errors;
}
