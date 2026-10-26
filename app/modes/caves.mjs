import {ATLAS_DEFAULTS} from '../../engine/api/atlas-catalog.mjs';
export {build,validate,layers} from './natural.mjs';
export const defaults={preset:'caverns',width:80,height:64,layers:{above:0,underground:3},caves:{style:'mixed',openness:.5,connectivity:.7,aquifers:.28,lavaDepth:3},resources:{frequency:1,size:1,richness:1},ecology:{vegetation:1},structures:{density:.4},events:{density:.5,spawners:.35}};

Object.assign(defaults,{topology:{kind:"square"},landforms:structuredClone(ATLAS_DEFAULTS.landforms),biomes:structuredClone(ATLAS_DEFAULTS.biomes),autoTransports:structuredClone(ATLAS_DEFAULTS.autoTransports)});
defaults.hydrology={...ATLAS_DEFAULTS.hydrology,...defaults.hydrology};defaults.caves={...ATLAS_DEFAULTS.caves,...defaults.caves};
