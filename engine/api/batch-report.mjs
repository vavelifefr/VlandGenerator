import {resolveRecipe} from './request.mjs';
import {fingerprint} from './identity.mjs';

export function validateSeedBatch(report) {
  try {
    const recipe = resolveRecipe(report.recipe);
    const integer = (n,min,max) => Number.isInteger(n) && n >= min && n <= max;
    if (report.schemaVersion !== 1 || !integer(report.startSeed,0,0xffffffff) ||
        !integer(report.count,1,50) || report.count * recipe.candidates > 64 ||
        !Array.isArray(report.rows) || report.rows.length !== report.count) {
      throw new Error('Неверный размер, seed или бюджет пакета.');
    }
    for (const [i,row] of report.rows.entries()) {
      if (row.index !== i || row.seed !== ((report.startSeed+i)>>>0) ||
          typeof row.valid !== 'boolean' || !Number.isFinite(row.elapsedMs) || row.elapsedMs < 0) {
        throw new Error('Неверная строка пакета seed.');
      }
      if (row.valid) {
        if (!Number.isFinite(row.score) || row.score < 0 || row.score > 100 ||
            !integer(row.selectedSeed,0,0xffffffff) ||
            !Array.from({length:recipe.candidates},(_,j)=>(row.seed+j)>>>0).includes(row.selectedSeed) ||
            typeof row.fingerprint !== 'string' || !/^[0-9a-f]{8}$/.test(row.fingerprint) ||
            !integer(row.loops,0,512) || !integer(row.shapes,1,120) || !integer(row.maxPassage,1,3)) {
          throw new Error('Неверный результат кандидата пакета.');
        }
      } else if (!row.error || typeof row.error.code !== 'string' || typeof row.error.message !== 'string') {
        throw new Error('Отклонённый seed должен содержать причину.');
      }
    }
    const valid=report.rows.filter(r=>r.valid),summary=report.summary;
    const times=report.rows.map(r=>r.elapsedMs).sort((a,b)=>a-b);
    const best=[...valid].sort((a,b)=>b.score-a.score||a.index-b.index)[0];
    const worst=[...valid].sort((a,b)=>a.score-b.score||a.index-b.index)[0];
    const mean=valid.length?Math.round(valid.reduce((n,r)=>n+r.score,0)/valid.length*100)/100:null;
    if (!summary || summary.valid!==valid.length || summary.failed!==report.count-valid.length ||
        summary.bestSeed!==(best?.seed??null) || summary.worstSeed!==(worst?.seed??null) || summary.meanScore!==mean ||
        summary.p50!==times[Math.ceil(report.count*.5)-1] || summary.p95!==times[Math.ceil(report.count*.95)-1]) {
      throw new Error('Сводка пакета не соответствует строкам: результат, оценка или время.');
    }
    const expected=fingerprint({...report,fingerprint:undefined,rows:report.rows.map(({elapsedMs,...r})=>r),summary:{...summary,p50:undefined,p95:undefined}});
    if (expected!==report.fingerprint) throw new Error('Неверный отпечаток пакета.');
    return {ok:true,errors:[],kind:'report',maps:report.count,note:'Проверены строки и арифметика отчёта; для проверки геометрии повторите seed.'};
  } catch (error) {
    return {ok:false,errors:[error.message],code:'INVALID_BATCH'};
  }
}
