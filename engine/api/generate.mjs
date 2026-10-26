import {generateLevel} from '../core/index.mjs';
import {selectionSeeds} from '../core/selection.mjs';
import {compactLevelPreview} from '../core/preview.mjs';
import {normalizeConfig,API_VERSION,GENERATOR_VERSION,PROFILES,LabError} from './config.mjs';
import {planContent} from './content.mjs';
import {fingerprint} from './identity.mjs';
import {resolveRecipe} from './request.mjs';
import {levelSignature,compareCandidates,diagnoseDungeon} from './diagnostics.mjs';
export function analyzeLevel(level,profile='balanced') {
  const weights=PROFILES[profile].weights;
  const criteria=level.quality.components.map(c=>({id:c.id,name:c.name,score:c.score,weight:weights[c.id]??0}));
  const total=criteria.reduce((n,c)=>n+c.weight,0);
  return{version:1,profile,score:Math.round(criteria.reduce((n,c)=>n+c.score*c.weight,0)/total),criteria,structuralScore:level.quality.score,metrics:structuredClone(level.quality.metrics),warnings:structuredClone(level.quality.warnings)};
}
export function createDungeonSearch(input={}) {
  const recipe=resolveRecipe(input),seeds=selectionSeeds(recipe.seed,recipe.candidates),rows=Array(seeds.length),results=new Map();let best=null,bestIndex=-1;
  function evaluate(index) {
    if(!Number.isInteger(index)||index<0||index>=seeds.length||rows[index])throw new LabError('INVALID_CANDIDATE','Кандидат уже обработан или имеет неверный индекс.');
    let level,analysis,error;
    try {
      level=generateLevel({...recipe.generator,seed:seeds[index],selectionCandidates:1});analysis=analyzeLevel(level,recipe.profile);
      const m=analysis.metrics,r=recipe.requirements,missing=[];
      if(m.loops<r.minLoops)missing.push(`петель ${m.loops} < ${r.minLoops}`);
      if(m.mainRooms<r.minMainRooms)missing.push(`комнат на маршруте ${m.mainRooms} < ${r.minMainRooms}`);
      if(m.shapeTypes<r.minShapes)missing.push(`форм ${m.shapeTypes} < ${r.minShapes}`);
      if(m.unmarkedDeadEnds>r.maxDeadEnds)missing.push(`тупиков ${m.unmarkedDeadEnds} > ${r.maxDeadEnds}`);
      if(missing.length)error='Требования: '+missing.join('; ');
    } catch(caught) {error=caught.message;}
    const row={index,seed:seeds[index],valid:!error,...(error?{error,failure:{stage:analysis?'requirements':'geometry',message:error}}:{score:analysis.score,structuralScore:level.quality.score,metrics:analysis.metrics,signature:levelSignature(level)})};rows[index]=row;
    if(!error)results.set(index,{level,analysis});
    if(!error&&(!best||analysis.score>best.analysis.score)) {best={level,analysis};bestIndex=index;}
    return{...row,bestSeed:best?.level.seed??null,bestScore:best?.analysis.score??null,...(!error?{preview:compactLevelPreview(level)}:{})};
  }
  function finish() {
    if(rows.some(r=>!r)||rows.filter(Boolean).length!==seeds.length)throw new LabError('INCOMPLETE_SEARCH','Подбор ещё не завершён.');
    if(!best)throw new LabError('TARGETS_NOT_MET','Ни один вариант не выполнил требования. Ослабьте требования или увеличьте число кандидатов.',rows);
    const comparison=compareCandidates(rows),mode=recipe.selection?.mode??'quality',weight=recipe.selection?.qualityWeight??.8;
    const utility=r=>mode==='diverse'?r.score/100*weight+r.novelty*(1-weight):r.score/100;
    const selected=comparison.candidates.filter(r=>r.valid).reduce((winner,row)=>!winner||utility(row)>utility(winner)+1e-12?row:winner,null);
    bestIndex=selected.index;best=results.get(bestIndex);
    const bundle={schema:'vland',schemaVersion:1,apiVersion:API_VERSION,generatorVersion:GENERATOR_VERSION,recipe:structuredClone(recipe),level:best.level,analysis:best.analysis,content:planContent(best.level,recipe.content),selection:{baseSeed:recipe.seed,selectedSeed:best.level.seed,selectedIndex:bestIndex,candidateCount:seeds.length,candidates:comparison.candidates,archive:comparison.archive,decision:{mode,qualityWeight:weight,novelty:selected.novelty,utility:Math.round(utility(selected)*10000)/10000,reason:mode==='quality'?'Максимальная оценка среди допустимых карт; равенство в пользу первого seed.':'Оценка и среднее отличие структурных признаков от других допустимых карт серии.'}}};
    bundle.analysis.diagnostics=diagnoseDungeon(bundle);
    bundle.fingerprint=fingerprint({level:bundle.level,content:bundle.content});return bundle;
  }
  return{recipe,seeds,evaluate,finish};
}
export function generateDungeon(input={}) {const search=createDungeonSearch(input);for(const index of search.seeds.keys())search.evaluate(index);return search.finish();}
