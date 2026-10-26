import {landscapeDefaults,build as buildNatural,validateGrid,layers} from './natural.mjs';
import {checkLandscapeTopology} from '../contracts.mjs';
export const defaults=landscapeDefaults('square');
export {layers};
export function build(generation,seed){checkLandscapeTopology('landscape',generation.topology);return buildNatural({...generation,topology:generation.topology??{kind:'square'}},seed);}
export const validate=source=>validateGrid(source,'square');
