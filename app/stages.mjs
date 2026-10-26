import {VlandError} from './contracts.mjs';
import {CATEGORIES} from '../content/common.mjs';
const descriptions={resources:'Залежи и источники; геология задаётся на карте.',flora:'Деревья, растения, грибы и водоросли.',fauna:'Животные, NPC, враги и воздушные существа.',objects:'Сооружения, свет, ловушки и механизмы.',items:'Сундуки, контейнеры и предметы.',events:'Источники событий; программы исполняет приложение.'};
export const CONTENT_STAGE_ORDER=['objects','items','resources','flora','fauna','events'];
export const STAGES=Object.fromEntries(CONTENT_STAGE_ORDER.map(k=>[k,{...CATEGORIES[k],description:descriptions[k]}]));
export const PLACEMENT_TYPES={
 automatic:{name:'Автоматический',description:'Распределение зон или спавнеров по подходящим клеткам карты.'},
 draw:{name:'Рисовать',description:'Кисть рисует зоны появления; карандаш ставит спавнеры. Сущности показывает предпросмотр.'}
};
export const stageOf=category=>Object.hasOwn(CATEGORIES,category)?category:undefined;
export function checkSeparatedGeneration(mode,generation){
 const reject=(o,path)=>{if(o!==undefined)throw new VlandError('MIXED_GENERATION',path+': наполнение настраивается в sources; generation описывает только карту.');};
 for(const k of ['resources','ecology','structures','events','population','placement','zones','instances','sources','content'])reject(generation[k],'generation.'+k);
 if(mode==='dungeon')reject(generation.content,'generation.content');
 if(mode==='tiers')for(const l of generation.layers??[])reject(l.request?.content,'generation.layers.request.content');
}

// Native snapshots keep their own versions and validators. No source is altered
// when opening an existing project; this path is only used for a new v4 base.
export async function buildBase(adapter,mode,generation,seed){
 if(['landscape','hexlandscape','caves','relief'].includes(mode)){
  const source=adapter.build({...generation,resources:{frequency:0,starter:false},ecology:{vegetation:0,blockingTrees:false},structures:{density:0,trails:false},events:{density:0,spawners:0}},seed);
  // Navigation repairs construct ledges, not implicit trees/canopy population.
  for(const l of source.layers.filter(l=>l.kind==='aboveground'))for(let i=0;i<l.fields.material.length;i++)if(l.fields.biome[i]==='canopy'){l.fields.biome[i]='high-ledge';l.fields.material[i]=l.fields.rock[i];}
  const {analyzeAtlas,atlasFingerprint}=await import('../engine/api/atlas.mjs');source.analysis=analyzeAtlas(source);source.fingerprint=atlasFingerprint(source);return source;
 }
 const emptyContent={intensity:0,maxSpawnsPerRoom:0,trapDensity:0,lootDensity:0,propDensity:0,floodFrequency:0,timedFrequency:0,abilityFrequency:0,environment:{enabled:false}};
 const baseGeneration=mode==='dungeon'?{...generation,content:emptyContent}:mode==='tiers'?{...generation,layers:generation.layers.map(l=>({...l,request:{...(l.request??{schema:'vland.request',schemaVersion:1,rooms:{count:5},search:{candidates:1}}),content:emptyContent}}))}:generation;
 const source=adapter.build(baseGeneration,seed);
 const {fingerprint}=await import('../engine/api/identity.mjs');
 const emptyDungeon=d=>{d.content={version:1,rooms:d.content.rooms.map(r=>({...r,danger:0,budget:{enemies:0,loot:0,traps:0,lights:0}})),hints:[],legend:{},note:'Base geometry; population is generated independently.'};d.fingerprint=fingerprint({level:d.level,content:d.content});};
 if(mode==='dungeon')emptyDungeon(source);
 if(mode==='tiers'){for(const layer of source.layers)emptyDungeon(layer.dungeon);source.fingerprint=fingerprint({...source,navigation:undefined,fingerprint:undefined});}
 if(mode==='sideview'){const {platformerFingerprint,analyzePlatformer}=await import('../engine/api/platformer.mjs');source.sites=[];source.analysis=analyzePlatformer(source);source.fingerprint=platformerFingerprint(source);}
 return source;
}
