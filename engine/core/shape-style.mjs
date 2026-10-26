import {roomAreaChoices,areaApplies,roomAreaBounds} from './area.mjs';
import {ROOM_SHAPES,SHAPE_MIN_SIZE,defaultShapeWeight,shapeWeightScale} from './shapes.mjs';
import {roomContains} from './space.mjs';

export const SHAPE_STYLES=Object.freeze(['architectural','catalog']);
export const ARCHITECTURAL_SHAPES=Object.freeze(['rectangle','beveled','rounded','L','stepped','courtyard']);
export function shapeStyleSettings(options={}){
 const style=options.shapeStyle??'catalog',specialShapeChance=options.specialShapeChance??.25,contourVariation=options.contourVariation??(style==='architectural');
 if(!SHAPE_STYLES.includes(style))throw new Error('shapeStyle: architectural или catalog.');
 if(!Number.isFinite(specialShapeChance)||specialShapeChance<0||specialShapeChance>1)throw new Error('specialShapeChance: число0–1.');
 if(typeof contourVariation!=='boolean')throw new Error('contourVariation: boolean.');
 return{style,specialShapeChance,contourVariation};
}
const special=id=>!ARCHITECTURAL_SHAPES.includes(id);
export function distributeArchitecturalShapes(rooms,random,options={}){
 const settings=shapeStyleSettings(options),ordinary=rooms.filter(areaApplies),free=ordinary.filter(r=>!r.notch),assignment=new Map(),uses=new Map(),enabled=ROOM_SHAPES.filter(id=>(options.shapeWeights?.[id]??defaultShapeWeight(id))>0);
 const choices=new Map(free.map(r=>[r.id,[...new Set(roomAreaChoices(r,options).map(c=>c.shape))]])),rank=new Map(free.map(r=>[r.id,random()]));
 const limit=Math.floor(ordinary.length*settings.specialShapeChance);let specialRooms=0,forcedSpecial=0;
 for(const room of ordinary.filter(r=>r.notch))uses.set('L',(uses.get('L')??0)+1);
 const ordered=[...free].sort((a,b)=>choices.get(a.id).length-choices.get(b.id).length||rank.get(a.id)-rank.get(b.id));
 for(const room of ordered){
  const available=choices.get(room.id),base=available.filter(id=>!special(id)),extras=available.filter(special);
  if(!available.length)throw new Error('Нет допустимой формы для '+room.id+'.');
  const wantSpecial=!base.length||extras.length&&specialRooms<limit&&random()<settings.specialShapeChance;
  const pool=wantSpecial?extras:base.length?base:extras;
  const weight=id=>(options.shapeWeights?.[id]??(id==='rectangle'?1:2))*shapeWeightScale(id,options.rareLetters)*(room.composition?.preferredShapes.includes(id)?1.25:1)/(options.shapeSelection==='balanced'?1+.75*(uses.get(id)??0):1);
  let roll=random()*pool.reduce((n,id)=>n+weight(id),0),chosen=pool.at(-1);for(const id of pool){roll-=weight(id);if(roll<0){chosen=id;break;}}
  assignment.set(room.id,chosen);uses.set(chosen,(uses.get(chosen)??0)+1);if(special(chosen)){specialRooms++;if(!base.length)forcedSpecial++;}
 }
 const feasible=enabled.filter(id=>[...choices.values()].some(list=>list.includes(id))||id==='L'&&ordinary.some(r=>r.notch));
 return{assignment,report:{mode:options.shapeSelection??'weighted',style:'architectural',ordinaryRooms:ordinary.length,enabledShapes:enabled,activeShapes:feasible,raritySkipped:[],usedCounts:Object.fromEntries(uses),uniqueShapes:uses.size,specialRooms,specialRoomLimit:limit,forcedSpecial,
  diversityTarget:Math.min(ordinary.length,feasible.filter(id=>!special(id)).length+Math.min(limit,feasible.filter(special).length)),
  unavailable:enabled.filter(id=>!uses.has(id)).map(id=>({shape:id,minSize:SHAPE_MIN_SIZE[id],reason:feasible.includes(id)?'Не выбран в этой серии: архитектурный режим не требует показать весь каталог.':'Нет комнаты подходящих размеров/площади; либо контур закреплён выемкой.'})),
  note:'Архитектурная смесь: простые залы преобладают; сложные фигуры ограничены долей '+Math.round(settings.specialShapeChance*100)+'%. Частотные коэффициенты применяются к весам. При запрете всех простых форм ограничение уступает явно выбранным формам; вынужденных сложных комнат '+forcedSpecial+'.'}};
}

const key=(x,y)=>x+':'+y,dirs=[[0,-1],[1,0],[0,1],[-1,0]];
// Small bays and recesses stay inside the existing room footprint. They never
// create an inter-room corridor and must retain the connected floor and core.
export function varyRoomContour(room,mask,random,options={}){
 if(!shapeStyleSettings(options).contourVariation||!areaApplies(room)||room.notch)return mask;
 const floor=new Set(mask.floor),bounds=roomAreaBounds(options),initial=floor.size,changes=[];
 const protectedCore=(x,y)=>Math.abs(x-mask.core.x)<=1&&Math.abs(y-mask.core.y)<=1;
 const connected=cells=>{const q=[mask.core],seen=new Set([key(mask.core.x,mask.core.y)]);for(let i=0;i<q.length;i++)for(const[dx,dy]of dirs){const p={x:q[i].x+dx,y:q[i].y+dy},k=key(p.x,p.y);if(cells.has(k)&&!seen.has(k)){seen.add(k);q.push(p);}}return seen.size===cells.size;};
 for(let attempt=0;attempt<12&&changes.length<2;attempt++){
  const side=Math.floor(random()*4),depth=2+Math.floor(random()*2),along=3+Math.floor(random()*3),vertical=side%2===1,span=(vertical?room.height:room.width)-2;
  if(span<along+4)continue;const start=2+Math.floor(random()*(span-along-2)),patch=[];
  for(let i=0;i<along;i++)for(let d=0;d<depth;d++){
   const x=side===1?room.x+room.width-2-d:side===3?room.x+1+d:room.x+start+i,y=side===0?room.y+1+d:side===2?room.y+room.height-2-d:room.y+start+i;
   if(roomContains(room,{x,y},{interior:true}))patch.push({x,y});
  }
  if(!patch.length||patch.some(p=>protectedCore(p.x,p.y)))continue;
  const occupied=patch.filter(p=>floor.has(key(p.x,p.y))).length,add=occupied<patch.length/2;
  const candidate=new Set(floor);for(const p of patch){if(add)candidate.add(key(p.x,p.y));else candidate.delete(key(p.x,p.y));}
  const delta=candidate.size-floor.size;
  if(!delta||Math.abs(candidate.size-initial)>Math.max(6,Math.floor(initial*.12))||candidate.size<bounds.min||candidate.size>bounds.max||!connected(candidate))continue;
  floor.clear();for(const k of candidate)floor.add(k);changes.push({side:['north','east','south','west'][side],kind:add?'bay':'recess',cells:Math.abs(delta)});
 }
 return{...mask,floor,contourVariation:{version:1,baseArea:initial,finalArea:floor.size,changes}};
}
