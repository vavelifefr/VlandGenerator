import {generateDungeon} from '../../engine/api/generate.mjs';
import {validateDungeon} from '../../engine/api/serialization.mjs';
import {dungeonLayer} from '../views.mjs';
import {TRANSPORT_DEFAULTS} from '../../engine/core/transport-settings.mjs';
export const defaults={profile:'balanced',rooms:{count:10,minSize:10,maxSize:20,style:'architectural',specialChance:.18,contourVariation:true,templates:{scattered:6,colonnade:2,pool:1,lake:1,mazeEasy:1,mazeHard:1}},layout:{architecture:'organic',corridors:{minLength:1,maxLength:3,preferredLength:2,openWidth:1},allowDisconnected:false,transports:structuredClone(TRANSPORT_DEFAULTS),preset:'compact',packing:'contact',routePatterns:true,loopChance:.5,destructibleRatio:.6},search:{candidates:3,mode:'quality'},content:{theme:'sci-fi',genre:'turn-based'}};
export const build=(generation,seed)=>generateDungeon({schema:'vland.request',schemaVersion:1,seed,...generation});
export const validate=validateDungeon;
export const layers=source=>[dungeonLayer(source,'main',0)];
