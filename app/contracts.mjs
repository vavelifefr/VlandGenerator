import {OPERATION_DETAILS,EXPORT_FORMATS} from './operation-contract.mjs';
import {CATEGORIES,ENVIRONMENTS,ContentError,object,keys,id,number} from '../content/common.mjs';
export const VERSION='4.0.0';
export const MODES = Object.freeze({
  relief: {name:'Рельеф',subtitle:'Высоты, склоны и формы поверхности',icon:'∿',color:'#b3bd8d',page:'relief.html'},
  dungeon: {name:'Данж',subtitle:'Комнаты, короткие связи и зависимости',icon:'▦',color:'#d9af73',page:'dungeon.html'},
  tiers: {name:'Уровни и ярусы',subtitle:'Связанные этажи и вертикальные маршруты',icon:'▱',color:'#a6a1e7',page:'tiers.html'},
  sideview: {name:'Вид сбоку',subtitle:'Платформы, способности и возвращение',icon:'⌁',color:'#7fc5bc',page:'sideview.html'},
  caves: {name:'Чанк',subtitle:'Поверхность, надземные и подземные слои',icon:'◇',color:'#b89a80',page:'chunk.html'},
  settlements: {name:'Города и деревни',subtitle:'Улицы, мосты, районы и открытые пространства',icon:'⌂',color:'#cbb18c',page:'settlements.html'},
  landscape: {name:'Ландшафт',subtitle:'Биомы, водосборы и природные слои',icon:'△',color:'#9fbf83',page:'landscape.html'},
  hexlandscape: {name:'Гексагональный ландшафт',subtitle:'Природные слои на гексагональной сетке',icon:'⬡',color:'#97b9a2',page:'hexlandscape.html'}
});
export const CATEGORY_NAMES=Object.fromEntries(Object.entries(CATEGORIES).map(([k,v])=>[k,v.name]));
export const VlandError=ContentError;
export const requireObject=object,checkKeys=keys,checkId=id,checkNumber=number;
export function checkLandscapeTopology(mode,topology){
 const kind=mode==='landscape'?'square':mode==='hexlandscape'?'hex':null;if(!kind||topology===undefined)return;
 if(!topology||typeof topology!=='object'||Array.isArray(topology)||Object.keys(topology).some(k=>k!=='kind')||topology.kind!==kind)throw new VlandError('INVALID_GENERATION',mode==='landscape'?'Ландшафт использует квадратную сетку. Для гексагонов выберите «Гексагональный ландшафт».':'Гексагональный ландшафт использует гексагоны. Для квадратов выберите «Ландшафт».');
}
export function parseJSON(value,limit=24*1024*1024){
 const isText=typeof value==='string';let text;
 try{text=isText?value:JSON.stringify(value);}catch{throw new ContentError('INVALID_JSON','Документ не представим в JSON.');}
 if(typeof text==='string'&&new TextEncoder().encode(text).length>limit)throw new ContentError('TOO_LARGE','Документ превышает допустимый размер.');
 if(!isText)return structuredClone(value);
 try{return JSON.parse(text.replace(/^\uFEFF/,''));}catch{throw new ContentError('INVALID_JSON','JSON не читается.');}
}
const loaders={relief:()=>import('./modes/relief.mjs'),settlements:()=>import('./modes/settlements.mjs'),dungeon:()=>import('./modes/dungeon.mjs'),tiers:()=>import('./modes/tiers.mjs'),sideview:()=>import('./modes/sideview.mjs'),caves:()=>import('./modes/caves.mjs'),landscape:()=>import('./modes/landscape.mjs'),hexlandscape:()=>import('./modes/hexlandscape.mjs')};
export async function provider(mode){if(typeof mode!=='string'||!Object.hasOwn(loaders,mode))throw new VlandError('UNKNOWN_MODE','Неизвестный режим: '+mode);return loaders[mode]();}
export const API_CONTRACT={name:'VlandGenerator',version:VERSION,schemaVersion:4,recipe:'vland.recipe/4',project:'vland.project/4',runtime:'vland.runtime/4',contentMap:'vland.content.map/4',modes:MODES,categories:CATEGORIES,entry:'app/index.mjs',contentEntry:'content/index.mjs',operationDetails:OPERATION_DETAILS,exportFormats:EXPORT_FORMATS,operations:['export','raster-export','diagnose','defaults','generate-base','landscape-rebuild','validate','edit','source-preview','distribution-preview','distribution-apply','runtime-init','runtime-plan','runtime-commit','runtime-update','transition-resolve','runtime','import'],editOperations:['terrain.stroke','catalog','source.put','source.mask','source.remove','paint','field','reset-edits','transport.connect','transport.disconnect'],automaticTransports:{dungeon:{path:'generation.layout.transports',types:['teleport']},tiers:{path:'generation.autoTransports',types:['teleport','lift','stairs']},natural:{path:'generation.autoTransports',modes:['landscape','hexlandscape','caves','relief'],types:['teleport','lift','stairs'],minRegionArea:32,maxLinks:128},enable:'Dungeon/tiers: layout.allowDisconnected per floor. Natural: autoTransports.enabled',bidirectional:true,maxGroupsPerLayer:4,maxRoomsPerGroup:8},limits:{recipeBytes:1048576,projectBytes:25165824,catalogEntries:256,sources:256,transitions:128,emissionsPerPlan:12000,maxConnector:24,defaultConnector:{min:1,max:3},workingSessionBytes:67108864,workingTabs:16},session:{file:'.run/working-session.json',endpoints:['open','save','heartbeat','release'],presence:'WebSocket /api/session/presence',ephemeral:true},raster:{operation:'raster-export',schema:'vland.raster/4',colorMode:'RGBA8',scope:['current','all']},note:'Геометрия и источники появления независимы. Только формат 4; прямое размещение и прежние форматы не поддерживаются.'};
