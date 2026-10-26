import {DIRECTIONS,pointKey} from './random.mjs';
import {roomContains} from './space.mjs';
export const LEGACY_ROOM_SHAPES=Object.freeze(['rectangle','beveled','rounded','L','T','cross','stepped','courtyard','S','Z','U','H','P','I','X','O','Pi','G','N','E']);
export const SHAPE_ALIASES=Object.freeze({N:'Z'});
export const ROOM_SHAPES=Object.freeze(LEGACY_ROOM_SHAPES.filter(id=>!Object.hasOwn(SHAPE_ALIASES,id)));
export const SHAPE_MIN_SIZE=Object.freeze({rectangle:8,beveled:8,rounded:8,L:8,T:8,cross:8,stepped:8,courtyard:14,S:14,Z:14,U:14,H:14,P:18,I:14,X:16,O:16,Pi:14,G:18,E:18});
export const defaultShapeWeight=id=>['Pi','G','N','E'].includes(id)?0:1;
export const SHAPE_FREQUENCY_SCALES=Object.freeze({Z:.125,G:.25,X:.25,O:.25,E:.5,P:.125});
export const RARE_LETTER_SHAPES=Object.freeze(Object.keys(SHAPE_FREQUENCY_SCALES));
export const canonicalShape=id=>SHAPE_ALIASES[id]??id;
export const shapeWeightScale=(id,rareLetters=false)=>rareLetters?(SHAPE_FREQUENCY_SCALES[canonicalShape(id)]??1):1;
export function canonicalShapeWeights(weights){
 if(weights===undefined)return undefined;
 if(!weights||typeof weights!=='object'||Array.isArray(weights)||Object.entries(weights).some(([id,n])=>!LEGACY_ROOM_SHAPES.includes(id)||!Number.isFinite(n)||n<0))throw new Error('Неверные веса форм.');
 const result={...weights};
 // An old N and Z are one choice. Taking the maximum avoids doubling its weight.
 if(Object.hasOwn(result,'N')){if(result.N>0)result.Z=Math.max(result.Z??2,result.N);delete result.N;}
 return result;
}
// All masks use broad arms. Door vestibules are fitted later, inside the bounding footprint.
export function roomShape(room,random,{shapeWeights,bossShapeWeights,roomAreaMin,roomAreaMax,forcedShape,rareLetters=false}={}){
 shapeWeights=canonicalShapeWeights(shapeWeights);bossShapeWeights=canonicalShapeWeights(bossShapeWeights);forcedShape=canonicalShape(forcedShape);
 const w=room.width-2,h=room.height-2,compact=room.compact??['start','final'].includes(room.purpose),boss=room.purpose==='boss';
 const eligible=compact?['rectangle']:boss?['rectangle','beveled','courtyard']:ROOM_SHAPES.filter(name=>Math.min(room.width,room.height)>=SHAPE_MIN_SIZE[name]);
 const preferredWeights=boss&&bossShapeWeights?bossShapeWeights:shapeWeights,selectedWeights=boss&&preferredWeights&&!eligible.some(id=>(preferredWeights[id]??(defaultShapeWeight(id)?1:0))>0)?undefined:preferredWeights;
 const weights=eligible.map(name=>(compact?1:selectedWeights?.[name]??(defaultShapeWeight(name)?name==='rectangle'?1:2:0))*(!compact&&!boss&&room.composition?.preferredShapes.includes(name)?3:1)*shapeWeightScale(name,!compact&&!boss&&rareLetters)),total=weights.reduce((a,b)=>a+b,0);if(total<=0)throw new Error('Нет разрешённых форм для размера '+room.width+'×'+room.height+'.');let pick=random()*total,index=0;while(index<weights.length-1&&pick>=weights[index])pick-=weights[index++];
 const rotationRoll=compact?0:Math.floor(random()*4);let shape=room.notch?'L':eligible[index],rotation=room.notch?({NE:0,SE:1,SW:2,NW:3})[room.notch.corner]:rotationRoll;const floor=new Set();
 if(!compact&&!boss&&(roomAreaMin!==undefined||roomAreaMax!==undefined)){const choices=roomShapeAreas(room,{shapeWeights,bossShapeWeights,rareLetters}).filter(c=>c.area>=(roomAreaMin??9)&&c.area<=(roomAreaMax??65536));if(!choices.length)throw new Error('Нет формы допустимой площади для '+room.width+'×'+room.height+'.');let pick=random()*choices.reduce((n,c)=>n+c.weight,0),choice=choices.at(-1);for(const c of choices){pick-=c.weight;if(pick<0){choice=c;break;}}shape=choice.shape;rotation=choice.rotation;}
 if(forcedShape&&!compact&&!boss&&!room.notch){if(!eligible.includes(forcedShape))throw new Error('Назначенная форма не помещается.');shape=forcedShape;if(roomAreaMin!==undefined||roomAreaMax!==undefined){const choices=roomShapeAreas(room,{shapeWeights,bossShapeWeights}).filter(c=>c.shape===shape&&c.area>=(roomAreaMin??9)&&c.area<=(roomAreaMax??65536));if(!choices.length)throw new Error('Назначенная форма не проходит площадь.');rotation=choices[Math.floor(random()*choices.length)].rotation;}}
 const inside=(x,y)=>maskInside(room,shape,rotation,x,y);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(inside(x,y))floor.add(pointKey({x:room.x+1+x,y:room.y+1+y}));
 const candidates=[...floor].map(k=>{const[x,y]=k.split(':').map(Number);return{x,y};}).filter(p=>[-1,0,1].every(dy=>[-1,0,1].every(dx=>floor.has((p.x+dx)+':'+(p.y+dy))))).sort((p,q)=>(p.x-room.core.x)**2+(p.y-room.core.y)**2-((q.x-room.core.x)**2+(q.y-room.core.y)**2)||p.y-q.y||p.x-q.x);
 if(!candidates.length)throw new Error('Форма комнаты не оставила свободный центр.');
 const core=candidates[0],seen=new Set([pointKey(core)]),queue=[core];
 for(let i=0;i<queue.length;i++)for(const[dx,dy]of DIRECTIONS){const p={x:queue[i].x+dx,y:queue[i].y+dy},k=pointKey(p);if(floor.has(k)&&!seen.has(k)){seen.add(k);queue.push(p);}}
 if(seen.size!==floor.size)throw new Error('Контур комнаты разделён.');
 return{shape,rotation,floor,core};
}

