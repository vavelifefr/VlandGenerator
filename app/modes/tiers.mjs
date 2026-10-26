import {generateWorld,validateWorld} from '../../engine/api/world.mjs';
import {dungeonLayer} from '../views.mjs';
import {WORLD_TRANSPORT_DEFAULTS} from '../../engine/core/transport-settings.mjs';
export const defaults={autoTransports:structuredClone(WORLD_TRANSPORT_DEFAULTS),layers:[{id:'lower',elevation:0,headroom:3,request:{schema:'vland.request',schemaVersion:1,rooms:{count:5},search:{candidates:1}}},{id:'upper',elevation:4,headroom:3,request:{schema:'vland.request',schemaVersion:1,rooms:{count:5},search:{candidates:1}}}]};
export const build=(generation,seed)=>generateWorld({schema:'vland.world.request',schemaVersion:1,seed,...generation});
export const validate=validateWorld;
export const layers=source=>source.layers.map(l=>{const v=dungeonLayer(l.dungeon,l.id,l.elevation);v.kind='tier';v.protected.push(...l.reservations.flatMap(r=>r.cells));return v;});
