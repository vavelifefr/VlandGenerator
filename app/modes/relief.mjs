import {defaults as landscapeDefaults,build as buildLandscape,validate as validateLandscape,layers} from './natural.mjs';
export const defaults=structuredClone(landscapeDefaults);
defaults.terrain.relief=.85;
defaults.layers={above:0,underground:0};
export {layers};
export function build(generation,seed){if((generation.layers?.above??0)!==0||(generation.layers?.underground??0)!==0||Object.keys(generation.layerSettings??{}).length)throw Error('Рельеф содержит одну поверхность. Многослойные карты создаются в «Ландшафте».');return buildLandscape({...generation,layers:{...generation.layers,above:0,underground:0}},seed);}
export function validate(source){const report=validateLandscape(source);return report.ok&&source.layers.length!==1?{ok:false,errors:['Рельеф должен содержать одну поверхность.']}:report;}
