import {VlandError,checkKeys,checkId,checkNumber} from './contracts.mjs';
import {hash} from '../content/common.mjs';
import {createSource} from '../content/sources.mjs';
import {checkPlacement,occupancyIndex} from '../content/validation.mjs';
export const TRANSPORT_NAMES=Object.freeze({teleport:'Телепорт',lift:'Лифт',stairs:'Лестница'});

export function transportPoint(source,catalog){
 const rule=source.rules[0],definition=catalog.find(e=>e.id===rule?.entries[0]?.catalogId),kind=definition?.properties.transport?.kind;
 if(source.category!=='objects'||!Object.hasOwn(TRANSPORT_NAMES,kind))return null;
 const fixed=source.kind==='spawner'&&source.area.radius===0&&source.enabled&&source.rules.length===1&&rule.entries.length===1&&rule.generator==='scatter'&&rule.chance===1&&rule.quantity.mode==='count'&&rule.quantity.min===1&&rule.quantity.max===1&&source.schedule.repeat==='once'&&source.schedule.trigger==='load'&&source.schedule.delay===0&&source.conditions.timeOfDay==='any'&&!source.conditions.flags.length&&!source.limits.populationId&&!definition.blocking;
 return{id:source.id,sourceId:source.id,name:source.name,kind,catalogId:definition.id,layerId:source.layerId,x:source.area.x,y:source.area.y,footprint:definition.footprint,fixed,definition,rule,reason:fixed?'':'Нужен включённый однократный спавнер: радиус 0, одна сущность без условий, задержки и общей популяции. Объект должен пропускать движение.'};
}

export function checkTransitions(project){
 const links=project.transitions??[];if(!Array.isArray(links)||links.length>128)throw new VlandError('TOO_LARGE','До 128 авторских переходов.');
 const ids=new Set(),used=new Set();for(const t of links){checkKeys(t,['id','kind','fromSourceId','toSourceId','bidirectional','travelCost'],'transition');checkId(t.id);checkId(t.fromSourceId);checkId(t.toSourceId);checkNumber(t.travelCost,0,100000,'travelCost');
  if(!Object.hasOwn(TRANSPORT_NAMES,t.kind)||typeof t.bidirectional!=='boolean'||ids.has(t.id)||t.fromSourceId===t.toSourceId||used.has(t.fromSourceId)||used.has(t.toSourceId))throw new VlandError('INVALID_TRANSITION','Связь должна соединять две разные свободные точки одного вида.');
  for(const id of [t.fromSourceId,t.toSourceId])if(!project.sources.some(s=>s.id===id))throw new VlandError('UNKNOWN_SOURCE','Точка перехода удалена: '+id);else used.add(id);ids.add(t.id);
 }return links;
}

export function resolveTransitions(project){
 return checkTransitions(project).map(t=>{const endpoint=id=>{const s=project.sources.find(s=>s.id===id),p=transportPoint(s,project.catalog);return p?{sourceId:id,layerId:s.layerId,x:p.x,y:p.y,catalogId:p.catalogId,name:p.name,footprint:p.footprint}:{sourceId:id,layerId:s.layerId,x:s.area.x,y:s.area.y,name:s.name};};return{...t,origin:'editor',from:endpoint(t.fromSourceId),to:endpoint(t.toSourceId)};});
}

// Normalize native vertical and intralayer links for the common authoring view.
// Raw provider links remain in runtime.links with their provider-specific data.
export function nativeTransitions(project,layers){
 const result=[],add=t=>{if(result.some(r=>r.id===t.id))return;const point=p=>({...p,...p.anchor,footprint:t.footprint??{width:1,height:1}});result.push({...t,origin:'base',bidirectional:t.bidirectional??(t.direction!=='forward'),travelCost:t.travelCost??1,from:point(t.from),to:point(t.to)});};
 for(const t of project.source.verticalLinks??project.source.links??[])add(t);
 for(const l of layers)for(const t of l.transportLinks??[])add(t);
 return result;
}

