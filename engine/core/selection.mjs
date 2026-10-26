import {corridorSettings} from './corridors.mjs';
// The same deterministic selection policy is used by the API, game and Workers.
export function selectionCount(value=1){
 if(!Number.isInteger(value)||value<1||value>9)throw new Error('Подбор этажа: целое число вариантов от1 до9.');
 return value;
}
export function selectionSeeds(seed,count=1){
 selectionCount(count);
 if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff)throw new Error('Seed: целое0–4294967295.');
 return Array.from({length:count},(_,index)=>(seed+index)>>>0);
}
export function createLevelSelection(seed,count=1){
 const seeds=selectionSeeds(seed,count),candidates=Array(count);let best=null,bestIndex=-1;
 function record(index,level,error){
  if(!Number.isInteger(index)||index<0||index>=count||candidates[index])throw new Error('Повторный или неверный номер кандидата.');
  const validation=level?.validation??level?.generationValidation,quality=level?.quality;
  const maxPassage=level?.connections?.length?Math.max(...level.connections.map(c=>c.cells?.length??0)):0;
  if(!error&&(!validation?.ok||!quality?.valid))error=new Error('Кандидат не прошёл проверку проходимости.');
  if(!error&&(level.seed!==seeds[index]||!Number.isFinite(quality.score)||quality.score<0||quality.score>100))error=new Error('Некорректные seed или оценка кандидата.');
  if(!error&&(maxPassage>corridorSettings(level?.options?.corridors).maxLength||maxPassage<corridorSettings(level?.options?.corridors).minLength||level.connections.some(c=>!c.cells?.length)))error=new Error('Переходы должны занимать1–3тайла.');
  const row={index,seed:seeds[index],valid:!error,...(error?{error:String(error.message??error)}:{score:quality.score,maxPassage})};candidates[index]=row;
  if(!error&&(!best||quality.score>best.quality.score||quality.score===best.quality.score&&index<bestIndex)){best=level;bestIndex=index;}
  return {...row,bestSeed:best?.seed??null,bestScore:best?.quality.score??null};
 }
 function finish(){
  if(candidates.filter(Boolean).length!==count)throw new Error('Подбор ещё не завершён.');
  if(!best)throw new Error('Не найден допустимый этаж. '+candidates.map(c=>'Seed '+c.seed+': '+c.error).join(' '));
  best.selection={version:1,baseSeed:seed,candidateCount:count,validCount:candidates.filter(c=>c.valid).length,selectedSeed:best.seed,selectedIndex:bestIndex,selectedScore:best.quality.score,candidates:candidates.map(c=>({...c}))};return best;
 }
 return {seeds,record,finish};
}
export function selectBestLevel(seed,count,build){
 const selection=createLevelSelection(seed,count);
 for(const[index,candidateSeed]of selection.seeds.entries()){
  let level,error;try{level=build(candidateSeed,index);}catch(caught){error=caught;}
  selection.record(index,level,error);
 }
 return selection.finish();
}
