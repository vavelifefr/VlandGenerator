import {generatePlatformer,validatePlatformer,analyzePlatformer} from '../../engine/api/platformer.mjs';
import {sideLayer} from '../views.mjs';
export const defaults={preset:'metroidvania',rooms:10,roomWidth:{min:14,max:22},roomHeight:{min:12,max:18},branches:.35,platforms:.6,gaps:.4,physics:{width:1,height:2,speed:5,jumpSpeed:11,gravity:28,climbSpeed:3,doubleJumpSpeed:11,dashSpeed:18,dashDuration:.25,wallJumpSpeed:11,wallJumpPush:5},abilities:{initial:[],unlockOrder:['double-jump','dash','wall-jump']}};
export const build=(generation,seed)=>generatePlatformer({schema:'vland.platformer.request',schemaVersion:2,seed,...generation});
export const validate=validatePlatformer;
export const layers=source=>[sideLayer(source)];
export function editedNavigation(source,layer){const copy=structuredClone(source);copy.board.walls=[];for(let i=0;i<layer.solid.length;i++)if(layer.solid[i])copy.board.walls.push({x:i%layer.width,y:Math.floor(i/layer.width),type:'rock'});return analyzePlatformer(copy);}
