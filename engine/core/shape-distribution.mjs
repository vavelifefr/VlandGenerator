import {roomAreaChoices,areaApplies} from './area.mjs';
import {ROOM_SHAPES,SHAPE_MIN_SIZE,defaultShapeWeight,RARE_LETTER_SHAPES,shapeWeightScale} from './shapes.mjs';
import {distributeArchitecturalShapes} from './shape-style.mjs';
export function distributeRoomShapes(rooms,random,options={}){
 if(options.shapeStyle==='architectural')return distributeArchitecturalShapes(rooms,random,options);
 if(options.shapeSelection!=='balanced')return null;
 const ordinary=rooms.filter(areaApplies),fixed=ordinary.filter(r=>r.notch),free=ordinary.filter(r=>!r.notch),choices=new Map(free.map(r=>[r.id,[...new Set(roomAreaChoices(r,options).map(c=>c.shape))]]));
 const enabled=ROOM_SHAPES.filter(id=>(options.shapeWeights?.[id]??defaultShapeWeight(id))>0),weight=id=>(options.shapeWeights?.[id]??(id==='rectangle'?1:2))*shapeWeightScale(id,options.rareLetters),rank=new Map(free.map(r=>[r.id,random()]));
 const raritySkipped=options.rareLetters?enabled.filter(id=>RARE_LETTER_SHAPES.includes(id)&&random()>=shapeWeightScale(id,true)):[],active=enabled.filter(id=>!raritySkipped.includes(id));
 for(const room of free){const available=choices.get(room.id);if(!available.some(id=>active.includes(id))){const fallback=available[Math.floor(random()*available.length)];if(fallback&&!active.includes(fallback))active.push(fallback);}}
 for(const [id,list]of choices)choices.set(id,list.filter(shape=>active.includes(shape)));
 const uses=new Map(enabled.map(id=>[id,0]));for(const r of fixed)uses.set('L',(uses.get('L')??0)+1);
 const owners=new Map(),assignment=new Map();
 const candidates=id=>free.filter(r=>choices.get(r.id).includes(id)).sort((a,b)=>choices.get(a.id).length-choices.get(b.id).length||rank.get(a.id)-rank.get(b.id));
 // Maximum bipartite matching: one different feasible shape per room first.
 // A small room can never consume a shape that only fits a larger neighbour.
 const match=(id,seen)=>{for(const room of candidates(id)){if(seen.has(room.id))continue;seen.add(room.id);const previous=owners.get(room.id);if(!previous||match(previous,seen)){owners.set(room.id,id);return true;}}return false;};
 const order=active.filter(id=>(uses.get(id)??0)===0).sort((a,b)=>candidates(a).length-candidates(b).length||weight(b)-weight(a)||enabled.indexOf(a)-enabled.indexOf(b));
 for(const id of order)match(id,new Set());
 for(const [roomId,id]of owners){assignment.set(roomId,id);uses.set(id,(uses.get(id)??0)+1);}
 for(const room of free)if(!assignment.has(room.id)){
  const available=choices.get(room.id);if(!available.length)throw new Error('Нет допустимой формы для '+room.id+'.');
  const scored=available.map(id=>({id,value:((uses.get(id)??0)+1)/Math.max(.0001,weight(id)),tie:random()})).sort((a,b)=>a.value-b.value||a.tie-b.tie),id=scored[0].id;
  assignment.set(room.id,id);uses.set(id,(uses.get(id)??0)+1);
 }
 return{assignment,report:{mode:'balanced',ordinaryRooms:ordinary.length,enabledShapes:enabled,activeShapes:active,raritySkipped:raritySkipped.filter(id=>!active.includes(id)),usedCounts:Object.fromEntries([...uses].filter(([,n])=>n>0)),uniqueShapes:[...uses.values()].filter(n=>n>0).length,
  unavailable:enabled.filter(id=>!(uses.get(id)>0)).map(id=>({shape:id,minSize:SHAPE_MIN_SIZE[id],reason:raritySkipped.includes(id)&&!active.includes(id)?'Редкий выбор: вероятность включения '+(100*shapeWeightScale(id,true))+'%.':candidates(id).length?'Не хватает совместимых комнат для всех форм одновременно.':'Нет комнаты подходящих размеров/площади; либо контур закреплён выемкой.'})),note:'Сначала максимальное число разных допустимых форм; затем повторы по весам. При понижении частот E:50%, G/X/O:25%, Z/P:12.5% для покрытия; если других допустимых форм нет, сохраняется хотя бы одна. N — алиас Z. Старт, выход и босс не входят в распределение.'}};
}
