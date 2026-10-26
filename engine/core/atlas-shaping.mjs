import {fractalNoise,clamp} from './atlas-math.mjs';
export const LANDFORM_DEFAULTS=Object.freeze({pattern:'natural',direction:0,strength:.45,featureScale:1,coastDetail:.25});
export const BIOME_DEFAULTS=Object.freeze({transitionWidth:3,coastWidth:2,foothillWidth:3});
export function shapeElevation(raw,r,x,y,seed){const c=r.landforms;if(c.pattern==='natural')return raw;const angle=c.direction*Math.PI/180,u=(x*Math.cos(angle)+y*Math.sin(angle))/c.featureScale,v=(-x*Math.sin(angle)+y*Math.cos(angle))/c.featureScale,detail=fractalNoise(seed^0x715,u*3,v*3,{octaves:3}),ridge=1-Math.abs(2*fractalNoise(seed^0x831,u*.4,v*1.7,{octaves:3})-1);let target=raw;
 if(c.pattern==='ridge')target=.22+ridge*.65;
 if(c.pattern==='plateau'){const h=fractalNoise(seed^0x753,u*.6,v*.6,{octaves:2});target=.25+Math.round(h*4)/4*.6;}
 if(c.pattern==='basin')target=.65-ridge*.5;
 if(c.pattern==='island'){const nx=(x*r.terrain.scale-r.origin.x)/r.width*2-1,ny=(y*r.terrain.scale-r.origin.y)/r.height*2-1;target=.72-Math.min(1,Math.hypot(nx,ny))*.55+(detail-.5)*c.coastDetail;}
 if(c.pattern==='archipelago')target=.18+fractalNoise(seed^0x871,u*2,v*2,{octaves:3})*.65;
 return clamp(raw*(1-c.strength)+target*c.strength+(detail-.5)*c.coastDetail*.1);
}
