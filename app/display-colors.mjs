import {SURFACES} from './catalog.mjs';
import {ATLAS_BIOMES} from '../engine/api/atlas-catalog.mjs';
export const WATER_COLORS={none:'#3a5148',sea:'#234b72',river:'#559fb0',lake:'#4087a1',groundwater:'#446f89',lava:'#bd643e'};
export const WATER_NAMES={none:'Суша',sea:'Море',river:'Река',lake:'Озеро',groundwater:'Подземная вода',lava:'Лава'};
const naturalIds=new Set(['beach','rocky-coast','gravel-shore','floodplain','foothills','plains','forest','rainforest','taiga','savanna','desert','cold-desert','wetland','tundra','snow','alpine','cliffs','volcanic','badlands','square','park','gravel','shallow-water']);
const family=id=>['taiga','rainforest'].includes(id)?'forest':id;
export function terrainBiomeColor(id,material,palette={}){
 if(!naturalIds.has(id)||material!==undefined&&material!==ATLAS_BIOMES[id].material)return null;
 return palette.biome?.[id]??palette.biome?.[family(id)]??ATLAS_BIOMES[family(id)].color;
}
export function terrainLegendEntries(layer,channel='material',palette={}){
 if(!['material','biome'].includes(channel))return paletteEntries().filter(e=>e.channel===channel&&new Set(layer[channel]??[]).has(e.id));
 const materialIds=new Set(),biomeIds=new Set();for(let i=0;i<layer.material.length;i++){
  const id=layer.biome?.[i],material=layer.material[i];
  if(channel==='material'&&(palette.material?.[material]||!terrainBiomeColor(id,material,palette)))materialIds.add(material);
  else if(id)biomeIds.add(palette.biome?.[id]?id:family(id));
 }
 return[...Object.entries(SURFACES).filter(([id])=>materialIds.has(id)).map(([id,v])=>({channel:'material',id,name:v.name,color:palette.material?.[id]??v.color})),
  ...Object.entries(ATLAS_BIOMES).filter(([id])=>biomeIds.has(id)).map(([id,v])=>({channel:'biome',id,name:id==='plains'?'Луга':id==='forest'?'Лес':v.name,color:palette.biome?.[id]??v.color}))];
}
export function paletteEntries(){return [
 ...Object.entries(SURFACES).map(([id,s])=>({channel:'material',id,name:s.name,color:s.color})),
 ...Object.entries(ATLAS_BIOMES).map(([id,s])=>({channel:'biome',id,name:s.name,color:s.color})),
 ...Object.entries(WATER_COLORS).map(([id,color])=>({channel:'water',id,name:WATER_NAMES[id],color}))
 ];}
export function normalizePalette(value={}){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Палитра: ожидается объект.');
 const result={},allowed={material:SURFACES,biome:ATLAS_BIOMES,water:WATER_COLORS};
 for(const [channel,entries]of Object.entries(value)){
  if(!Object.hasOwn(allowed,channel)||!entries||typeof entries!=='object'||Array.isArray(entries))throw new Error('Палитра: material, biome, water.');
  result[channel]={};for(const[id,color]of Object.entries(entries)){
   if(!Object.hasOwn(allowed[channel],id)||typeof color!=='string'||!/^#[0-9a-f]{6}$/i.test(color))throw new Error('Палитра: неизвестный элемент или цвет не в формате #RRGGBB.');
   result[channel][id]=color.toLowerCase();
  }
 }
 return result;
}
