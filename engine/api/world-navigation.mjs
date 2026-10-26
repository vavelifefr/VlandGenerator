import {LabError} from './config.mjs';
import {createMovementField,findMovementPath,movementProfile,movementFits} from './movement.mjs';
import {priorityQueue} from '../core/priority-queue.mjs';
const pointKey=p=>p.layerId+':'+p.x+':'+p.y;
const centered=(p,profile)=>({layerId:p.layerId,x:p.x-Math.floor(profile.width/2),y:p.y-Math.floor(profile.height/2)});
function navigate(world,from,to,options={},all=false){
 const profile=movementProfile(options.profile??'walker'),layers=new Map(world.layers.map(l=>[l.id,l])),nodes=[],byPoint=new Map(),arcs=new Map(),fields=new Map();
 const add=p=>{if(!layers.has(p.layerId)||!Number.isInteger(p.x)||!Number.isInteger(p.y))throw new LabError('INVALID_WORLD','Неизвестный ярус или координата маршрута.');const k=pointKey(p);if(!byPoint.has(k)){const id=nodes.length;nodes.push({...p,id});byPoint.set(k,id);arcs.set(id,[]);}return byPoint.get(k);};
 const start=add(from??centered(world.spawn,profile)),goal=add(to??centered(world.exit,profile)),grantNodes=[];
 const automaticNodes=[];for(const layer of world.layers)for(const t of layer.dungeon.level.transportLinks??[])if(t.automatic)automaticNodes.push({id:layer.id+'-'+t.id,nodes:[t.from,t.to].map(p=>add(centered({...p,layerId:layer.id},profile)))});
 for(const g of world.grants??[])grantNodes.push({node:add(centered({...g.position,layerId:g.layerId},profile)),capability:g.capability});
 const vertical=[];for(const link of world.verticalLinks){
  if(profile.width>link.footprint.width||profile.height>link.footprint.height||profile.bodyHeight>link.clearance)continue;
  const point=end=>({layerId:end.layerId,x:end.anchor.x+Math.floor((link.footprint.width-profile.width)/2),y:end.anchor.y+Math.floor((link.footprint.height-profile.height)/2)}),a=add(point(link.from)),b=add(point(link.to));vertical.push({a,b,link});if(link.automatic)automaticNodes.push({id:link.id,nodes:[a,b]});
 }
 for(const layer of world.layers){const field=createMovementField(layer.dungeon,profile,options.layerStates?.[layer.id]??{});if(profile.bodyHeight>layer.headroom)field.passable.fill(0);fields.set(layer.id,field);}
 for(const layer of world.layers){const local=nodes.filter(n=>n.layerId===layer.id),field=fields.get(layer.id);for(let i=0;i<local.length;i++)for(let j=i+1;j<local.length;j++){
  const a=local[i],b=local[j],path=findMovementPath(layer.dungeon,a,b,profile,options.layerStates?.[layer.id]??{},field);if(!path)continue;const cost=path.slice(1).reduce((n,p)=>n+field.costs[p.y*field.width+p.x],0);
  const reverseCost=path.slice(0,-1).reduce((n,p)=>n+field.costs[p.y*field.width+p.x],0);arcs.get(a.id).push({to:b.id,cost,requirements:[],segment:{type:'walk',layerId:layer.id,path}});arcs.get(b.id).push({to:a.id,cost:reverseCost,requirements:[],segment:{type:'walk',layerId:layer.id,path:[...path].reverse()}});
 }}
 for(const {a,b,link}of vertical){if(!movementFits(fields.get(nodes[a].layerId),nodes[a])||!movementFits(fields.get(nodes[b].layerId),nodes[b]))continue;
  const segment=(a,b)=>({type:'vertical',linkId:link.id,kind:link.kind,from:{layerId:nodes[a].layerId,x:nodes[a].x,y:nodes[a].y},to:{layerId:nodes[b].layerId,x:nodes[b].x,y:nodes[b].y},travelCost:link.travelCost});
  arcs.get(a).push({to:b,cost:link.travelCost,requirements:link.requirements,segment:segment(a,b)});if(link.direction==='both')arcs.get(b).push({to:a,cost:link.travelCost,requirements:link.requirements,segment:segment(b,a)});
 }
 const suppliedCapabilities=options.capabilities??world.request.capabilities??[];if(!Array.isArray(suppliedCapabilities)||suppliedCapabilities.length>16||suppliedCapabilities.some(c=>typeof c!=='string'||!/^[a-z][a-z0-9-]{0,31}$/.test(c)))throw new LabError('INVALID_STATE','Способности: до16 символьных имён.');const capabilities=[...new Set([...suppliedCapabilities,...profile.capabilities])];
 const catalog=[...new Set([...capabilities,...(world.grants??[]).map(g=>g.capability),...world.verticalLinks.flatMap(l=>l.requirements)])].sort();if(catalog.length>16)throw new LabError('STATE_LIMIT','В одном мире допускается до16 значимых способностей.');
 const bit=c=>1<<catalog.indexOf(c),maskOf=list=>list.reduce((m,c)=>m|bit(c),0),grant=new Map();for(const g of grantNodes)grant.set(g.node,(grant.get(g.node)??0)|bit(g.capability));
 const stateKey=(id,mask)=>id+':'+mask,initialMask=maskOf(capabilities)|(grant.get(start)??0),initial=stateKey(start,initialMask),queue=priorityQueue(),distance=new Map([[initial,0]]),previous=new Map(),states=new Map([[initial,{node:start,mask:initialMask}]]),reverse=new Map(),goals=[];
 queue.push({key:initial,cost:0});let winner=null;
 if(!movementFits(fields.get(nodes[start].layerId),nodes[start]))return{path:null,statesChecked:0,softlocks:[],reason:'Начальная позиция не вмещает профиль.'};
 while(queue.length){const current=queue.pop();if(current.cost!==distance.get(current.key))continue;const state=states.get(current.key);if(state.node===goal){goals.push(current.key);if(winner===null)winner=current.key;if(!all)break;}
  for(const arc of arcs.get(state.node)){if(arc.requirements.some(c=>!(state.mask&bit(c))))continue;const mask=state.mask|(grant.get(arc.to)??0),next=stateKey(arc.to,mask),cost=current.cost+arc.cost;if(!reverse.has(next))reverse.set(next,new Set());reverse.get(next).add(current.key);
   if(cost<(distance.get(next)??Infinity)){if(!states.has(next)&&states.size>=16384)throw new LabError('STATE_LIMIT','Превышен бюджет16384 состояний мира. Упростите зависимости.');states.set(next,{node:arc.to,mask});distance.set(next,cost);previous.set(next,{key:current.key,segment:arc.segment});queue.push({key:next,cost});}
  }
 }
 let path=null;if(winner!==null){const segments=[];for(let k=winner;k!==initial;){const p=previous.get(k);segments.push(p.segment);k=p.key;}segments.reverse();path={cost:Math.round(distance.get(winner)*1000)/1000,segments,capabilities:catalog.filter(c=>states.get(winner).mask&bit(c)),statesChecked:states.size};}
 const safe=new Set(goals),back=[...goals];for(let i=0;i<back.length;i++)for(const p of reverse.get(back[i])??[])if(!safe.has(p)){safe.add(p);back.push(p);}
 const softlocks=all?[...states].filter(([k])=>!safe.has(k)).map(([,s])=>({position:{layerId:nodes[s.node].layerId,x:nodes[s.node].x,y:nodes[s.node].y},capabilities:catalog.filter(c=>s.mask&bit(c))})):[];
 const visitedNodes=new Set([...states.values()].map(s=>s.node)),unreachableAutomaticLinks=[...world.verticalLinks.filter(t=>t.automatic&&!vertical.some(v=>v.link.id===t.id)).map(t=>t.id),...automaticNodes.filter(t=>t.nodes.some(n=>!visitedNodes.has(n))).map(t=>t.id)];
 const entrySafe=new Set([...states].filter(([,s])=>s.node===start).map(([key])=>key)),entryQueue=[...entrySafe];for(let i=0;i<entryQueue.length;i++)for(const p of reverse.get(entryQueue[i])??[])if(!entrySafe.has(p)){entrySafe.add(p);entryQueue.push(p);}
 const unreturnableAutomaticLinks=automaticNodes.filter(t=>[...states].some(([key,s])=>t.nodes.includes(s.node)&&!entrySafe.has(key))).map(t=>t.id);
 const unreachableLinkEndpoints=[...world.verticalLinks.filter(t=>!vertical.some(v=>v.link.id===t.id)).map(t=>t.id),...vertical.filter(v=>!visitedNodes.has(v.a)||!visitedNodes.has(v.b)).map(v=>v.link.id)];
 return{path,statesChecked:states.size,softlocks,unreachableAutomaticLinks,unreturnableAutomaticLinks,unreachableLinkEndpoints,visitedLayerIds:[...new Set([...states.values()].map(s=>nodes[s.node].layerId))],unreachableGrants:grantNodes.filter(g=>![...states.values()].some(s=>s.node===g.node)).map(g=>catalog.find(c=>bit(c)===bit(g.capability))),reason:path?null:'Нет маршрута с текущими способностями, направленностью и габаритом.'};
}
export function findWorldPath(world,from=null,to=null,options={}){return navigate(world,from,to,options,false).path;}
export function analyzeWorldNavigation(world,options={}){const result=navigate(world,null,null,options,true);return{ok:!!result.path&&!result.softlocks.length&&result.visitedLayerIds?.length===world.layers.length&&!result.unreachableGrants?.length&&!result.unreachableAutomaticLinks?.length&&!result.unreachableLinkEndpoints?.length&&!result.unreturnableAutomaticLinks?.length,unreturnableAutomaticLinks:result.unreturnableAutomaticLinks??[],unreachableLinkEndpoints:result.unreachableLinkEndpoints??[],unreachableAutomaticLinks:result.unreachableAutomaticLinks??[],reachable:!!result.path,statesChecked:result.statesChecked,visitedLayerIds:result.visitedLayerIds??[],unreachableGrants:result.unreachableGrants??[],softlocks:result.softlocks,path:result.path,reason:result.reason};}
