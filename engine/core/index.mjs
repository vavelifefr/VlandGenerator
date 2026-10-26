import {roomAreaBounds,areaDomain} from './area.mjs';
import {planLevel} from './planner.mjs';
import {buildTileGeometry} from './geometry.mjs';
import {validateLevel} from './validation.mjs';
import {ROOM_SHAPES,defaultShapeWeight,canonicalShapeWeights} from './shapes.mjs';
import {evaluateLevelQuality} from './quality.mjs';
import {selectionCount,selectBestLevel} from './selection.mjs';
import {planRoutePatterns} from './route-patterns.mjs';
import {isolateOptionalRoom} from './transports.mjs';
import {transportSettings} from './transport-settings.mjs';
export {planRoutePatterns,roomRouteRole,routePatternErrors,ROUTE_PATTERNS,ROUTE_ROLES} from './route-patterns.mjs';
export {planLevel} from './planner.mjs';
export {buildTileGeometry} from './geometry.mjs';
export {validateLevel,solveLevelRules,reachableRooms,reachableTiles,findTilePath} from './validation.mjs';
export {ROOM_SHAPES,SHAPE_MIN_SIZE} from './shapes.mjs';
export {LAYOUT_PRESETS} from './growth.mjs';
export {seededRandom} from './random.mjs';
export {assignDistricts,DISTRICT_TYPES} from './districts.mjs';
export {assignCompositions,COMPOSITION_TYPES} from './compositions.mjs';
export {evaluateLevelQuality} from './quality.mjs';
export {roomContains,roomAt,roomEnvelopesOverlap} from './space.mjs';
export {selectionCount,selectionSeeds,createLevelSelection,selectBestLevel} from './selection.mjs';
export function generateLevel(options={}){
 const count=selectionCount(options.selectionCandidates);
 if(count===1)return generateSingleLevel(options);
 const level=selectBestLevel(options.seed,count,seed=>generateSingleLevel({...options,seed,selectionCandidates:1}));
 level.options={...level.options,seed:options.seed,selectionCandidates:count};return level;
}
function generateSingleLevel(options){
 options={...options,transports:transportSettings(options.transports)};
 if(options.shapeWeights!==undefined)options={...options,shapeWeights:canonicalShapeWeights(options.shapeWeights)};
 const {seed,roomCount=12,preset='compact',locks=true,roomMin=10,roomMax=16,loopChance,largeRoomChance,shapeWeights,featureDensity=1,destructibleRatio=.6,dependencyMode='local',districts=true,compositions=true,interlocking=true}=options;
 if(!Number.isInteger(roomMin)||!Number.isInteger(roomMax)||roomMin<8||roomMax>24||roomMax<roomMin)throw new Error('Размеры залов:8–24.');
 if(typeof locks!=='boolean')throw new Error('locks должен быть boolean.');
 if(options.allowDisconnected!==undefined&&typeof options.allowDisconnected!=='boolean')throw new Error('allowDisconnected должен быть boolean.');
 if(!Number.isFinite(featureDensity)||featureDensity<0||featureDensity>2||!Number.isFinite(destructibleRatio)||destructibleRatio<0||destructibleRatio>1)throw new Error('Плотность укрытий:0–2, доля разрушаемого:0–1.');
 if(shapeWeights!==undefined&&(!shapeWeights||typeof shapeWeights!=='object'||Array.isArray(shapeWeights)||Object.keys(shapeWeights).some(k=>!ROOM_SHAPES.includes(k))||Object.values(shapeWeights).some(n=>!Number.isFinite(n)||n<0)||!ROOM_SHAPES.some(k=>(shapeWeights[k]??defaultShapeWeight(k))>0)))throw new Error('Неверные веса форм.');
 if(options.packing!==undefined&&!['growth','contact'].includes(options.packing))throw new Error('packing: growth или contact.');
 if(options.routePatterns!==undefined&&typeof options.routePatterns!=='boolean')throw new Error('routePatterns должен быть boolean.');
 if(options.rareLetters!==undefined&&typeof options.rareLetters!=='boolean')throw new Error('rareLetters: boolean.');
 if(options.shapeSelection!==undefined&&!['weighted','balanced'].includes(options.shapeSelection))throw new Error('shapeSelection: weighted или balanced.');
 roomAreaBounds(options);
 let plan=planLevel({seed,roomCount,preset,locks,loopChance,largeRoomChance,dependencyMode,districts,compositions});
 if(options.roomAreaMin!==undefined||options.roomAreaMax!==undefined){try{areaDomain(plan,options);}catch(error){if(!plan.nodes.some(n=>!['start','final','boss'].includes(n.purpose)&&n.spanX*n.spanY>1))throw error;plan=planLevel({seed,roomCount,preset,locks,loopChance,largeRoomChance:0,dependencyMode,districts,compositions});areaDomain(plan,options);plan.areaPolicy={largeRoomsOmitted:true,reason:'Запрошенная площадь не вмещает обычные залы в несколько логических ячеек.'};}}
 if(options.routePatterns)plan.routePatterns=planRoutePatterns(plan);
 return compileLevel(plan,{seed,roomCount,preset,locks,roomMin,roomMax,featureDensity,destructibleRatio,dependencyMode,districts,compositions,interlocking,...Object.fromEntries(['corridors','architecture','allowDisconnected','transports','roomAreaMin','roomAreaMax','roomTemplateWeights','shapeSelection','rareLetters','shapeStyle','specialShapeChance','contourVariation'].filter(k=>options[k]!==undefined&&(k!=='shapeSelection'||options[k]!=='weighted')&&(k!=='rareLetters'||options[k]!==false)&&(k!=='shapeStyle'||options[k]!=='catalog')).map(k=>[k,structuredClone(options[k])])),...(!options.packing||options.packing==='growth'?{}:{packing:options.packing}),...(options.routePatterns?{routePatterns:true}:{}),...(loopChance===undefined?{}:{loopChance}),...(largeRoomChance===undefined?{}:{largeRoomChance}),...(shapeWeights===undefined?{}:{shapeWeights:structuredClone(shapeWeights)})});
}
export function compileLevel(inputPlan,options={}){
 if(options.shapeWeights!==undefined)options={...options,shapeWeights:canonicalShapeWeights(options.shapeWeights)};
 const plan=structuredClone(inputPlan),geometry=buildTileGeometry(plan,{...options,includeTiles:true}),walls=new Map(geometry.board.walls.map(w=>[w.x+':'+w.y,w])),mechanisms=[],used=new Set(),gates=[];
 for(const edge of geometry.connections.filter(e=>e.kind!=='open')){
  const position=['one-way','breakable'].includes(edge.kind)?edge.fromDoor:edge.toDoor,type=['secret','breakable'].includes(edge.kind)?'internal':'door';walls.set(position.x+':'+position.y,{...position,type,gateId:edge.id});gates.push({id:edge.id,kind:edge.kind,position,...(edge.keyId?{keyId:edge.keyId}:{}),...(edge.controllerId?{controllerId:edge.controllerId}:{})});
 }
 for(const marker of [...plan.keys,...plan.controllers]){
  const room=geometry.rooms.find(r=>r.id===marker.roomId);if(!room)throw new Error('Неизвестная комната контроллера.');const anchor=room.doors.find(d=>d.edgeId===marker.edgeId)?.inside??room.core,choices=room.floorTiles.filter(p=>!used.has(p.x+':'+p.y)).sort((a,b)=>Math.abs(a.x-anchor.x)+Math.abs(a.y-anchor.y)-Math.abs(b.x-anchor.x)-Math.abs(b.y-anchor.y));
  const position=choices[0];if(!position)throw new Error('Нет места для контроллера.');used.add(position.x+':'+position.y);mechanisms.push({...marker,kind:plan.keys.includes(marker)?'key':'lever',position});
 }
 const level={...geometry,schema:'room-dungeon',schemaVersion:2,options:structuredClone(options),board:{...geometry.board,walls:[...walls.values()]},gates,mechanisms};
 isolateOptionalRoom(level);const validation=validateLevel(level);if(!validation.ok)throw new Error('Проверка уровня: '+validation.errors.join(' '));level.validation=validation;level.quality=evaluateLevelQuality(level);return level;
}
