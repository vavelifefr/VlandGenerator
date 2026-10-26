import {defaultShapeWeight,LEGACY_ROOM_SHAPES,canonicalShape,SHAPE_ALIASES,SHAPE_FREQUENCY_SCALES} from '../core/shapes.mjs';
import {SHAPE_STYLES,ARCHITECTURAL_SHAPES} from '../core/shape-style.mjs';
import {normalizeConfig,LabError,isObject,MAX_JSON_BYTES,SHAPES,GENERATOR_KEYS} from './config.mjs';
export const REQUEST_SCHEMA='vland.request';
export const REQUEST_CONTRACT=Object.freeze({schema:REQUEST_SCHEMA,schemaVersion:1,units:'Клетки; размеры комнаты включают внешние стены.',
 roomCount:{min:1,max:30,excludes:['start','exit']},legacyTotalRoomCount:{min:2,max:120},roomSize:{min:8,max:24},maxConnectorLength:24,defaultConnectorLength:{min:1,max:3},candidates:{min:1,max:9},shapeAliases:SHAPE_ALIASES,shapeFrequencyScales:SHAPE_FREQUENCY_SCALES,shapeStyles:SHAPE_STYLES,defaultShapeStyle:'architectural',architecturalShapes:ARCHITECTURAL_SHAPES,
 formats:{request:'Задание генератору',recipe:'Расширенный рецепт',bundle:'Сохранённый результат со snapshot',tiles:'Плоские слои для движка'},
 entry:'api/index.mjs',schemaFile:'schemas/request.schema.json',examples:['examples/request.json','examples/request-fps.json','examples/request-bullet-hell.json'],
 note:'generateDungeon принимает request, recipe или их JSON-строку. importDungeon загружает готовую карту без новой генерации.'});
