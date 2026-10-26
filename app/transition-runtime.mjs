import {validateSpawnState} from '../content/runtime.mjs';
import {VlandError} from './contracts.mjs';

// No movement is performed here. The host must confirm that the destination
// still fits its live player/collision model before applying the returned hop.
export function resolveTransition(runtime,state,linkId,fromSourceId){
 if(runtime?.schema!=='vland.runtime'||runtime.schemaVersion!==4)throw new VlandError('INVALID_RUNTIME','Нужен экспорт runtime/4.');validateSpawnState(runtime.scene,state);
 const link=runtime.links.find(t=>t.origin==='editor'&&t.id===linkId);if(!link)throw new VlandError('UNKNOWN_TRANSITION','Авторская связь не найдена.');
 const side=link.from.sourceId===fromSourceId?'from':link.to.sourceId===fromSourceId?'to':null;if(!side||side==='to'&&!link.bidirectional)return{ok:false,code:'DIRECTION',reason:'Переход недоступен в этом направлении.'};
 const from=link[side],to=link[side==='from'?'to':'from'],entity=p=>state.entities.find(e=>e.origin.sourceId===p.sourceId&&e.catalogId===p.catalogId&&e.layerId===p.layerId&&e.x===p.x&&e.y===p.y);
 if([from,to].some(p=>state.disabledSourceIds.includes(p.sourceId))||!entity(from)||!entity(to))return{ok:false,code:'NOT_READY',reason:'Обе точки должны быть фактически созданы, находиться на своих местах и быть включены.'};
 return{ok:true,linkId:link.id,kind:link.kind,travelCost:link.travelCost,from:{...from,entityId:entity(from).id},destination:{...to,entityId:entity(to).id},note:'Проверьте габарит игрока и живые препятствия в месте прибытия перед перемещением.'};
}
