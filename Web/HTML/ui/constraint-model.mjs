import {validateConstraints} from '../../../content/registry.mjs';
import {ENVIRONMENTS,compare} from '../../../content/common.mjs';
import {terrainTags,environmentAt} from '../../../content/map.mjs';
import {ATLAS_BIOMES,ATLAS_MATERIALS,ATLAS_ROCKS} from '../../../engine/api/atlas-catalog.mjs';

export const LIST_FIELDS={
 allowedTerrain:{name:'Разрешённые поверхности',empty:'Любые поверхности',custom:'Свой тег поверхности',help:'Проверяются теги материала. «Почва» включает дёрн, обычную землю, глину и ил.'},
 excludedTerrain:{name:'Запрещённые поверхности',empty:'Ничего не запрещено',custom:'Свой запрещённый тег',help:'Запрет имеет приоритет над разрешением. Запрет «вода» включает реки, озёра и моря.'},
 allowedEnvironments:{name:'Среды обитания',empty:'Любые среды',help:'Наземная, подземная, пресная, морская и воздушная среды проверяются для всего габарита.'},
 allowedBiomes:{name:'Биомы',empty:'Любые биомы',custom:'Свой биом',help:'Пустой список не ограничивает биом. Отмеченные биомы могут находиться на другом уровне.'},
 allowedLevels:{name:'Физические уровни',empty:'Любые уровни',custom:'Свой ID уровня',help:'Это конкретные срезы карты, а не категории содержимого.'},
 allowedLayerKinds:{name:'Виды уровней',empty:'Любые виды уровней',custom:'Свой вид уровня',help:'Например поверхность, подземелье или карта с видом сбоку.'},
 allowedRocks:{name:'Геологические породы',empty:'Любые породы',custom:'Своя порода',help:'Это порода под поверхностью. Каменный материал и геологическая порода — разные поля карты.'}
};
export const TERRAIN_NAMES={...Object.fromEntries(Object.entries(ATLAS_MATERIALS).map(([id,e])=>[id,e.name])),floor:'Пол',door:'Дверной проём',wall:'Стена',destructible:'Разрушаемая стена',rock:'Скала / камень',sea:'Морская вода',soil:'Почва (семейство)',ground:'Наземная поверхность',interior:'Внутреннее помещение',frozen:'Замёрзшая поверхность',river:'Река',lake:'Озеро',groundwater:'Подземная вода',aquifer:'Водоносный слой',dirt:'Грунт',turf:'Дернина',loam:'Суглинок'};
export const KIND_NAMES={surface:'Поверхность',above:'Надземный срез',underground:'Подземный срез',dungeon:'Комнаты данжа',tier:'Ярус',sideview:'Карта с видом сбоку'};
export const METRIC_NAMES={elevation:'Высота',fertility:'Плодородность',temperature:'Температура',humidity:'Влажность',waterDepth:'Глубина воды',hardness:'Твёрдость'};
const fallbackKinds={dungeon:['dungeon'],tiers:['dungeon','tier'],sideview:['sideview'],caves:['underground','surface'],landscape:['surface','above','underground'],hexlandscape:['surface','above','underground']};
const namesFor={allowedTerrain:TERRAIN_NAMES,excludedTerrain:TERRAIN_NAMES,allowedEnvironments:ENVIRONMENTS,allowedBiomes:{...Object.fromEntries(Object.entries(ATLAS_BIOMES).map(([id,e])=>[id,e.name])),interior:'Помещение'},allowedRocks:Object.fromEntries(Object.entries(ATLAS_ROCKS).map(([id,e])=>[id,e.name])),allowedLayerKinds:KIND_NAMES};

export function constraintContext({layers=[],mode='dungeon',layerId=null}={}){
 const available=Object.fromEntries(Object.keys(LIST_FIELDS).map(k=>[k,new Set()])),metrics={},focused=layerId?layers.filter(l=>l.id===layerId):layers;
 let hasBiome=false,hasRock=false;const allLevels=layers.map(l=>({id:l.id,name:l.id+' · '+(KIND_NAMES[l.kind]??l.kind)+' · z '+l.z}));
 for(const l of focused){available.allowedLevels.add(l.id);available.allowedLayerKinds.add(l.kind);hasBiome||=!!l.biome;hasRock||=!!l.rock;const patterns=new Set();for(let i=0;i<l.material.length;i++){const pattern=[l.material[i],l.water[i],l.frozen?.[i]??0,l.solid[i]].join(':');if(!patterns.has(pattern)){patterns.add(pattern);for(const tag of terrainTags(l,i)){available.allowedTerrain.add(tag);available.excludedTerrain.add(tag);}}available.allowedEnvironments.add(environmentAt(l,i));if(l.biome)available.allowedBiomes.add(l.biome[i]);if(l.rock)available.allowedRocks.add(l.rock[i]);}
  // Air-channel entities may fly over otherwise compatible land/water cells.
  if(l.solid.some(n=>n===0))available.allowedEnvironments.add('air');
  for(const[field,values]of Object.entries(l.metrics??{})){const metric=metrics[field]??={min:Infinity,max:-Infinity,layers:[]};metric.layers.push(l.id);for(const v of values){metric.min=Math.min(metric.min,v);metric.max=Math.max(metric.max,v);}}
 }
 const choices={};for(const key of Object.keys(LIST_FIELDS)){available[key]=new Set([...available[key]].filter(id=>typeof id==='string'&&id.length>0&&id.length<=64));const names=key==='allowedLevels'?Object.fromEntries(allLevels.map(l=>[l.id,l.name])):namesFor[key],ids=new Set([...Object.keys(names??{}),...available[key]]);if(key==='allowedLayerKinds')for(const kind of fallbackKinds[mode]??[])ids.add(kind);choices[key]=[...ids].map(id=>({id,label:names?.[id]??id,available:available[key].has(id)})).sort((a,b)=>Number(b.available)-Number(a.available)||compare(a.label,b.label));}
 return{mode,layerId,hasMap:focused.length>0,layers:allLevels,choices,available,metrics,hasBiome,hasRock};
}

