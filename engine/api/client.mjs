import {LabError} from './config.mjs';
// Optional HTTP transport. Direct generation does not need this or a server.
export function createLabClient(baseURL,{fetch:transport=globalThis.fetch}={}){
 const base=new URL(String(baseURL).replace(/\/?$/,'/'),globalThis.location?.href);
 if(!['http:','https:'].includes(base.protocol)||typeof transport!=='function')throw new LabError('INVALID_CLIENT','Нужен HTTP(S)адрес лаборатории и fetch.');
 async function call(endpoint,value,{signal}={}){
  const response=await transport(new URL('api/'+endpoint,base),value===undefined?{signal}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value),signal});
  let data;try{data=await response.json();}catch{throw new LabError('INVALID_RESPONSE','Лаборатория вернула ответ без JSON.');}
  if(!response.ok||!data.ok){const error=new LabError(data.error?.code??'HTTP_ERROR',data.error?.message??'Ошибка HTTP '+response.status,data.error?.details??null);error.status=response.status;throw error;}
  return Object.hasOwn(data,'result')?data.result:data;
 }
 return{info:options=>call('info',undefined,options),contract:options=>call('contract',undefined,options),
  atlasPath:(map,parameters={},options)=>call('map/atlas-path',{map,...parameters},options),
  atlasState:(map,options)=>call('map/atlas-state',{map},options),atlasTick:(map,state,parameters={},options)=>call('map/atlas-tick',{map,state,options:parameters},options),atlasAction:(map,state,action,options)=>call('map/atlas-action',{map,state,action},options),
  generate:(request,options)=>call('generate',request,options),normalize:(request,options)=>call('normalize',request,options),
  validate:(snapshot,options)=>call('validate',snapshot,options),diagnose:(snapshot,options)=>call('diagnose',snapshot,options),tiles:(snapshot,options)=>call('tiles',snapshot,options),
  mapContract:options=>call('map/contract',undefined,options),build:(request,options)=>call('map/generate',request,options),validateMap:(snapshot,options)=>call('map/validate',snapshot,options),mapTiles:(snapshot,options)=>call('map/tiles',snapshot,options),regionAction:(session,action,options)=>call('map/region-action',{session,action},options),movement:(map,parameters={},options)=>call('map/movement',{map,...parameters},options),worldPath:(world,parameters={},options)=>call('map/world-path',{world,...parameters},options),inspectPoint:(map,position,parameters={},options)=>call('map/inspect',{map,position,...parameters},options),batch:(request,parameters={},options)=>call('map/batch',{request,options:parameters},options)};
}
