import {validateSeedBatch} from './batch-report.mjs';
import {LabError,API_VERSION,GENERATOR_VERSION,MAX_JSON_BYTES} from './config.mjs';
import {generateDungeon} from './generate.mjs';
import {REQUEST_TEMPLATE} from './request.mjs';
import {validateDungeon,importDungeon} from './serialization.mjs';
import {exportTileGrid} from './tiles.mjs';
import {fingerprint} from './identity.mjs';
import {generateWorld,validateWorld,WORLD_REQUEST_TEMPLATE} from './world.mjs';
import {generateTerrain,validateTerrain,analyzeTerrain,exportTerrainTiles,TERRAIN_REQUEST_TEMPLATE} from './terrain.mjs';
import {analyzeWorldNavigation} from './world-navigation.mjs';
import {planEncounters,applyEncounterPlan} from './encounters.mjs';
import {createSeedBatch} from './analysis-tools.mjs';
import {createMovementField,movementFits,findMovementPath} from './movement.mjs';
import {generateAtlas,validateAtlas,analyzeAtlas,exportAtlasTiles} from './atlas.mjs';
import {ATLAS_REQUEST_TEMPLATE,ATLAS_VERSION} from './atlas-catalog.mjs';
import {findAtlasPath} from './atlas-navigation.mjs';
import {PLATFORMER_VERSION,PLATFORMER_REQUEST_TEMPLATE,generatePlatformer,validatePlatformer,analyzePlatformer,exportPlatformerTiles} from './platformer.mjs';
import {REGIONS_REQUEST_TEMPLATE,createRegionPlan,validateRegionPlan,createRegionState,validateRegionState,loadRegion,visitRegion,travelRegion,transactRegion,regenerateRegionContent,replaceRegion} from './regions.mjs';
const seal=value=>({...value,fingerprint:fingerprint({...value,fingerprint:undefined})}),parse=(input,limit=MAX_JSON_BYTES)=>{if(typeof input!=='string')return input;if(new TextEncoder().encode(input).byteLength>limit)throw new LabError('JSON_TOO_LARGE','Превышен лимит JSON.');try{return JSON.parse(input.replace(/^\uFEFF/,''));}catch{throw new LabError('INVALID_JSON','JSON не читается.');}};
const only=(v,allowed)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!allowed.includes(k)))throw new LabError('INVALID_REQUEST','Неверный объект или неизвестное поле задания.');};
export const MAP_PROVIDERS=Object.freeze({caverns:{name:'Система пещер',requestSchema:'vland.atlas.request',snapshotSchema:'vland.atlas'},atlas:{name:'Ландшафт и недра',requestSchema:'vland.atlas.request',snapshotSchema:'vland.atlas'},platformer:{name:'Вид сбоку',requestSchema:'vland.platformer.request',snapshotSchema:'vland.platformer'},rooms:{name:'Комнатный этаж',requestSchema:'vland.request',snapshotSchema:'vland'},encounters:{name:'Тактические ситуации',requestSchema:'vland.encounters.request',snapshotSchema:'vland'},world:{name:'Несколько физических ярусов',requestSchema:'vland.world.request',snapshotSchema:'vland.world'},regions:{name:'Регионы и журнал изменений',requestSchema:'vland.regions.request',snapshotSchema:'vland.region-session'},terrain:{name:'Ландшафт',requestSchema:'vland.terrain.request',snapshotSchema:'vland.terrain'},cave:{name:'Пещера',requestSchema:'vland.terrain.request',snapshotSchema:'vland.terrain'},batch:{name:'Пакет seed',requestSchema:'vland.batch.request',snapshotSchema:'vland.seed-batch'}});
export const MAP_REQUEST_TEMPLATES=Object.freeze({caverns:{...ATLAS_REQUEST_TEMPLATE,preset:'caverns'},atlas:ATLAS_REQUEST_TEMPLATE,platformer:PLATFORMER_REQUEST_TEMPLATE,rooms:REQUEST_TEMPLATE,encounters:{schema:'vland.encounters.request',schemaVersion:1,request:{...REQUEST_TEMPLATE,search:{candidates:1}},settings:{budget:10,maxActors:5}},world:WORLD_REQUEST_TEMPLATE,regions:REGIONS_REQUEST_TEMPLATE,terrain:TERRAIN_REQUEST_TEMPLATE,cave:{...TERRAIN_REQUEST_TEMPLATE,kind:'cave'},batch:{schema:'vland.batch.request',schemaVersion:1,request:{...REQUEST_TEMPLATE,search:{candidates:1}},count:8}});
export const MAP_CONTRACT=Object.freeze({apiVersion:API_VERSION,generatorVersion:GENERATOR_VERSION,atlasVersion:ATLAS_VERSION,platformerVersion:PLATFORMER_VERSION,platformerSchemas:[1,2],entry:'api/index.mjs',build:'generateMap(request)',import:'importMap(snapshot)',validate:'validateMap(snapshot)',tiles:'exportMapTiles(snapshot)',providers:MAP_PROVIDERS,examples:MAP_REQUEST_TEMPLATES,limits:{atlasLayers:9,worldLayers:8,atlasCells:98304,platformerCells:100000,layers:8,regions:12,totalWorldCells:250000,terrainCells:32768,journalEvents:256,significantCapabilities:16,dependencyStates:16384,batchCandidates:64,requestBytes:65536,snapshotBytes:MAX_JSON_BYTES},note:'Комнатные проходы1–3. Ярусы и региональные порталы — отдельные связи. Профили проверяют клетки/габариты; Platformer2 проверяет физику25мс, получение double-jump/dash/wall-jump и возврат; Platformer1 сохранён отдельно. Navmesh, физику конкретного движка, боевой AI и графику исполняет адаптер.'});
export function createRegionSession(plan){let state=createRegionState(plan);state=loadRegion(plan,state,plan.entryRegionId).state;return seal({schema:'vland.region-session',schemaVersion:1,apiVersion:API_VERSION,generatorVersion:GENERATOR_VERSION,plan,state,position:null});}
export function generateMap(input){
 const request=parse(input,65536);if(request?.schema===undefined||request.schema==='vland.request')return generateDungeon(request);
 if(request.schema==='vland.world.request')return generateWorld(request);
 if(request.schema==='vland.atlas.request')return generateAtlas(request);
 if(request.schema==='vland.platformer.request')return generatePlatformer(request);
 if(request.schema==='vland.terrain.request')return generateTerrain(request);
 if(request.schema==='vland.regions.request')return createRegionSession(createRegionPlan(request));
 if(request.schema==='vland.encounters.request'){only(request,['schema','schemaVersion','request','settings']);if(request.schemaVersion!==1)throw new LabError('INVALID_REQUEST','Неподдерживаемая версия ситуаций.');const map=generateDungeon(request.request??REQUEST_TEMPLATE);return{...applyEncounterPlan(map,planEncounters(map,request.settings??{})),sourceRequest:structuredClone(request)};}
 if(request.schema==='vland.batch.request'){const batch=createMapBatch(request);for(let i=0;i<batch.count;i++)batch.evaluate(i);return batch.finish();}
 throw new LabError('INVALID_REQUEST','Неизвестная схема задания. Смотрите MAP_CONTRACT.');
}
export function createMapBatch(request){only(request,['schema','schemaVersion','request','count','startSeed']);if(request.schema!=='vland.batch.request'||request.schemaVersion!==1)throw new LabError('INVALID_REQUEST','Нужен vland.batch.request версии 1.');return createSeedBatch(request.request??REQUEST_TEMPLATE,{...(request.count===undefined?{}:{count:request.count}),...(request.startSeed===undefined?{}:{startSeed:request.startSeed})});}
export function validateMap(value){
 try{
  if(value?.schema==='vland'||value?.schema==='room-dungeon')return validateDungeon(value);
  if(value?.schema==='vland.world')return validateWorld(value);
  if(value?.schema==='vland.atlas')return validateAtlas(value);
  if(value?.schema==='vland.platformer')return validatePlatformer(value);
  if(value?.schema==='vland.terrain')return validateTerrain(value);
  if(value?.schema==='vland.regions')return validateRegionPlan(value);
  if(value?.schema==='vland.seed-batch')return validateSeedBatch(value);
  if(value?.schema==='vland.region-session'){
   if(value.schemaVersion!==1||value.apiVersion!==1||value.fingerprint!==fingerprint({...value,fingerprint:undefined}))throw new Error('Неверный отпечаток сессии.');const plan=validateRegionPlan(value.plan);if(!plan.ok)return plan;const state=validateRegionState(value.plan,value.state);if(!state.ok)return state;
   if(value.position){const region=value.state.regions[value.position.regionId];if(!region||!value.state.visited.includes(value.position.regionId))throw new Error('Позиция относится к незагруженному/непосещённому региону.');const field=createMovementField(region.dungeon,'walker',region.runtime);if(!movementFits(field,value.position))throw new Error('Позиция актора перекрыта.');}
   return{...state,kind:'region-session',regions:value.plan.regions.length};
  }
  throw new Error('Неизвестный формат карты.');
 }catch(error){return{ok:false,errors:[error.message],code:error.code??'INVALID_MAP'};}
}
export function importMap(input){const value=parse(input),report=validateMap(value);if(!report.ok)throw new LabError(report.code??'INVALID_MAP',report.errors.join(' '));if(['room-dungeon','vland'].includes(value.schema))return importDungeon(value);const result=structuredClone(value);if(result.schema==='vland.atlas'){result.navigation=findAtlasPath(result);result.analysis=analyzeAtlas(result);}if(result.schema==='vland.platformer')result.analysis=analyzePlatformer(result);if(result.schema==='vland.world')result.navigation=analyzeWorldNavigation(result);if(result.schema==='vland.terrain')result.analysis=analyzeTerrain(result);return result;}
export function exportMap(value){const report=validateMap(value);if(!report.ok)throw new LabError('INVALID_MAP',report.errors.join(' '));let text=JSON.stringify(value,null,2)+'\n';if(new TextEncoder().encode(text).byteLength>MAX_JSON_BYTES)text=JSON.stringify(value)+'\n';if(new TextEncoder().encode(text).byteLength>MAX_JSON_BYTES)throw new LabError('JSON_TOO_LARGE','Snapshot превышает24MiB.');return text;}
export function exportMapTiles(input){
 const value=importMap(input);if(value.schema==='vland')return exportTileGrid(value);
 if(value.schema==='vland.terrain')return exportTerrainTiles(value);
 if(value.schema==='vland.atlas')return exportAtlasTiles(value);
 if(value.schema==='vland.platformer')return exportPlatformerTiles(value);
 if(value.schema==='vland.world')return{schema:'vland.world.tiles',schemaVersion:1,sourceFingerprint:value.fingerprint,spawn:structuredClone(value.spawn),exit:structuredClone(value.exit),layers:value.layers.map(l=>({id:l.id,elevation:l.elevation,headroom:l.headroom,tiles:exportTileGrid(l.dungeon),reservations:structuredClone(l.reservations)})),verticalLinks:structuredClone(value.verticalLinks),grants:structuredClone(value.grants)};
 if(value.schema==='vland.regions'||value.schema==='vland.region-session'){const plan=value.plan??value,state=value.state;return{schema:'vland.regions.tiles',schemaVersion:1,sourceFingerprint:value.fingerprint,regions:plan.regions.map(r=>({id:r.id,boundary:structuredClone(r.boundary),loaded:!!state?.regions[r.id],visited:state?.visited.includes(r.id)??false,tiles:exportTileGrid(state?.regions[r.id]?.dungeon??r.level,state?.regions[r.id]?.runtime??{})})),connections:structuredClone(plan.connections),entryRegionId:plan.entryRegionId,exitRegionId:plan.exitRegionId};}
 throw new LabError('NO_TILE_MAP','Пакет seed содержит сводку, а не клеточную карту.');
}
export function mapView(value,{layerId,regionId}={}){
 if(value.schema==='vland.atlas'){const layer=value.layers.find(l=>l.id===(layerId??value.spawn.layerId));if(!layer)throw new LabError('INVALID_ATLAS','Неизвестный Z-срез.');return{dungeon:layer,runtime:{},layer};}
 if(value.schema==='vland.platformer')return{dungeon:value,runtime:{}};
 if(value.schema==='vland')return{dungeon:value,runtime:{}};
 if(value.schema==='vland.world'){const layer=value.layers.find(l=>l.id===(layerId??value.layers[0].id));if(!layer)throw new LabError('INVALID_WORLD','Неизвестный ярус.');return{dungeon:layer.dungeon,runtime:{},layer};}
 if(value.schema==='vland.region-session'){const id=regionId??value.plan.entryRegionId,loaded=value.state.regions[id];if(!loaded)throw new LabError('UNLOADED_REGION','Сначала загрузите регион.');return{dungeon:loaded.dungeon,runtime:loaded.runtime,regionId:id};}
 if(value.schema==='vland.terrain')return{dungeon:value,runtime:{}};
 throw new LabError('NO_TILE_MAP','Здесь нет единичной карты для просмотра.');
}
export function actOnRegion(input,action,{actors=[]}={}){
 const session=importMap(input),reject=error=>({ok:false,session:input,error});try{
  if(session.schema!=='vland.region-session')throw new Error('Нужна региональная сессия.');only(action,['type','regionId','id','operations','position','dungeon']);let state=session.state,position=session.position;
  const live=[...actors,...(position?[{id:'session-actor',regionId:position.regionId,position:{x:position.x,y:position.y}}]:[])];
  if(action.type==='load')state=loadRegion(session.plan,state,action.regionId).state;
  else if(action.type==='visit'){state=visitRegion(session.plan,state,action.regionId);const port=session.plan.regions.find(r=>r.id===action.regionId).boundary.ports[0];position={regionId:action.regionId,...port.anchor};}
  else if(action.type==='move'){if(!position||!action.position)throw new Error('Сначала войдите в регион и выберите клетку.');const region=state.regions[position.regionId];if(!findMovementPath(region.dungeon,position,action.position,'walker',region.runtime))throw new Error('Нет пути к выбранной клетке.');position={regionId:position.regionId,x:action.position.x,y:action.position.y};}
  else if(action.type==='travel'){if(!position)throw new Error('Сначала войдите в регион.');if(action.position)throw new Error('Для перемещения используйте move.');const result=travelRegion(session.plan,state,position,action.id);if(!result.ok)throw new Error(result.error);state=result.state;position=result.position;}
  else if(action.type==='regenerate'){const result=regenerateRegionContent(session.plan,state,action.regionId,{actors:live});if(!result.ok)throw new Error(result.error);state=result.state;}
  else if(action.type==='replace'){const result=replaceRegion(session.plan,state,action.regionId,action.dungeon,{actors:live});if(!result.ok)throw new Error(result.error);state=result.state;}
  else if(action.type==='transaction'){const result=transactRegion(session.plan,state,{id:action.id,regionId:action.regionId,operations:action.operations},{actors:live});if(!result.ok)throw new Error(result.error);state=result.state;}
  else throw new Error('Неизвестное действие региона.');return{ok:true,session:seal({...session,state,position})};
 }catch(error){return reject(error.message);}
}
