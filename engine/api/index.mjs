export {API_VERSION,GENERATOR_VERSION,PROFILES,SHAPES,LabError,normalizeConfig} from './config.mjs';
export {generateDungeon,createDungeonSearch,analyzeLevel} from './generate.mjs';
export {REQUEST_SCHEMA,REQUEST_CONTRACT,REQUEST_TEMPLATE,requestToRecipe,recipeToRequest,normalizeRequest,resolveRecipe} from './request.mjs';
export {diagnoseDungeon,levelSignature,signatureDistance,compareCandidates} from './diagnostics.mjs';
export {ROUTE_PATTERNS,ROUTE_ROLES} from '../core/route-patterns.mjs';
export {createLabClient} from './client.mjs';
export {planContent} from './content.mjs';
export {createSpawnerState,stepSpawners} from './spawners.mjs';
export {SPAWNER_ACTIVATIONS,SPAWNER_REPEATS,spawnerProgram,spawnerWave,describeSpawner} from './spawner-program.mjs';
export {POPULATION_TYPES,POPULATION_FAMILIES,POPULATION_DEFAULTS,populationSettings,populationKind,planPopulation,populationErrors} from './population.mjs';
export {CONTENT_CATEGORIES,CONTENT_TYPES,CONTENT_THEMES,GENRE_POLICIES,SETPIECE_DEFAULTS,thematicOptions} from './content-catalog.mjs';
export {planSetpieces,setpieceErrors,findRoomPath} from './setpieces.mjs';
export {createContentState,contentAction,contentBlockedCells,zoneCleared} from './content-runtime.mjs';
export {importDungeon,exportDungeon,validateDungeon} from './serialization.mjs';
export {exportTileGrid} from './tiles.mjs';
export {findPath,isWalkable,findFootprint,createWalkthrough,stepWalkthrough} from './navigation.mjs';
export {fingerprint} from './identity.mjs';
export {generateLevel,planLevel,compileLevel,buildTileGeometry,validateLevel,solveLevelRules,reachableRooms,reachableTiles,findTilePath,roomAt,roomContains,roomEnvelopesOverlap,LAYOUT_PRESETS,ROOM_SHAPES} from '../core/index.mjs';

export {SHAPE_MIN_SIZE} from '../core/shapes.mjs';

export {ROOM_TEMPLATES,DEFAULT_TEMPLATE_WEIGHTS} from '../core/templates.mjs';

export {LIGHT_TYPES,MEDIUM_TYPES,ENVIRONMENT_DEFAULTS,environmentSettings} from './environment-catalog.mjs';
export {planEnvironment,environmentErrors,createEnvironmentState,setCircuitPower,environmentAt} from './environment.mjs';

export {RARE_LETTER_SHAPES,SHAPE_ALIASES,SHAPE_FREQUENCY_SCALES,canonicalShape,canonicalShapeWeights,shapeWeightScale} from '../core/shapes.mjs';
export {SHAPE_STYLES,ARCHITECTURAL_SHAPES} from '../core/shape-style.mjs';
export {deriveStageSeed} from '../core/streams.mjs';
export {MOVEMENT_PROFILES,movementProfile,createMovementField,movementFits,canMovementStep,findMovementPath,analyzeMovement} from './movement.mjs';
export {ENCOUNTER_ROLES,ENCOUNTER_TYPES,planEncounters,encounterErrors,applyEncounterPlan} from './encounters.mjs';
export {WORLD_REQUEST_TEMPLATE,normalizeWorldRequest,generateWorld,validateWorld} from './world.mjs';
export {findWorldPath,analyzeWorldNavigation} from './world-navigation.mjs';
export {REGIONS_REQUEST_TEMPLATE,boundaryContract,createRegionPlan,validateRegionPlan,createRegionState,loadRegion,visitRegion,travelRegion,transactRegion,replaceRegion,regenerateRegionContent,replayRegionJournal,validateRegionState} from './regions.mjs';
export {TERRAIN_REQUEST_TEMPLATE,TERRAIN_BIOMES,normalizeTerrainRequest,valueNoise,drainageField,generateTerrain,validateTerrain,exportTerrainTiles} from './terrain.mjs';
export {inspectPoint,describePipeline,createSeedBatch,runSeedBatch} from './analysis-tools.mjs';
export {MAP_PROVIDERS,MAP_REQUEST_TEMPLATES,MAP_CONTRACT,generateMap,validateMap,importMap,exportMap,exportMapTiles,mapView,createRegionSession,actOnRegion} from './maps.mjs';
export {classifyRoomSize} from '../core/templates.mjs';

export {analyzeTerrain} from './terrain.mjs';
export {createMapBatch} from './maps.mjs';
export {ATLAS_VERSION,ATLAS_MAX_CELLS,ATLAS_REQUEST_TEMPLATE,ATLAS_DEFAULTS,ATLAS_PRESETS,ATLAS_ROCKS,ATLAS_MATERIALS,ATLAS_RESOURCES,ATLAS_BIOMES,ATLAS_STRUCTURES,ATLAS_EVENTS,normalizeAtlasRequest} from './atlas-catalog.mjs';
export {generateAtlas,validateAtlas,analyzeAtlas,exportAtlasTiles,atlasFingerprint} from './atlas.mjs';
export {findAtlasPath} from './atlas-navigation.mjs';
export {createAtlasRuntime,tickAtlas,actOnAtlas} from './atlas-runtime.mjs';
export {PLATFORMER_VERSION,PLATFORMER_ABILITIES,PLATFORMER_REQUEST_TEMPLATE,normalizePlatformerRequest,generatePlatformer,validatePlatformer,analyzePlatformer,exportPlatformerTiles,platformerFingerprint} from './platformer.mjs';
export {createPlatformerModel,simulatePlatformerAction,PLATFORMER_TICK} from '../core/platformer-physics.mjs';
export {SETTLEMENT_DEFAULTS,normalizeSettlement,generateSettlement,validateSettlement} from './settlements.mjs';
export {normalizeTopology,gridNeighbors,gridDistance,gridPosition} from '../core/topology.mjs';
export {NATURAL_TRANSPORT_DEFAULTS,naturalTransportSettings,analyzeAtlasAccess} from './atlas-transports.mjs';
export {CORRIDOR_DEFAULTS,corridorSettings} from '../core/corridors.mjs';