export function constraintDraft(value={}){
 validateConstraints(value);return{present:Object.keys(value),lists:Object.fromEntries(Object.keys(LIST_FIELDS).map(k=>[k,[...(value[k]??[])]])),minDepth:value.minDepth===undefined?'':String(value.minDepth),maxDepth:value.maxDepth===undefined?'':String(value.maxDepth),requiresWalkable:value.requiresWalkable===undefined?'':String(value.requiresWalkable),requiresEmptyTile:value.requiresEmptyTile===undefined?'':String(value.requiresEmptyTile),conditions:(value.conditions??[]).map(c=>({field:c.field,min:String(c.min),max:String(c.max)}))};
}
const readNumber=(raw,name)=>{if(raw===undefined||raw===null||!String(raw).trim()||!Number.isFinite(Number(raw)))throw new Error(name+': укажите конечное число.');return Number(raw);};
export function constraintsFromDraft(draft){
 const result={};for(const k of Object.keys(LIST_FIELDS)){const values=draft.lists[k]??[];if(values.length||draft.present.includes(k))result[k]=[...values];}
 for(const k of ['minDepth','maxDepth'])if(String(draft[k]??'').trim())result[k]=readNumber(draft[k],k==='minDepth'?'Глубина от':'Глубина до');
 for(const k of ['requiresWalkable','requiresEmptyTile']){if(!['','true','false'].includes(draft[k]))throw new Error('Неверный переключатель совместимости.');if(draft[k]!=='')result[k]=draft[k]==='true';}
 if(draft.conditions.length||draft.present.includes('conditions'))result.conditions=draft.conditions.map(c=>({field:c.field.trim(),min:readNumber(c.min,'Минимум условия'),max:readNumber(c.max,'Максимум условия')}));
 if(result.maxDepth!==undefined&&result.maxDepth<(result.minDepth??0))throw new Error('Глубина до не может быть меньше глубины от.');for(const c of result.conditions??[])if(c.max<c.min)throw new Error('Максимум числового условия не может быть меньше минимума.');validateConstraints(result);return result;
}
export function describeConstraints(c){const parts=[];for(const k of ['allowedTerrain','excludedTerrain','allowedEnvironments','allowedBiomes','allowedLevels','allowedLayerKinds','allowedRocks'])if(c[k]?.length){const names=namesFor[k];parts.push((k==='excludedTerrain'?'запрет: ':'')+c[k].map(id=>names?.[id]??id).join(', '));}if(c.minDepth!==undefined||c.maxDepth!==undefined)parts.push('глубина '+(c.minDepth??0)+'…'+(c.maxDepth??100000));if(c.requiresWalkable)parts.push('нужна опора');if(c.requiresEmptyTile)parts.push('свой канал свободен');for(const v of c.conditions??[])parts.push((METRIC_NAMES[v.field]??v.field)+' '+v.min+'…'+v.max);return parts.length?parts.join(' · '):'Дополнительных ограничений нет';}
export function constraintWarnings(value,context,entities=[]){
 const warnings=[];if(!context.hasMap)return['Карта ещё не создана. Списки показывают справочные значения; доступность будет проверена на готовой карте.'];
 for(const key of Object.keys(LIST_FIELDS).filter(k=>k!=='excludedTerrain'))if(value[key]?.length&&!value[key].some(v=>context.available[key].has(v)))warnings.push(LIST_FIELDS[key].name+': ни одного выбранного значения нет '+(context.layerId?'на уровне '+context.layerId:'на этой карте')+'.');
 for(const c of value.conditions??[]){const metric=context.metrics[c.field],name=METRIC_NAMES[c.field]??c.field;if(!metric)warnings.push('Числовое поле «'+name+'» не предоставлено выбранными уровнями.');else if(c.max<metric.min||c.min>metric.max)warnings.push('Диапазон «'+name+'» не пересекается со значениями на карте.');}
 if(value.allowedTerrain?.length&&value.allowedTerrain.every(t=>value.excludedTerrain?.includes(t)))warnings.push('Все разрешённые теги одновременно запрещены. Проверьте список поверхностей.');
 for(const e of entities){for(const key of ['allowedEnvironments','allowedBiomes','allowedLevels','allowedLayerKinds','allowedRocks'])if(value[key]?.length&&e.constraints[key]?.length&&!value[key].some(v=>e.constraints[key].includes(v))&&!(key==='allowedEnvironments'&&e.channel==='air'&&(e.constraints[key].includes('air')||value[key].includes('air'))))warnings.push(e.name+': выбранные '+LIST_FIELDS[key].name.toLowerCase()+' не пересекаются с ограничениями сущности.');if((value.minDepth??0)>(e.constraints.maxDepth??100000)||(value.maxDepth??100000)<(e.constraints.minDepth??0))warnings.push(e.name+': диапазоны глубины не пересекаются.');}
 return[...new Set(warnings)];
}
