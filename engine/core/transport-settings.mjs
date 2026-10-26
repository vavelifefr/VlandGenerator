export const TRANSPORT_DEFAULTS=Object.freeze({maxGroups:1,maxRoomsPerGroup:3,chance:1,travelCost:1});
export const WORLD_TRANSPORT_DEFAULTS=Object.freeze({...TRANSPORT_DEFAULTS,landingSize:1,types:Object.freeze({teleport:1,lift:1,stairs:1})});
const object=(v,keys)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!keys.includes(k)))throw new Error('Неверные настройки автоматических переходов или неизвестное поле.');};
export function transportSettings(input={},world=false){
 const names=Object.keys(world?WORLD_TRANSPORT_DEFAULTS:TRANSPORT_DEFAULTS);object(input,names);const value={...(world?WORLD_TRANSPORT_DEFAULTS:TRANSPORT_DEFAULTS),...input};
 for(const [key,min,max,integer]of [['maxGroups',1,4,true],['maxRoomsPerGroup',1,8,true],['chance',0,1,false],['travelCost',1,1000,false],...(world?[['landingSize',1,3,true]]:[])])if(!Number.isFinite(value[key])||value[key]<min||value[key]>max||integer&&!Number.isInteger(value[key]))throw new Error('Автоматические переходы: '+key+' — '+(integer?'целое ':'')+min+'–'+max+'.');
 if(world){object(value.types,['teleport','lift','stairs']);value.types={teleport:0,lift:0,stairs:0,...value.types};if(Object.values(value.types).some(n=>!Number.isFinite(n)||n<0||n>100)||!Object.values(value.types).some(n=>n>0))throw new Error('Разрешите хотя бы один вид автоматического перехода; веса — числа 0–100.');}
 return structuredClone(value);
}
