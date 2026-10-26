// A restored source stays ready for the next stroke, including undo of deletion.
export function restoreSourceSelection(previous,next,{sourceId,stage,kind,layerId}){
 const visible=s=>s.category===stage&&s.kind===kind&&s.layerId===layerId;
 if(next.some(s=>s.id===sourceId&&visible(s)))return sourceId;
 const oldIds=new Set(previous.map(s=>s.id));
 return next.find(s=>visible(s)&&!oldIds.has(s.id))?.id??null;
}
