import {landscapeDefaults,build as buildNatural,validateGrid,layers} from './natural.mjs';
import {checkLandscapeTopology} from '../contracts.mjs';
export const defaults=landscapeDefaults('hex');
export {layers};
export function build(generation,seed){checkLandscapeTopology('hexlandscape',generation.topology);return buildNatural({...generation,topology:generation.topology??{kind:'hex'}},seed);}
export const validate=source=>validateGrid(source,'hex');
