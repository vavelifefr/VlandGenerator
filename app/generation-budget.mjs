import {ATLAS_MAX_CELLS} from '../engine/api/atlas-catalog.mjs';
export function atlasSizeBudget(mode,generation){
 if(!['landscape','hexlandscape','caves','relief'].includes(mode))return null;
 const {width,height,layers={}}=generation,layerCount=1+(layers.above??0)+(layers.underground??0);
 if(![width,height,layerCount].every(v=>Number.isInteger(v)&&v>0))return null;
 const cells=width*height*layerCount,maxLayers=Math.floor(ATLAS_MAX_CELLS/(width*height)),ok=cells<=ATLAS_MAX_CELLS;
 return{cells,layers:layerCount,maxCells:ATLAS_MAX_CELLS,maxLayers,ok,message:width+' × '+height+' × '+layerCount+' среза = '+cells+' клеток. Лимит '+ATLAS_MAX_CELLS+'.'+(ok?'':' Уменьшите размеры или число срезов: при этих размерах допустимо '+maxLayers+' всего, включая поверхность.')};
}
