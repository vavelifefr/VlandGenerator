// Shared atlas provider; grid restrictions belong to individual workspaces.
import {ATLAS_DEFAULTS} from '../../engine/api/atlas-catalog.mjs';
import {generateAtlas,validateAtlas} from '../../engine/api/atlas.mjs';
import {naturalLayers} from '../views.mjs';
export const defaults={preset:'temperate',width:80,height:64,layers:{above:0,underground:0},terrain:{water:.28,relief:.6,warp:.65,blur:1,erosion:4},climate:{temperature:.53,moisture:.58},hydrology:{rivers:.55,lakes:.6},resources:{frequency:1,size:1,richness:1},ecology:{vegetation:1},structures:{density:.7},events:{density:.5,spawners:.35}};
export const build=(generation,seed)=>generateAtlas({schema:'vland.atlas.request',schemaVersion:1,seed,...generation});
export const validate=validateAtlas;
export const layers=naturalLayers;

Object.assign(defaults,{topology:{kind:"square"},landforms:structuredClone(ATLAS_DEFAULTS.landforms),biomes:structuredClone(ATLAS_DEFAULTS.biomes),autoTransports:structuredClone(ATLAS_DEFAULTS.autoTransports)});
defaults.hydrology={...ATLAS_DEFAULTS.hydrology,...defaults.hydrology};defaults.caves={...ATLAS_DEFAULTS.caves,...defaults.caves};

export function landscapeDefaults(kind){const result=structuredClone(defaults);result.width=128;result.height=128;result.topology={kind};result.landscape={structure:'land',baseBiome:'meadow',biomes:[],landPercent:75,coastErosion:50,uniformity:50};delete result.preset;delete result.landforms;delete result.terrain.water;delete result.climate;return result;}

export function validateGrid(source,kind){const report=validate(source);return report.ok&&(source.request.topology?.kind??'square')!==kind?{ok:false,errors:[kind==='hex'?'Основа гексагонального ландшафта должна использовать гексагоны.':'Основа ландшафта должна использовать квадратную сетку.']}:report;}