function maskInside(room,shape,rotation,x,y){
 const w=room.width-2,h=room.height-2,boss=room.purpose==='boss';
  if(room.notch)return roomContains(room,{x:room.x+1+x,y:room.y+1+y},{interior:true});
  const nx=(x+.5)/w,ny=(y+.5)/h;let u=nx,v=ny;for(let i=0;i<rotation;i++)[u,v]=[1-v,u];
  if(shape==='rectangle')return true;
  if(shape==='beveled'){const k=boss ? .15 : .25;return u+v>=k&&(1-u)+v>=k&&u+(1-v)>=k&&(1-u)+(1-v)>=k;}
  if(shape==='rounded')return Math.pow(Math.abs(u-.5)*2,4)+Math.pow(Math.abs(v-.5)*2,4)<=1.12;
  if(shape==='L')return !(u>.58&&v<.42);
  if(shape==='T')return v<.52||u>=.25&&u<=.75;
  if(shape==='cross')return u>=.25&&u<=.75||v>=.25&&v<=.75;
  if(shape==='stepped')return !(u<.22&&v<.4||u>.78&&v>.6);
  if(shape==='courtyard')return !(Math.abs(u-.5)<.15&&Math.abs(v-.5)<.15);
  if(shape==='S')return v<.34?u>=.33:v>.66?u<=.67:true;
  if(shape==='Z')return v<.34?u<=.67:v>.66?u>=.33:true;
  if(shape==='U')return u<.34||u>.66||v>.64;
  if(shape==='H')return u<.34||u>.66||v>=.34&&v<=.66;
  if(shape==='P')return u<.36||v<.68&&(v<.22||v>.46||u>.7);
  if(shape==='I')return u>=.33&&u<=.67||v<.25||v>.75;
  if(shape==='X')return Math.abs(u-v)<.23||Math.abs((1-u)-v)<.23;
  if(shape==='Pi')return u<.28||u>.72||v<.28;
  if(shape==='G')return u<.28||v<.24||v>.76||u>.7&&v>.46||v>.46&&v<.66&&u>.48;
  if(shape==='E')return u<.3||v<.24||v>.76||v>.38&&v<.62&&u<.84;
  if(shape==='O')return Math.pow(Math.abs(u-.5)*2,4)+Math.pow(Math.abs(v-.5)*2,4)<=1.12&&!((u-.5)**2+(v-.5)**2<.18**2);
  return true;
}
const areaCache=new Map();
export function roomShapeAreas(room,{shapeWeights,bossShapeWeights,rareLetters=false}={}){
 shapeWeights=canonicalShapeWeights(shapeWeights);bossShapeWeights=canonicalShapeWeights(bossShapeWeights);
 const compact=room.compact??['start','final'].includes(room.purpose),boss=room.purpose==='boss',weights=boss?bossShapeWeights??shapeWeights:shapeWeights;
 const eligible=room.notch?['L']:compact?['rectangle']:boss?['rectangle','beveled','courtyard']:ROOM_SHAPES.filter(id=>Math.min(room.width,room.height)>=SHAPE_MIN_SIZE[id]);
 const choices=[];for(const shape of eligible){const weight=compact?1:weights?.[shape]??(defaultShapeWeight(shape)?shape==='rectangle'?1:2:0);if(weight<=0)continue;
  for(const rotation of room.notch?[({NE:0,SE:1,SW:2,NW:3})[room.notch.corner]]:compact?[0]:[0,1,2,3]){
   const cacheKey=[room.width,room.height,room.purpose==='boss',shape,rotation].join(':'),cached=room.notch?undefined:areaCache.get(cacheKey);let area=cached;
   if(area===undefined){area=0;for(let y=0;y<room.height-2;y++)for(let x=0;x<room.width-2;x++)if(maskInside(room,shape,rotation,x,y))area++;if(!room.notch){if(areaCache.size>=8192)areaCache.clear();areaCache.set(cacheKey,area);}}
   choices.push({shape,rotation,area,weight:weight*(!boss&&room.composition?.preferredShapes.includes(shape)?3:1)*shapeWeightScale(shape,!boss&&!compact&&rareLetters)});
  }
 }return choices;
}