function parse(source){
 if(typeof source!=='string')return source;
 if(new TextEncoder().encode(source).byteLength>MAX_JSON_BYTES)throw new LabError('JSON_TOO_LARGE','JSON превышает24MiB.');
 try{return JSON.parse(source.replace(/^\uFEFF/,''));}catch{throw new LabError('INVALID_JSON','Не удалось прочитать JSON задания.');}
}
function fields(value,allowed,path){
 if(!isObject(value))throw new LabError('INVALID_REQUEST',`${path}: нужен объект.`,[{path,message:'Ожидается объект.'}]);
 for(const key of Object.keys(value))if(!allowed.includes(key))throw new LabError('INVALID_REQUEST',`${path}.${key}: неизвестное поле.`,[{path:path+'.'+key,message:'Неизвестное поле.'}]);
 return value;
}
export function requestToRecipe(source){
 const input=parse(source);fields(input,['schema','schemaVersion','seed','profile','rooms','layout','search','content','requirements'],'$');
 if(input.schema!==REQUEST_SCHEMA||input.schemaVersion!==1)throw new LabError('INVALID_REQUEST','Нужны schema:"vland.request" и schemaVersion:1.',[{path:'$.schemaVersion',message:'Неподдерживаемый формат задания.'}]);
 const rooms=fields(input.rooms??{},['count','minSize','maxSize','minArea','maxArea','shapes','weights','templates','selection','rareLetters','style','specialChance','contourVariation'],'$.rooms'),layout=fields(input.layout??{},['corridors','architecture','allowDisconnected','transports','preset','packing','routePatterns','loopChance','largeRoomChance','featureDensity','destructibleRatio','locks','dependencyMode','districts','compositions','interlocking'],'$.layout'),search=fields(input.search??{},['candidates','mode','qualityWeight'],'$.search');
 if(rooms.count!==undefined&&(!Number.isInteger(rooms.count)||rooms.count<1||rooms.count>30))throw new LabError('INVALID_REQUEST','$.rooms.count: целое1–30, без старта и выхода.',[{path:'$.rooms.count',message:'Нужно1–30 комнат; старт и выход добавляются.'}]);
 const generator={packing:'contact',routePatterns:true,shapeSelection:'balanced',rareLetters:true,shapeStyle:'architectural',...layout};
 for(const [key,target]of [['count','roomCount'],['minSize','roomMin'],['maxSize','roomMax'],['minArea','roomAreaMin'],['maxArea','roomAreaMax'],['templates','roomTemplateWeights'],['selection','shapeSelection'],['rareLetters','rareLetters'],['style','shapeStyle'],['specialChance','specialShapeChance'],['contourVariation','contourVariation']])if(rooms[key]!==undefined)generator[target]=key==='count'?rooms[key]+2:rooms[key];
 if(rooms.shapes!==undefined){
  if(rooms.weights!==undefined)throw new LabError('INVALID_REQUEST','$.rooms: задайте shapes либо weights, не оба поля.');
  if(!Array.isArray(rooms.shapes)||!rooms.shapes.length||rooms.shapes.some(id=>!LEGACY_ROOM_SHAPES.includes(id))||new Set(rooms.shapes).size!==rooms.shapes.length)throw new LabError('INVALID_REQUEST','$.rooms.shapes: непустой список неповторяющихся известных форм.',[{path:'$.rooms.shapes',message:'Неверный список форм.'}]);
  const shapes=new Set(rooms.shapes.map(canonicalShape));
  generator.shapeWeights=Object.fromEntries(SHAPES.map(id=>[id,shapes.has(id)?1:0]));
 }
 if(rooms.weights!==undefined)generator.shapeWeights=rooms.weights;
 try{return normalizeConfig({seed:input.seed,profile:input.profile,candidates:search.candidates,generator,content:input.content,requirements:input.requirements,selection:{mode:search.mode??'quality',qualityWeight:search.qualityWeight??.8}});}
 catch(error){if(error instanceof LabError&&error.details===null)error.details=[{path:'$',message:error.message}];throw error;}
}
export function recipeToRequest(input={}){
 const recipe=normalizeConfig(input),g=recipe.generator;
 if(g.roomCount<3||g.roomCount>32)throw new LabError('LEGACY_ROOM_COUNT','Этот старый рецепт содержит '+g.roomCount+' комнат. Сохраните snapshot или задайте1–30 комнат без старта и выхода.');
 const shapes=SHAPES.filter(id=>(g.shapeWeights?.[id]??defaultShapeWeight(id))>0);
 const weighted=g.shapeWeights&&(Object.keys(g.shapeWeights).length!==SHAPES.length||Object.values(g.shapeWeights).some(n=>n!==0&&n!==1));
 return{schema:REQUEST_SCHEMA,schemaVersion:1,seed:recipe.seed,profile:recipe.profile,rooms:{count:g.roomCount-2,minSize:g.roomMin,maxSize:g.roomMax,selection:g.shapeSelection??'weighted',rareLetters:g.rareLetters??false,style:g.shapeStyle??'catalog',...(g.specialShapeChance===undefined?{}:{specialChance:g.specialShapeChance}),...(g.contourVariation===undefined?{}:{contourVariation:g.contourVariation}),...(g.roomAreaMin===undefined?{}:{minArea:g.roomAreaMin}),...(g.roomAreaMax===undefined?{}:{maxArea:g.roomAreaMax}),...(g.roomTemplateWeights?{templates:structuredClone(g.roomTemplateWeights)}:{}),...(g.shapeWeights?(weighted?{weights:structuredClone(g.shapeWeights)}:{shapes}):{})},
  layout:{...Object.fromEntries(Object.entries(g).filter(([k])=>GENERATOR_KEYS.includes(k)&&!['roomCount','roomMin','roomMax','roomAreaMin','roomAreaMax','roomTemplateWeights','shapeSelection','rareLetters','shapeWeights','shapeStyle','specialShapeChance','contourVariation'].includes(k))),packing:g.packing??'growth',routePatterns:g.routePatterns??false},
  search:{candidates:recipe.candidates,mode:recipe.selection?.mode??'quality',qualityWeight:recipe.selection?.qualityWeight??.8},content:recipe.content,requirements:recipe.requirements};
}
export const normalizeRequest=input=>recipeToRequest(requestToRecipe(input));
export function resolveRecipe(input={}){const data=parse(input);return data?.schema===REQUEST_SCHEMA?requestToRecipe(data):normalizeConfig(data);}
export const REQUEST_TEMPLATE=Object.freeze({schema:REQUEST_SCHEMA,schemaVersion:1,seed:42,profile:'exploration',rooms:{count:14,minSize:10,maxSize:22,shapes:[...SHAPES]},layout:{preset:'rings',packing:'contact',routePatterns:true},search:{candidates:3,mode:'quality'},content:{theme:'sci-fi',genre:'turn-based'}});
