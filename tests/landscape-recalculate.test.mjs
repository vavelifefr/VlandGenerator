import test from 'node:test';
import assert from 'node:assert/strict';
import {landscapeRecalculator} from '../Web/HTML/ui/landscape-recalculate.mjs';

function harness(){
 let current={checksum:'a'},draft={percent:10},nextTimer=0;
 const timers=new Map(),applied=[],errors=[],calls=[];
 const calculator=landscapeRecalculator({
  snapshot:()=>({project:current,recipe:structuredClone(draft)}),
  build:async p=>{calls.push(p);return {...p.project,checksum:'next',recipe:p.recipe};},
  apply:async p=>{applied.push(p);current=p;},onError:e=>errors.push(e),
  setTimer:fn=>{timers.set(++nextTimer,fn);return nextTimer;},clearTimer:id=>timers.delete(id)
 });
 return {calculator,applied,errors,calls,setDraft:p=>{draft=p;},setProject:p=>{current=p;},fire:async()=>{const tasks=[...timers.values()];timers.clear();await Promise.all(tasks.map(fn=>fn()));}};
}
test('rapid biome changes rebuild only the latest draft and commit once',async()=>{
 const h=harness();h.calculator.schedule();h.setDraft({percent:20});h.calculator.schedule();await h.fire();
 assert.equal(h.calls.length,1);assert.equal(h.applied.length,1);assert.equal(h.applied[0].recipe.percent,20);
});
test('undo, import or a manual action can cancel the queued rebuild',async()=>{
 const h=harness();h.calculator.schedule();h.calculator.cancel();await h.fire();assert.equal(h.calls.length,0);
});
test('a finished worker cannot overwrite a project edited while it was running',async()=>{
 let finish;const h=harness();
 const calculator=landscapeRecalculator({snapshot:()=>({project:current,recipe:{}}),build:()=>new Promise(r=>{finish=r;}),apply:async p=>h.applied.push(p),onError:e=>h.errors.push(e),setTimer:fn=>{run=fn;return 1;},clearTimer:()=>{}});
 let current={checksum:'a'},run;calculator.schedule();const pending=run();current={checksum:'manual'};finish({checksum:'stale'});await pending;
 assert.equal(h.applied.length,0);
});
test('a failed rebuild reports the conflict without applying anything',async()=>{
 let run;const errors=[],applied=[];const calculator=landscapeRecalculator({snapshot:()=>({project:{checksum:'a'},recipe:{}}),build:async()=>{throw Error('conflict');},apply:async p=>applied.push(p),onError:e=>errors.push(e.message),setTimer:fn=>{run=fn;return 1;},clearTimer:()=>{}});
 calculator.schedule();await run();assert.deepEqual(errors,['conflict']);assert.deepEqual(applied,[]);
});
