import {ContentError,keys,number,id,jsonValue,LIMITS} from './common.mjs';
import {environmentAt,terrainTags} from './map.mjs';
import {tileDistance} from './topology.mjs';
export const bodyCells=(o,e,width)=>Array.from({length:e.footprint.width*e.footprint.height},(_,i)=>(o.y+Math.floor(i/e.footprint.width))*width+o.x+i%e.footprint.width);
export function occupancyIndex(layer,catalog,instances){const result=new Map(),types=new Map(catalog.map(c=>[c.id,c]));for(const o of instances.filter(o=>o.layerId===layer.id)){const e=types.get(o.catalogId);if(!e)continue;for(const i of bodyCells(o,e,layer.width)){if(!result.has(i))result.set(i,[]);result.get(i).push({instance:o,entity:e});}}return result;}
export function canShare(a,b){
 if(a.channel===b.channel&&['cover','trigger'].includes(a.channel)&&!a.blocking&&!b.blocking&&!a.constraints.requiresEmptyTile&&!b.constraints.requiresEmptyTile)return true;
 if(a.channel==='subsurface'||b.channel==='subsurface')return a.channel!==b.channel;
 if(a.channel==='trigger'||b.channel==='trigger')return a.channel!==b.channel;
 if(a.channel==='cover'||b.channel==='cover')return a.channel!==b.channel&&!a.blocking&&!b.blocking;
 if(a.channel==='air'||b.channel==='air')return a.channel!==b.channel&&!a.blocking&&!b.blocking;
 return false;
}
function constraintProblems(layer,entity,o,constraints,body){
 const problems=[];const add=(code,message)=>{if(!problems.some(p=>p.code===code))problems.push({code,message});};
 if(constraints.allowedLevels?.length&&!constraints.allowedLevels.includes(layer.id))add('LEVEL','Не подходит физический уровень.');
 if(constraints.allowedLayerKinds?.length&&!constraints.allowedLayerKinds.includes(layer.kind))add('LAYER_KIND','Не подходит вид уровня.');
 if(layer.depth<(constraints.minDepth??0)||layer.depth>(constraints.maxDepth??100000))add('DEPTH','Не подходит глубина.');
 for(const i of body){
  const tags=terrainTags(layer,i),env=environmentAt(layer,i);
  if(constraints.allowedTerrain?.length&&!constraints.allowedTerrain.some(t=>tags.has(t)))add('TERRAIN','Не подходит поверхность.');
  if(constraints.excludedTerrain?.some(t=>tags.has(t)))add('EXCLUDED_TERRAIN','Поверхность исключена.');
  if(constraints.allowedEnvironments?.length&&!constraints.allowedEnvironments.includes(env)&&!(entity.channel==='air'&&constraints.allowedEnvironments.includes('air')))add('ENVIRONMENT','Не подходит среда обитания.');
  if(constraints.allowedBiomes?.length){if(!layer.biome)add('UNSUPPORTED_BIOME','Режим не предоставляет биомы.');else if(!constraints.allowedBiomes.includes(layer.biome[i]))add('BIOME','Не подходит биом.');}
  if(constraints.allowedRocks?.length){if(!layer.rock)add('UNSUPPORTED_ROCK','Режим не предоставляет геологические породы.');else if(!constraints.allowedRocks.includes(layer.rock[i]))add('ROCK','Не подходит порода.');}
  for(const condition of constraints.conditions??[]){const value=layer.metrics?.[condition.field]?.[i];if(value===undefined)add('UNSUPPORTED_METRIC','Режим не предоставляет поле '+condition.field+'.');else if(value<condition.min||value>condition.max)add('METRIC_RANGE','Не подходит значение '+condition.field+'.');}
  if(constraints.requiresWalkable&&((layer.solid[i]&&entity.channel!=='subsurface')||layer.gravity!=='down'&&layer.support?.[i]===0||env==='air'||layer.water[i]==='lava'))add('WALKABLE','Нет доступной опоры.');
 }return problems;
}
export function checkPlacement(layer,entity,o,{mask=null,filters={},occupancy=new Map(),avoidReserved=false}={}){
 const problems=[];const add=(code,message)=>{if(!problems.some(p=>p.code===code))problems.push({code,message});};
 if(!Number.isInteger(o.x)||!Number.isInteger(o.y)||o.x<0||o.y<0||o.x+entity.footprint.width>layer.width||o.y+entity.footprint.height>layer.height)return[{code:'BOUNDS',message:'Габарит выходит за границу уровня.'}];
 const body=bodyCells(o,entity,layer.width);
 if(layer.gravity==='down'&&(entity.constraints.requiresWalkable||filters.requiresWalkable))for(let dx=0;dx<entity.footprint.width;dx++)if(!layer.solid[(o.y+entity.footprint.height)*layer.width+o.x+dx]){add('SUPPORT','Сущность должна стоять на опоре всем габаритом.');break;}
 for(const i of body){if(mask&&!mask.has(i))add('ZONE_BOUNDARY','Габарит выходит за границу зоны.');if(layer.solid[i]&&entity.channel!=='subsurface')add('OBSTACLE','Здесь стена или физическое препятствие.');if(layer.reserved?.[i]&&(avoidReserved||entity.blocking))add('RESERVED','Здесь защищённый маршрут или переход.');for(const other of occupancy.get(i)??[])if(other.instance.id!==o.id&&(!canShare(entity,other.entity)||filters.requiresEmptyTile&&entity.channel===other.entity.channel))add('OCCUPIED','Место занято несовместимым объектом.');}
 for(const c of [entity.constraints,filters])for(const p of constraintProblems(layer,entity,o,c,body))add(p.code,p.message);
 return problems;
}
export function spacingFits(a,ea,b,eb,distance,topology){if(topology?.kind==='hex'){for(let ay=0;ay<ea.footprint.height;ay++)for(let ax=0;ax<ea.footprint.width;ax++)for(let by=0;by<eb.footprint.height;by++)for(let bx=0;bx<eb.footprint.width;bx++)if(tileDistance({x:a.x+ax,y:a.y+ay},{x:b.x+bx,y:b.y+by},topology)<distance)return false;return true;}const dx=Math.max(0,b.x-(a.x+ea.footprint.width-1),a.x-(b.x+eb.footprint.width-1)),dy=Math.max(0,b.y-(a.y+ea.footprint.height-1),a.y-(b.y+eb.footprint.height-1));return dx+dy>=distance;}
