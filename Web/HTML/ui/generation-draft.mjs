export function generationDraftChanged(path,{pending,status,regenerate=false,generate}){
 pending();
 if(path==='landscape.baseBiome'||(path==='landscape.biomes'&&regenerate))return generate();
 if(['landscape.biomes','landscape.baseBiome'].includes(path))status('Настройки биомов изменены.');
}
