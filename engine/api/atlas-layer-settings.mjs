// Physical slices share XY and surface climate; cave parameters may differ per slice.
export const CAVE_LAYER_LIMITS=Object.freeze({openness:[.2,.75],connectivity:[0,1],aquifers:[0,1],lavaDepth:[1,7,true],tunnelRadius:[1,4],branching:[0,1],smoothing:[0,5,true]});
export const CAVE_STYLES=Object.freeze(['mixed','chambers','tunnels','karst','fractured','lava-tubes','shafts','water-carved']);
export function normalizeLayerSettings(input,layers){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('layerSettings: нужен объект настроек физических слоёв.');
 const output={};let previous=0;
 for(const[id,value]of Object.entries(input)){
  if(!/^cave-[1-6]$/.test(id)||Number(id.slice(5))>layers.underground||!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['depth','caves'].includes(k)))throw Error('Неизвестный подземный слой или поле: '+id);
  if(value.depth!==undefined&&(!Number.isInteger(value.depth)||value.depth<8||value.depth>768))throw Error('Глубина слоя: целое 8–768.');
  if(value.caves!==undefined){const caves=value.caves;if(!caves||typeof caves!=='object'||Array.isArray(caves)||Object.keys(caves).some(k=>k!=='style'&&!Object.hasOwn(CAVE_LAYER_LIMITS,k)))throw Error('Неизвестный параметр пещеры '+id);
   if(caves.style!==undefined&&!CAVE_STYLES.includes(caves.style))throw Error('Неизвестный стиль пещеры '+id);
   for(const[k,[min,max,integer]]of Object.entries(CAVE_LAYER_LIMITS))if(caves[k]!==undefined&&(!Number.isFinite(caves[k])||caves[k]<min||caves[k]>max||integer&&!Number.isInteger(caves[k])))throw Error('Вне диапазона: '+id+'.caves.'+k);
  }output[id]=structuredClone(value);
 }
 for(let i=1;i<=layers.underground;i++){const depth=output['cave-'+i]?.depth??i*layers.depthStep;if(depth<=previous)throw Error('Каждый следующий подземный слой должен быть глубже предыдущего.');previous=depth;}
 return output;
}
export function caveLayerRequest(request,index){const settings=request.layerSettings?.['cave-'+index]??{};return{...request,caves:{...request.caves,...settings.caves},layers:{...request.layers,depthStep:(settings.depth??index*request.layers.depthStep)/index}};}
