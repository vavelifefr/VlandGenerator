import {corridorSettings} from '../core/corridors.mjs';
import {environmentSettings} from './environment-catalog.mjs';
import {templateWeights} from '../core/templates.mjs';
import {roomAreaBounds} from '../core/area.mjs';
import {SETPIECE_DEFAULTS,thematicOptions} from './content-catalog.mjs';
import {ROOM_SHAPES,LEGACY_ROOM_SHAPES,SHAPE_MIN_SIZE,defaultShapeWeight,canonicalShapeWeights} from '../core/shapes.mjs';
import {populationSettings} from './population.mjs';
import {shapeStyleSettings} from '../core/shape-style.mjs';
import {transportSettings} from '../core/transport-settings.mjs';
export const API_VERSION = 1;
export const GENERATOR_VERSION = '1.6.0';
export const MAX_JSON_BYTES = 24 * 1024 * 1024;
export class LabError extends Error {
  constructor(code, message, details = null) { super(message); this.name = 'LabError'; this.code = code; this.details = details; }
}
export const PROFILES = Object.freeze(Object.fromEntries(Object.entries({
  balanced: {name:'Смешанный этаж', generator:{roomCount:12,preset:'compact',roomMin:10,roomMax:18,loopChance:.5,featureDensity:1},weights:{route:25,topology:20,variety:20,packing:20,structure:15},intensity:.55},
  exploration: {name:'Исследование', generator:{roomCount:20,preset:'rings',roomMin:10,roomMax:22,loopChance:.85,featureDensity:.8},weights:{route:30,topology:35,variety:20,packing:5,structure:10},intensity:.4},
  tactical: {name:'Тактические залы', generator:{roomCount:16,preset:'sectors',roomMin:12,roomMax:22,loopChance:.65,largeRoomChance:.7,featureDensity:1.6},weights:{route:20,topology:20,variety:20,packing:15,structure:25},intensity:.75},
  raid: {name:'Короткий рейд', generator:{roomCount:8,preset:'branches',roomMin:10,roomMax:16,loopChance:.2,featureDensity:1.2},weights:{route:45,topology:10,variety:15,packing:20,structure:10},intensity:.65}
}).map(([id,p])=>[id,Object.freeze({...p,generator:Object.freeze(p.generator),weights:Object.freeze(p.weights)})])));
export const SHAPES = ROOM_SHAPES;
export const GENERATOR_KEYS = Object.freeze(['corridors','architecture','allowDisconnected','transports','roomCount','preset','roomMin','roomMax','loopChance','largeRoomChance','featureDensity','destructibleRatio','shapeWeights','locks','dependencyMode','districts','compositions','interlocking','packing','routePatterns','roomAreaMin','roomAreaMax','roomTemplateWeights','shapeSelection','rareLetters','shapeStyle','specialShapeChance','contourVariation']);
export const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
export function assertObject(v, name) { if (!isObject(v)) throw new LabError('INVALID_CONFIG', `${name}: требуется объект.`); }
export function number(v, min, max, name, integer = false) {
  if (!Number.isFinite(v) || v < min || v > max || integer && !Number.isInteger(v)) throw new LabError('INVALID_CONFIG', `${name}: ${integer?'целое ':''}${min}–${max}.`);
  return v;
}
function keys(v, allowed, name) { assertObject(v,name); for (const k of Object.keys(v)) if (!allowed.includes(k)) throw new LabError('INVALID_CONFIG', `${name}: неизвестное поле ${k}.`); }
export function normalizeConfig(input = {}) {
  keys(input,['seed','profile','candidates','generator','content','requirements','selection'],'Рецепт');
  const profile = input.profile ?? 'balanced';
  if (!Object.hasOwn(PROFILES,profile)) throw new LabError('INVALID_CONFIG','Неизвестный профиль этажа.');
  const seed = number(input.seed ?? 42,0,0xffffffff,'seed',true), candidates = number(input.candidates ?? 3,1,9,'candidates',true);
  const supplied = input.generator ?? {}; keys(supplied,GENERATOR_KEYS,'generator');
  const g = {allowDisconnected:false,locks:true,dependencyMode:'local',destructibleRatio:.6,districts:true,compositions:true,interlocking:true,...PROFILES[profile].generator,...structuredClone(supplied)};
  const styles={compact:{preset:'compact',corridors:{minLength:1,maxLength:3,preferredLength:1,openWidth:1}},gallery:{preset:'branches',corridors:{minLength:3,maxLength:12,preferredLength:6,openWidth:2}},clustered:{preset:'sectors',corridors:{minLength:1,maxLength:8,preferredLength:2,openWidth:1}},ring:{preset:'rings',loopChance:.85,corridors:{minLength:1,maxLength:6,preferredLength:2,openWidth:1}}};
  const style=styles[supplied.architecture];if(style)for(const [k,v]of Object.entries(style))if(supplied[k]===undefined)g[k]=structuredClone(v);
  g.corridors=corridorSettings(g.corridors);g.architecture??='organic';if(!['organic','compact','gallery','clustered','ring'].includes(g.architecture))throw new LabError('INVALID_CONFIG','Неизвестный профиль архитектуры.');
  try{g.transports=transportSettings(g.transports);}catch(e){throw new LabError('INVALID_CONFIG',e.message);}
  number(g.roomCount,2,120,'roomCount',true);number(g.roomMin,8,24,'roomMin',true);number(g.roomMax,g.roomMin,24,'roomMax',true);
  if (!['compact','rings','branches','sectors'].includes(g.preset)) throw new LabError('INVALID_CONFIG','Неизвестная компоновка.');
  if (!['local','progressive'].includes(g.dependencyMode)) throw new LabError('INVALID_CONFIG','dependencyMode: local или progressive.');
  for (const k of ['allowDisconnected','locks','districts','compositions','interlocking']) if (typeof g[k] !== 'boolean') throw new LabError('INVALID_CONFIG',`${k}: требуется boolean.`);
  if(g.packing!==undefined&&!['growth','contact'].includes(g.packing))throw new LabError('INVALID_CONFIG','generator.packing: growth или contact.');
  if(g.rareLetters!==undefined&&typeof g.rareLetters!=='boolean')throw new LabError('INVALID_CONFIG','generator.rareLetters: boolean.');
  if(g.shapeSelection!==undefined&&!['weighted','balanced'].includes(g.shapeSelection))throw new LabError('INVALID_CONFIG','generator.shapeSelection: weighted или balanced.');
  if(g.routePatterns!==undefined&&typeof g.routePatterns!=='boolean')throw new LabError('INVALID_CONFIG','generator.routePatterns: требуется boolean.');
  for (const k of ['loopChance','largeRoomChance','destructibleRatio']) if (g[k] !== undefined) number(g[k],0,1,k);
  number(g.featureDensity,0,2,'featureDensity');
  try{shapeStyleSettings(g);templateWeights(g.roomTemplateWeights);roomAreaBounds(g);}catch(error){throw new LabError('INVALID_CONFIG',error.message,[{path:'$.rooms',message:error.message}]);}
  if (g.shapeWeights !== undefined) {
    keys(g.shapeWeights,LEGACY_ROOM_SHAPES,'shapeWeights');
    for (const n of Object.values(g.shapeWeights)) number(n,0,100,'Вес формы');
    g.shapeWeights=canonicalShapeWeights(g.shapeWeights);
    if (!SHAPES.some(id=>(g.shapeWeights[id]??defaultShapeWeight(id))>0)) throw new LabError('INVALID_CONFIG','Нужна хотя бы одна разрешённая форма.');
    const required=Math.min(...SHAPES.filter(id=>(g.shapeWeights[id]??defaultShapeWeight(id))>0).map(id=>SHAPE_MIN_SIZE[id]));
    if(g.roomMin<required)throw new LabError('INVALID_CONFIG',`Для выбранных форм нужен roomMin не меньше ${required}; либо разрешите простые формы.`);
  }
  const c = input.content ?? {};keys(c,['intensity','restEvery','maxSpawnsPerRoom','trapDensity','lootDensity','lightSpacing','population','environment',...Object.keys(SETPIECE_DEFAULTS)],'content');
  const content = {intensity:PROFILES[profile].intensity,restEvery:3,maxSpawnsPerRoom:8,trapDensity:.35,lootDensity:.5,lightSpacing:6,...SETPIECE_DEFAULTS,...c};
  number(content.intensity,0,1,'intensity');number(content.restEvery,1,10,'restEvery',true);number(content.maxSpawnsPerRoom,0,24,'maxSpawnsPerRoom',true);
  number(content.trapDensity,0,1,'trapDensity');number(content.lootDensity,0,1,'lootDensity');number(content.lightSpacing,3,12,'lightSpacing',true);
  try{if(c.environment!==undefined)content.environment=environmentSettings(c.environment);thematicOptions(content);}catch(error){throw new LabError('INVALID_CONFIG',error.message);}
  try{content.population=populationSettings(c.population);}catch(error){throw new LabError('INVALID_CONFIG',error.message);}
  const r = input.requirements ?? {};keys(r,['minLoops','minMainRooms','minShapes','maxDeadEnds'],'requirements');
  const requirements = {minLoops:0,minMainRooms:2,minShapes:0,maxDeadEnds:g.roomCount,...r};
  number(requirements.minLoops,0,120,'minLoops',true);number(requirements.minMainRooms,2,g.roomCount,'minMainRooms',true);
  number(requirements.minShapes,0,Math.min(SHAPES.length,Math.max(0,g.roomCount-2)),'minShapes',true);number(requirements.maxDeadEnds,0,g.roomCount,'maxDeadEnds',true);
  let selection;
  if(input.selection!==undefined){keys(input.selection,['mode','qualityWeight'],'selection');selection={mode:'quality',qualityWeight:.8,...input.selection};if(!['quality','diverse'].includes(selection.mode))throw new LabError('INVALID_CONFIG','selection.mode: quality или diverse.');number(selection.qualityWeight,.5,1,'selection.qualityWeight');}
  return {seed,profile,candidates,generator:g,content,requirements,...(selection?{selection}:{})};
}
