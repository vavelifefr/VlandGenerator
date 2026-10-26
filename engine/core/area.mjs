import {roomShapeAreas} from './shapes.mjs';
export function roomAreaBounds(options={}){
 const min=options.roomAreaMin??9,max=options.roomAreaMax??65536;
 if(!Number.isInteger(min)||!Number.isInteger(max)||min<9||max>65536||min>max)throw new Error('Площадь пола: целые 9–65536, минимум не больше максимума.');
 return{enabled:options.roomAreaMin!==undefined||options.roomAreaMax!==undefined,min,max};
}
export const areaApplies=room=>!['start','final','boss'].includes(room.purpose);
export function roomAreaChoices(room,options={}){
 const bounds=roomAreaBounds(options);
 return roomShapeAreas(room,options).filter(choice=>!bounds.enabled||!areaApplies(room)||choice.area>=bounds.min&&choice.area<=bounds.max);
}
export function areaDomain(plan,options){
 const bounds=roomAreaBounds(options);if(!bounds.enabled)return null;
 const min=options.roomMin??10,max=options.roomMax??16,ordinary=plan.nodes.filter(areaApplies),spans=[...new Set(ordinary.map(n=>n.spanX+':'+n.spanY))].map(s=>s.split(':').map(Number)),pairs=[];
 for(let width=min;width<=max;width++)for(let height=min;height<=max;height++){
  if(spans.every(([sx,sy])=>roomAreaChoices({width:width*sx+(sx-1)*2,height:height*sy+(sy-1)*2,purpose:'combat'},options).length))pairs.push({width,height});
 }
 if(!pairs.length)throw new Error(`Площадь ${bounds.min}–${bounds.max} несовместима с размерами ${min}–${max}, формами или большими залами. Расширьте диапазон или уменьшите шанс больших залов.`);
 return{...bounds,pairs};
}
export function roomAreaErrors(level){
 let bounds;try{bounds=roomAreaBounds(level.options??{});}catch(error){return[error.message];}
 if(!bounds.enabled)return[];
 return level.rooms.filter(areaApplies).flatMap(r=>{
  const cells=new Set([...(r.floorTiles??[]),...level.features.filter(f=>f.roomId===r.id).flatMap(f=>f.cells)].map(p=>p.x+':'+p.y));
  return r.floorArea!==cells.size||cells.size<bounds.min||cells.size>bounds.max?[`Площадь пола ${r.id}: ${cells.size}, записано ${r.floorArea}, требуется ${bounds.min}–${bounds.max}.`]:[];
 });
}
