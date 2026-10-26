import {ATLAS_MATERIALS,ATLAS_ROCKS} from '../engine/api/atlas-catalog.mjs';
import {validateCatalog} from '../content/registry.mjs';
export {validateCatalog};
const land={allowedEnvironments:['land','underground'],requiresWalkable:true,requiresEmptyTile:true};
const definition=(id,name,category,type,channel,color,glyph,extra={})=>({id,name,category,type,subtype:'default',channel,color,glyph,footprint:{width:1,height:1},blocking:false,constraints:{...land},properties:{},...extra});
export const DEFAULT_CATALOG=Object.freeze([
 definition('chest','Сундук','items','container','prop','#dfc77d','□',{properties:{contents:[],lootTable:'default'}}),
 definition('supply','Припасы','items','supplies','prop','#a1c6db','▣'),
 definition('guard','Охранник','fauna','human','actor','#d88e7e','●',{subtype:'security',properties:{aggression:'hostile'}}),
 definition('beast','Пещерный зверь','fauna','monster','actor','#cc9181','◆',{constraints:{...land,allowedEnvironments:['underground']}}),
 definition('boss','Крупное существо','fauna','monster','actor','#e47c95','✦',{subtype:'boss',footprint:{width:3,height:3}}),
 definition('traveler','Путешественник','fauna','human','actor','#d9d2a3','○',{subtype:'neutral'}),
 definition('deer','Олень','fauna','mammal','actor','#ccb087','○',{constraints:{...land,allowedEnvironments:['land'],allowedTerrain:['soil','snow']},properties:{aggression:'neutral',activityRadius:8}}),
 definition('fish-fresh','Пресноводная рыба','fauna','fish','actor','#8dbed0','◁',{subtype:'freshwater',constraints:{allowedEnvironments:['freshwater'],requiresWalkable:false,requiresEmptyTile:true}}),
 definition('fish-sea','Морская рыба','fauna','fish','actor','#7ab6cd','◁',{subtype:'saltwater',constraints:{allowedEnvironments:['saltwater'],requiresWalkable:false,requiresEmptyTile:true}}),
 definition('bird','Птица','fauna','bird','air','#c9d2c5','⌁',{constraints:{allowedEnvironments:['air'],requiresWalkable:false,requiresEmptyTile:true}}),
 definition('bat','Летучая мышь','fauna','flying','air','#af9dc6','⌁',{constraints:{allowedEnvironments:['air'],allowedLayerKinds:['underground','dungeon','tier'],requiresWalkable:false,requiresEmptyTile:true}}),
 definition('lever','Рычаг','objects','mechanism','prop','#e8af74','⌐',{properties:{targetId:null,action:'toggle'}}),
 definition('pump','Насос','objects','mechanism','prop','#7dc4cf','▤',{properties:{targetId:null,action:'drain'}}),
 definition('portal','Портал','objects','teleport','prop','#81c7d4','◌',{properties:{transport:{kind:'teleport',bidirectional:true,travelCost:1}}}),
 definition('stairs','Лестница','objects','transport','prop','#c7ad87','≡',{subtype:'stairs',properties:{transport:{kind:'stairs',bidirectional:true,travelCost:1}}}),
 definition('lift','Лифт','objects','transport','prop','#8fbcc7','↕',{subtype:'lift',properties:{transport:{kind:'lift',bidirectional:true,travelCost:1}}}),
 definition('lamp','Светильник','objects','light','prop','#ead595','✧',{properties:{mount:'wall',radius:5}}),
 definition('spikes','Ловушка','objects','trap','prop','#d28b68','×',{properties:{trigger:'pressure',telegraph:true}}),
 definition('workbench','Верстак','objects','structure','solid','#c5a07e','▣',{footprint:{width:2,height:1},blocking:true}),
 definition('oak','Дуб','flora','tree','solid','#719582','♣',{subtype:'deciduous',blocking:true,constraints:{...land,allowedEnvironments:['land'],allowedTerrain:['soil'],excludedTerrain:['sand','rock','water']}}),
 definition('shrub','Кустарник','flora','shrub','cover','#91a16b','♣',{constraints:{...land,allowedEnvironments:['land'],allowedTerrain:['soil']}}),
 definition('mushroom','Пещерные грибы','flora','fungus','cover','#b392b7','♣',{constraints:{...land,allowedEnvironments:['underground']}}),
 definition('algae','Водоросли','flora','aquatic','cover','#6aa889','≋',{constraints:{allowedEnvironments:['freshwater','saltwater'],requiresWalkable:false,requiresEmptyTile:true}}),
 definition('iron','Железная руда','resources','ore','subsurface','#b98371','◆',{constraints:{allowedEnvironments:['land','underground'],allowedRocks:['granite','basalt'],minDepth:0,maxDepth:100000,requiresWalkable:false,requiresEmptyTile:true},properties:{amount:100,renewable:false}}),
 definition('crystal','Кристаллы','resources','mineral','subsurface','#9dccd6','◆',{constraints:{allowedEnvironments:['underground'],requiresWalkable:false,requiresEmptyTile:true},properties:{amount:30}}),
 definition('spring','Родник','resources','source','prop','#85bfd2','≈',{properties:{medium:'freshwater',renewable:true}}),
 definition('event','Событие','events','trigger','trigger','#9fc5e7','◇',{constraints:{allowedEnvironments:['land','underground'],requiresWalkable:false,requiresEmptyTile:true},properties:{trigger:'enter',outcomes:['success','failure']}}),
 definition('timed-trial','Испытание на время','events','timed','trigger','#dfb78c','◷',{properties:{trigger:'enter',clock:'turns',budget:20,margin:3,outcomes:['success','timeout']}})
]);
export function defaultCatalog(){return structuredClone(DEFAULT_CATALOG);}
const BASIC_SURFACES={floor:{name:'Пол',color:'#657474',solid:0},wall:{name:'Нерушимая стена',color:'#293640',solid:1},destructible:{name:'Разрушаемая стена',color:'#8c7563',solid:1},soil:{name:'Земля',color:'#8b7554',solid:0},grass:{name:'Дёрн',color:'#648657',solid:0},sand:{name:'Песок',color:'#cfb77b',solid:0},rock:{name:'Скала',color:'#7f838b',solid:1},water:{name:'Пресная вода',color:'#397b9b',solid:0},sea:{name:'Морская вода',color:'#234b72',solid:0},ice:{name:'Лёд',color:'#9cbdca',solid:0},lava:{name:'Лава',color:'#c05830',solid:0}};
export const SURFACES=Object.freeze({...BASIC_SURFACES,...Object.fromEntries(Object.entries(ATLAS_MATERIALS).filter(([id])=>!Object.hasOwn(BASIC_SURFACES,id)).map(([id,m])=>[id,{name:m.name,color:m.color,solid:Object.hasOwn(ATLAS_ROCKS,id)||['bedrock','brick'].includes(id)?1:0}]))});
export const SURFACE_TRAITS=Object.freeze({normal:'Обычная',fertile:'Плодородная',poisoned:'Отравленная',frozen:'Замёрзшая',burnt:'Выжженная'});
