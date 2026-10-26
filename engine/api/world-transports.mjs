import {transportSettings} from '../core/transport-settings.mjs';
import {seededRandom} from '../core/random.mjs';
import {fingerprint} from './identity.mjs';
import {LabError} from './config.mjs';
const same=(a,b)=>{if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;const keys=Object.keys(a).sort(),other=Object.keys(b).sort();return keys.length===other.length&&keys.every((k,i)=>k===other[i]&&same(a[k],b[k]));};
export function applyAutomaticWorldTransports(request,layers,verticalLinks,placeLanding){
 const settings=transportSettings(request.autoTransports,true),groups=[],used=new Set(verticalLinks.map(t=>t.id));
 for(const layer of layers)for(const original of [...(layer.dungeon.level.transportLinks??[])]){
  const group=layer.dungeon.level.isolation.groups.find(g=>g.edgeId===original.edgeId),random=seededRandom(parseInt(fingerprint([request.seed,layer.id,original.id]),16)),others=layers.filter(l=>l.id!==layer.id&&l.headroom>=2).sort((a,b)=>Math.abs(a.elevation-layer.elevation)-Math.abs(b.elevation-layer.elevation)||a.id.localeCompare(b.id)),types=Object.entries(settings.types).filter(([type,weight])=>weight>0&&(type==='teleport'||others.length&&layer.headroom>=2));
  const sum=types.reduce((n,[,weight])=>n+weight,0);let roll=random()*sum,kind=types.at(-1)?.[0];for(const [type,weight]of types){roll-=weight;if(roll<0){kind=type;break;}}if(!kind)throw new LabError('INVALID_WORLD','Для изолированного участка нужен разрешённый вид перехода и подходящий другой ярус.');
  if(kind==='teleport'){groups.push({layerId:layer.id,edgeId:original.edgeId,roomIds:[...group.roomIds],kind,linkId:layer.id+'-'+original.id});continue;}
  let id='auto-'+fingerprint([layer.id,original.edgeId]);for(let n=1;used.has(id);n++)id='auto-'+fingerprint([layer.id,original.edgeId])+'-'+n;used.add(id);
  const footprint={width:settings.landingSize,height:settings.landingSize},inner=[original.from,original.to].find(p=>group.roomIds.includes(p.roomId));
  layer.dungeon.level.transportLinks=layer.dungeon.level.transportLinks.filter(t=>t.id!==original.id);
  const from=placeLanding(layer,inner.roomId,footprint,id+'-from',{requireReachable:false,anchorHint:inner});let to=null;
  for(const remote of others){const rooms=[...remote.dungeon.level.plan.mainPath],offset=Math.floor(random()*rooms.length);for(let i=0;i<rooms.length&&!to;i++)try{to=placeLanding(remote,rooms[(i+offset)%rooms.length],footprint,id+'-to');}catch(error){if(error.code!=='INVALID_WORLD')throw error;}if(to)break;}
  if(!to)throw new LabError('INVALID_WORLD','Нет свободной площадки '+settings.landingSize+'×'+settings.landingSize+' для '+kind+'. Уменьшите площадку, увеличьте комнаты или разрешите телепорты.');
  const link={id,kind,direction:'both',footprint,clearance:2,requirements:[],travelCost:settings.travelCost,automatic:true,isolation:{layerId:layer.id,edgeId:original.edgeId},from,to};verticalLinks.push(link);
  layer.dungeon.level.externalTransports??=[];layer.dungeon.level.externalTransports.push({...original,kind,worldLinkId:id});groups.push({layerId:layer.id,edgeId:original.edgeId,roomIds:[...group.roomIds],kind,linkId:id});
 }
 return{settings,groups,counts:Object.fromEntries(['teleport','lift','stairs'].map(kind=>[kind,groups.filter(g=>g.kind===kind).length])),note:'Телепорты соединяют участки одного этажа; лестницы и лифты имеют реальные площадки на разных ярусах. Все автоматические связи двусторонние.'};
}

export function automaticWorldTransportErrors(world){
 const errors=[],settings=transportSettings(world.request.autoTransports,true),claimed=new Set(),groups=[];
 for(const layer of world.layers){const level=layer.dungeon.level,spec=world.request.layers.find(l=>l.id===layer.id),common=Object.fromEntries(['maxGroups','maxRoomsPerGroup','chance','travelCost'].map(k=>[k,settings[k]]));
 if(!same(level.options.transports,common)||!same(layer.dungeon.recipe.generator.transports,common)||level.options.allowDisconnected!==spec?.request.generator.allowDisconnected)errors.push('Настройки изоляции яруса не соответствуют заказу мира.');
 for(const t of level.externalTransports??[]){
  const group=level.isolation?.groups?.find(g=>g.edgeId===t.edgeId),link=world.verticalLinks.find(l=>l.id===t.worldLinkId),inner=group&&[t.from,t.to].find(p=>group.roomIds.includes(p.roomId)),remote=link&&world.layers.find(l=>l.id===link.to.layerId);
  if(!link||claimed.has(link.id)||link.automatic!==true||link.kind!==t.kind||!settings.types[t.kind]||!same(link.isolation,{layerId:layer.id,edgeId:t.edgeId})||link.direction!=='both'||link.requirements.length||link.travelCost!==settings.travelCost||link.clearance!==2||!same(link.footprint,{width:settings.landingSize,height:settings.landingSize})||link.from.layerId!==layer.id||link.from.roomId!==inner?.roomId||link.to.layerId===layer.id||!remote?.dungeon.level.plan.mainPath.includes(link.to.roomId)){errors.push('Внешний доступ в изолированный участок не соответствует реальному парному переходу и настройкам.');continue;}
  claimed.add(link.id);groups.push({layerId:layer.id,edgeId:t.edgeId,roomIds:[...group.roomIds],kind:t.kind,linkId:link.id});
 }
 for(const t of level.transportLinks??[]){const group=level.isolation?.groups?.find(g=>g.edgeId===t.edgeId);if(!group||t.kind!=='teleport'||!settings.types.teleport)errors.push('Вид автоматического перехода не разрешён.');else groups.push({layerId:layer.id,edgeId:t.edgeId,roomIds:[...group.roomIds],kind:t.kind,linkId:layer.id+'-'+t.id});}
 }
 if(world.verticalLinks.some(t=>t.automatic&&!claimed.has(t.id)))errors.push('Лишний автоматический переход без изолированного участка.');
 const order=rows=>[...rows].sort((a,b)=>(a.layerId+'/'+a.edgeId).localeCompare(b.layerId+'/'+b.edgeId));if(!world.automaticTransports||!same(world.automaticTransports.settings,settings)||!same(order(groups),order(world.automaticTransports.groups))||['teleport','lift','stairs'].some(kind=>world.automaticTransports.counts[kind]!==groups.filter(g=>g.kind===kind).length))errors.push('Отчёт автоматических переходов не соответствует карте.');
 return errors;
}
