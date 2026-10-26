import {ContentError,keys,number,id,hash} from './common.mjs';
export function validateMap(map){
 keys(map,['schema','schemaVersion','layers','fixtures'],'map');if(map.schema!=='vland.content.map'||map.schemaVersion!==4||!Array.isArray(map.layers)||!map.layers.length||map.layers.length>16)throw new ContentError('INVALID_MAP','Нужен vland.content.map/4 с 1–16 физическими уровнями.');const ids=new Set();let cells=0;
 for(const l of map.layers){keys(l,['topology','id','kind','z','depth','gravity','width','height','solid','material','water','biome','secondaryBiome','landform','rock','support','reserved','bridge','frozen','traits','metrics'],'layer');id(l.id,'layer.id');if(l.topology!==undefined){keys(l.topology,['kind'],'topology');if(!['square','hex'].includes(l.topology.kind))throw new ContentError('INVALID_MAP','Сетка: square или hex.');}if(ids.has(l.id))throw new ContentError('DUPLICATE_ID','Повтор физического уровня.');ids.add(l.id);number(l.width,1,4096,'width',true);number(l.height,1,4096,'height',true);number(l.z,-100000,100000,'z');number(l.depth,0,100000,'depth');if(typeof l.kind!=='string'||!l.kind.length||l.gravity!==undefined&&!['none','down'].includes(l.gravity))throw new ContentError('INVALID_MAP','Нужен kind уровня и gravity none/down.');const n=l.width*l.height;cells+=n;if(n>250000||cells>500000)throw new ContentError('TOO_LARGE','До 250000 клеток на уровень, 500000 суммарно.');
  for(const k of ['solid','material','water','biome','secondaryBiome','landform','rock','support','reserved','bridge','frozen']){const a=l[k];if(a===undefined&&!['solid','material','water'].includes(k))continue;if(!Array.isArray(a)||a.length!==n||a.some(v=>['solid','support','reserved','bridge','frozen'].includes(k)?v!==0&&v!==1:typeof v!=='string'))throw new ContentError('INVALID_MAP','Неверное поле '+l.id+'.'+k);}
  if(l.traits!==undefined&&(!Array.isArray(l.traits)||l.traits.length!==n||l.traits.some(v=>!['normal','fertile','poisoned','frozen','burnt'].includes(v))))throw new ContentError('INVALID_MAP','Неверные свойства поверхности.');
  if(l.metrics!==undefined){keys(l.metrics,Object.keys(l.metrics),'metrics');if(Object.keys(l.metrics).length>32)throw new ContentError('TOO_LARGE','До 32 числовых полей.');for(const[field,values]of Object.entries(l.metrics)){id(field,'metrics.field');if(!Array.isArray(values)||values.length!==n||values.some(v=>!Number.isFinite(v)))throw new ContentError('INVALID_MAP','Неверное числовое поле '+field);}}
 }if(!Array.isArray(map.fixtures)||map.fixtures.length>12000)throw new ContentError('INVALID_MAP','fixtures: массив обязательных элементов.');return map;
}
export const mapFingerprint=map=>hash(map);
export function terrainTags(layer,i){
 const m=layer.material[i],tags=new Set([m]);if(layer.traits?.[i]&&layer.traits[i]!=='normal')tags.add(layer.traits[i]);
 if(['soil','grass','dirt','turf','mud','clay','loam','peat'].includes(m)){tags.add('soil');tags.add('ground');}
 if(['sand','snow','ice','gravel','timber','floor'].includes(m))tags.add('ground');
 if(layer.rock?.[i]===m||['granite','basalt','limestone','slate','sandstone','shale','marble','gneiss','obsidian','halite','bedrock','rock','wall','destructible'].includes(m)){tags.add('rock');if(layer.solid[i])tags.add('wall');}
 if(['floor','door'].includes(m))tags.add('interior');
 if(layer.water[i]!=='none'&&layer.water[i]!==''){tags.add('water');tags.add(layer.water[i]);}
 if(layer.frozen?.[i]){tags.add('ice');tags.add('frozen');}if(layer.bridge?.[i]){tags.add('bridge');tags.add('ground');}
 return tags;
}
export function environmentAt(layer,i){if(layer.frozen?.[i]||layer.bridge?.[i])return layer.kind==='underground'?'underground':'land';const water=layer.water[i];if(water==='sea')return'saltwater';if(['lake','river','groundwater','aquifer'].includes(water))return'freshwater';if(layer.material[i]==='air'||layer.support?.[i]===0)return'air';return ['underground','dungeon','tier'].includes(layer.kind)?'underground':'land';}
