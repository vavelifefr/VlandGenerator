import {generateSettlement,validateSettlement,SETTLEMENT_DEFAULTS} from '../../engine/api/settlements.mjs';
import {naturalLayers} from '../views.mjs';
export const defaults=structuredClone(SETTLEMENT_DEFAULTS);
export const build=(generation,seed)=>generateSettlement({...generation,seed});
export const validate=validateSettlement;
export const layers=source=>{const result=naturalLayers(source.atlas);result[0].parcels=structuredClone(source.parcels);result[0].streets=structuredClone(source.streets);for(const key of ['neighborhoods','quarters','planning'])result[0][key]=structuredClone(source[key]);return result;};