export function decorateTransitions(project,layers){
 for(const t of nativeTransitions(project,layers))for(const side of ['from','to']){
  const p=t[side],l=layers.find(l=>l.id===p.layerId);if(!l)continue;
  if(!l.objects.some(o=>o.properties.transportId===t.id&&o.x===p.x&&o.y===p.y))l.objects.push({id:'native-link-'+l.id+'-'+t.id+'-'+side,layerId:l.id,catalogId:t.kind==='teleport'?'portal':t.kind==='lift'?'lift':'stairs',x:p.x,y:p.y,origin:'source',properties:{transportId:t.id,destination:structuredClone(t[side==='from'?'to':'from']),kind:t.kind,bidirectional:t.bidirectional,travelCost:t.travelCost,automatic:!!t.automatic,footprint:t.footprint??{width:1,height:1},structural:true}});
 }
 for(const t of resolveTransitions(project))for(const p of [t.from,t.to]){const l=layers.find(l=>l.id===p.layerId);if(!l||!Number.isInteger(p.x)||!Number.isInteger(p.y))continue;for(let dy=0;dy<(p.footprint?.height??1);dy++)for(let dx=0;dx<(p.footprint?.width??1);dx++){const x=p.x+dx,y=p.y+dy;if(x>=0&&y>=0&&x<l.width&&y<l.height)l.reserved[y*l.width+x]=1;}}
 return layers;
}

export function connectTransition(project,operation,layers,scene){
 if(operation.travelCost!==undefined)checkNumber(operation.travelCost,0,100000,'travelCost');
 if(operation.bidirectional!==undefined&&typeof operation.bidirectional!=='boolean')throw new VlandError('INVALID_TRANSITION','bidirectional должен быть логическим значением.');
 const from=project.sources.find(s=>s.id===operation.fromSourceId),a=from&&transportPoint(from,project.catalog);if(!a?.fixed)throw new VlandError('INVALID_TRANSITION',a?.reason??'Выберите точку телепорта, лифта или лестницы.');
 if((operation.toSourceId!==undefined)===(operation.target!==undefined))throw new VlandError('INVALID_TRANSITION','Задайте вторую точку либо клетку для новой точки.');
 let sources=[...project.sources],to=project.sources.find(s=>s.id===operation.toSourceId);
 if(operation.target!==undefined){const target=operation.target;checkKeys(target,['layerId','x','y'],'target');const layer=layers.find(l=>l.id===target.layerId);if(!layer)throw new VlandError('UNKNOWN_LAYER','Выберите существующий ярус.');checkNumber(target.x,0,layer.width-1,'target.x',true);checkNumber(target.y,0,layer.height-1,'target.y',true);
  if(project.sources.some(s=>s.kind==='spawner'&&s.layerId===layer.id&&s.area.x===target.x&&s.area.y===target.y))throw new VlandError('OCCUPIED','В клетке уже есть спавнер. Выберите его или другую клетку.');
  const id='point-'+hash([from.id,target.layerId,target.x,target.y]);to=createSource({id,name:TRANSPORT_NAMES[a.kind]+' · '+layer.id,kind:'spawner',category:'objects',layer,catalogId:a.catalogId,seed:project.recipe.seed,x:target.x,y:target.y});to.limits={maxAlive:1,batchSize:1,total:1,populationId:null};sources.push(to);
 }
 const b=to&&transportPoint(to,project.catalog);if(!b?.fixed)throw new VlandError('INVALID_TRANSITION',b?.reason??'Во второй клетке нет точки перехода.');if(a.kind!==b.kind||a.id===b.id||a.layerId===b.layerId&&a.x===b.x&&a.y===b.y)throw new VlandError('INVALID_TRANSITION','Выберите другую точку того же вида.');
 if((project.transitions??[]).some(t=>[t.fromSourceId,t.toSourceId].includes(b.id)&&![t.fromSourceId,t.toSourceId].includes(a.id)))throw new VlandError('TRANSITION_IN_USE','У целевой точки уже есть другая связь. Сначала разорвите её.');
 for(const p of [a,b]){const layer=scene.map.layers.find(l=>l.id===p.layerId),problems=layer?checkPlacement(layer,p.definition,p,{filters:p.rule.filters,occupancy:occupancyIndex(layer,scene.catalog,scene.map.fixtures)}):[{message:'Уровень не найден.'}];if(problems.length)throw new VlandError('INVALID_TRANSITION',p.name+': '+problems.map(p=>p.message).join(' '));}
 const old=(project.transitions??[]).find(t=>[t.fromSourceId,t.toSourceId].includes(a.id)),link={id:old?.id??'link-'+hash([a.id,b.id].sort()),kind:a.kind,fromSourceId:a.id,toSourceId:b.id,bidirectional:operation.bidirectional??a.definition.properties.transport.bidirectional??true,travelCost:operation.travelCost??a.definition.properties.transport.travelCost??1};
 const result={...project,sources:sources.map(s=>[a.id,b.id].includes(s.id)?{...s,origin:{kind:'manual'}}:s),transitions:[...(project.transitions??[]).filter(t=>t.id!==old?.id),link]};checkTransitions(result);return result;
}
