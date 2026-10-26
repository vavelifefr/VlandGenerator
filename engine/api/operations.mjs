import {LabError} from './config.mjs';
import {generateMap,validateMap,importMap,exportMap,exportMapTiles,mapView,actOnRegion} from './maps.mjs';
import {findWorldPath,analyzeWorldNavigation} from './world-navigation.mjs';
import {createMovementField,analyzeMovement} from './movement.mjs';
import {inspectPoint,describePipeline,runSeedBatch} from './analysis-tools.mjs';
import {planEncounters,applyEncounterPlan} from './encounters.mjs';
import {findAtlasPath} from './atlas-navigation.mjs';
import {analyzePlatformer} from './platformer.mjs';
import {ATLAS_BIOMES,ATLAS_RESOURCES,ATLAS_ROCKS} from './atlas-catalog.mjs';
import {createAtlasRuntime,tickAtlas,actOnAtlas} from './atlas-runtime.mjs';
export function executeMapOperation(operation,data){
 if(operation==='map-generate')return generateMap(data);
 if(operation==='map-validate')return validateMap(data);
 if(operation==='map-tiles')return exportMapTiles(data);
 if(operation==='map-export')return exportMap(data);
 if(operation==='map-import')return importMap(data);
 if(operation==='map-region-action')return actOnRegion(data.session,data.action,data.options??{});
 if(['map-atlas-state','map-atlas-action','map-atlas-tick'].includes(operation)){const atlas=importMap(data.map);if(atlas.schema!=='vland.atlas')throw new LabError('INVALID_ATLAS','Нужен atlas.');return operation==='map-atlas-state'?createAtlasRuntime(atlas):operation==='map-atlas-action'?actOnAtlas(atlas,data.state,data.action):tickAtlas(atlas,data.state,data.options??{});}
 if(operation==='map-atlas-path'){const atlas=importMap(data.map);if(atlas.schema!=='vland.atlas')throw new LabError('INVALID_ATLAS','Нужен atlas.');return findAtlasPath(atlas,data.from??atlas.spawn,data.to??atlas.exit,data.profile??atlas.request.profile);}
 if(operation==='map-world-path'){const world=importMap(data.world);if(world.schema!=='vland.world')throw new LabError('INVALID_WORLD','Нужен многоярусный мир.');return findWorldPath(world,data.from??null,data.to??null,data.options??{});}
 if(operation==='map-movement'){
  const value=importMap(data.map),view=mapView(value,data),state={...view.runtime,...data.state};if(data.includeField!==undefined&&typeof data.includeField!=='boolean')throw new LabError('INVALID_REQUEST','includeField: boolean.');
  if(value.schema==='vland.platformer')return{analysis:analyzePlatformer(value,data.physics??value.request.physics,data.options??{})};
  return{analysis:analyzeMovement(view.dungeon,data.profile??'walker',state),...(value.schema==='vland.world'?{worldAnalysis:analyzeWorldNavigation(value,{profile:data.profile??'walker',layerStates:{[view.layer.id]:state}})}:value.schema==='vland.atlas'?{worldAnalysis:findAtlasPath(value,value.spawn,value.exit,data.profile??'walker',{layerStates:{[view.layer.id]:state}})}:{}),...(data.includeField?{field:createMovementField(view.dungeon,data.profile??'walker',state)}:{})};
 }
 if(operation==='map-inspect'){
  const value=importMap(data.map),view=mapView(value,data),point=data.position;
  if(['vland.atlas.layer','vland.platformer'].includes(view.dungeon.schema)){
   const t=view.dungeon;if(!Number.isInteger(point?.x)||!Number.isInteger(point?.y)||point.x<0||point.y<0||point.x>=t.board.width||point.y>=t.board.height)throw new LabError('INVALID_POINT','Координата вне карты.');const i=point.y*t.board.width+point.x;
   if(t.schema==='vland.platformer')return{position:point,solid:t.board.walls.some(p=>p.x===point.x&&p.y===point.y),ladder:t.ladders.some(p=>p.x===point.x&&p.y===point.y),room:t.rooms.find(r=>point.x>=r.x&&point.y>=r.y&&point.x<r.x+r.width&&point.y<r.y+r.height),grants:(t.grants??[]).filter(g=>g.position.x===point.x&&g.position.y===point.y),challenges:(t.challenges??[]).filter(c=>c.barrierX===point.x||c.from.x===point.x&&c.from.y===point.y||c.to.x===point.x&&c.to.y===point.y),hazards:(t.hazards??[]).filter(h=>point.x>=h.x&&point.y>=h.y&&point.x<h.x+h.width&&point.y<h.y+h.height),physics:t.request.physics,note:t.analysis.note};
   const fields=Object.fromEntries(Object.entries(t.fields).map(([k,a])=>[k,a[i]]));return{position:point,layerId:t.id,z:t.z,global:{x:point.x+value.request.origin.x,y:point.y+value.request.origin.y},fields,biome:ATLAS_BIOMES[fields.biome],rock:ATLAS_ROCKS[fields.rock],resource:fields.resource?ATLAS_RESOURCES[fields.resource]:null,sites:t.sites.filter(s=>s.cells.some(p=>p.x===point.x&&p.y===point.y)),reason:{climate:'Биом определяется температурой, влажностью, высотой, уклоном и типом воды.',geology:'Ресурс допускается только в породах-хозяевах и диапазоне глубин.',protected:!!fields.reserved,constructed:!!fields.bridge}};
  }
  if(view.dungeon.schema==='vland.terrain'){const t=view.dungeon;if(!Number.isInteger(point?.x)||!Number.isInteger(point?.y)||point.x<0||point.y<0||point.x>=t.board.width||point.y>=t.board.height)throw new LabError('INVALID_POINT','Координата вне местности.');const index=point.y*t.board.width+point.x;return{position:{...point},global:{x:point.x+t.request.origin.x,y:point.y+t.request.origin.y},fields:Object.fromEntries(Object.entries(t.fields).map(([k,a])=>[k,a[index]]))};}
  return{point:inspectPoint(view.dungeon,point),pipeline:describePipeline(view.dungeon)};
 }
 if(operation==='map-encounters'){const value=importMap(data.map);if(value.schema!=='vland')throw new LabError('INVALID_MAP','Ситуациям нужен комнатный этаж.');const plan=planEncounters(value,data.options??{});return data.apply?applyEncounterPlan(value,plan):plan;}
 if(operation==='map-batch')return runSeedBatch(data.request,data.options??{});
 throw new LabError('UNKNOWN_OPERATION','Неизвестная операция лаборатории.');
}
