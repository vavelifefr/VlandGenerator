import test from 'node:test';import assert from 'node:assert/strict';
import {generateDungeon,normalizeConfig,populationSettings,POPULATION_TYPES,validateDungeon,importDungeon,fingerprint,createSpawnerState,stepSpawners} from '../engine/api/index.mjs';
import {spawnerProgram,spawnerWave} from '../engine/api/spawner-program.mjs';
const build=rules=>generateDungeon({seed:7,candidates:1,generator:{roomCount:12},content:{population:{enabled:true,rules}}});
test('spawner programs reject malformed waves and preserve explicit composition and repetition',()=>{
 const waves=[{members:[{mobId:'soldier',count:2},{mobId:'drone',count:1}]},{members:[{mobId:'robot',count:1}]}],rule={batch:1,waves};
 assert.deepEqual(spawnerWave(rule,0),['soldier','soldier','drone']);assert.deepEqual(spawnerWave(rule,2),['soldier','soldier','drone']);assert.deepEqual(spawnerWave({...rule,repeat:'last'},8),['robot']);assert.equal(spawnerWave({...rule,repeat:'once'},2),null);
 for(const invalid of [{waves:[{members:[]}]},{waves:[{members:[{mobId:'../bad',count:1}]}]},{waves:[{members:[{mobId:'a',count:8},{mobId:'b',count:1}]}]},{activation:{type:'lever',delay:1}},{activation:{type:'timer',delay:61}},{repeat:'random'}])assert.throws(()=>spawnerProgram(invalid));
 assert.throws(()=>populationSettings({rules:{spawner:{waves,aliveLimit:2}}}));
});
test('lever controllers are deterministic, reachable reservations and validated in JSON',()=>{
 const b=build({spawner:{min:2,max:2,activation:{type:'lever'}}});assert.equal(b.content.population.summary.spawner.placed,2);assert.equal(validateDungeon(b).ok,true);assert.deepEqual(generateDungeon(b.recipe),b);
 const all=new Set();for(const p of b.content.population.placements){for(const q of p.spawnArea)all.add(`${q.x}:${q.y}`);}
 for(const p of b.content.population.placements.filter(p=>p.populationKind==='spawner')){assert.equal(p.controller.id,p.id+'-control');for(const q of [p.controller,...p.controller.approach]){assert.ok(!all.has(`${q.x}:${q.y}`));all.add(`${q.x}:${q.y}`);}}
 const forged=structuredClone(b);delete forged.content.population.placements.find(p=>p.controller).controller;forged.fingerprint=fingerprint({level:forged.level,content:forged.content});assert.equal(validateDungeon(forged).ok,false);
});
test('room-entry activates once, ignores outside positions and gives the first wave its interval',()=>{
 const b=build({spawner:{min:1,max:1,period:2,activation:{type:'room-entry'}}}),p=b.content.population.placements.find(p=>p.populationKind==='spawner');let s=createSpawnerState(b);
 let r=stepSpawners(b,s,{type:'tick',clock:'actions',amount:3,position:b.level.spawn});assert.equal(r.state.blocks[p.id].activated,false);
 r=stepSpawners(b,r.state,{type:'tick',clock:'actions',amount:1,position:p});assert.equal(r.state.blocks[p.id].activated,true);assert.equal(r.state.blocks[p.id].elapsed,0);
 r=stepSpawners(b,r.state,{type:'tick',clock:'actions',amount:2,position:p});assert.equal(r.events.filter(e=>e.type==='spawner-spawn').length,1);assert.ok(!r.events.some(e=>e.type==='spawner-activated'));
});
test('timer arms on entry and consumes explicit delay before the first wave interval',()=>{
 const b=build({spawner:{min:1,max:1,period:2,activation:{type:'timer',delay:3}}}),p=b.content.population.placements.find(p=>p.populationKind==='spawner');let s=createSpawnerState(b,{clock:'seconds'});
 let r=stepSpawners(b,s,{type:'tick',clock:'seconds',amount:1,position:p});assert.equal(r.state.blocks[p.id].armed,true);assert.equal(r.state.blocks[p.id].delayElapsed,0);
 r=stepSpawners(b,r.state,{type:'tick',clock:'seconds',amount:2});assert.equal(r.state.blocks[p.id].activated,false);
 r=stepSpawners(b,JSON.parse(JSON.stringify(r.state)),{type:'tick',clock:'seconds',amount:2});assert.equal(r.state.blocks[p.id].activated,true);assert.equal(r.state.blocks[p.id].elapsed,1);assert.ok(!r.events.some(e=>e.type==='spawner-spawn'));
 r=stepSpawners(b,r.state,{type:'tick',clock:'seconds',amount:1});assert.ok(r.events.some(e=>e.type==='spawner-spawn'));
});
test('lever must be used at its controller and cannot retrigger an active block',()=>{
 const b=build({spawner:{min:1,max:1,activation:{type:'lever'}}}),p=b.content.population.placements.find(p=>p.populationKind==='spawner'),s=createSpawnerState(b);
 assert.equal(stepSpawners(b,s,{type:'tick',clock:'actions',amount:60,position:p}).state.blocks[p.id].emitted,0);
 assert.equal(stepSpawners(b,s,{type:'activate',id:p.id,position:b.level.spawn}).ok,false);
 const r=stepSpawners(b,s,{type:'activate',id:p.id,position:p.controller.approach[0]});assert.ok(r.ok,r.message);assert.equal(r.state.blocks[p.id].activated,true);assert.equal(stepSpawners(b,r.state,{type:'activate',id:p.id,position:p.controller}).ok,false);
});
test('a partial wave resumes its exact remaining roster, and once stops after the sequence',()=>{
 const b=build({spawner:{min:1,max:1,period:2,aliveLimit:3,totalLimit:0,repeat:'once',waves:[{members:[{mobId:'soldier',count:2},{mobId:'drone',count:1}]},{members:[{mobId:'robot',count:1}]}]}}),p=b.content.population.placements.find(p=>p.populationKind==='spawner'),s=createSpawnerState(b),fake=[1,2].map(i=>({id:'occupant'+i,spawnerId:p.id,hp:1,...b.level.spawn}));
 let r=stepSpawners(b,s,{type:'tick',clock:'actions',amount:2},{actors:fake}),spawned=r.events.filter(e=>e.type==='spawner-spawn');assert.deepEqual(spawned.map(e=>e.mobId),['soldier']);assert.equal(r.state.blocks[p.id].waveOffset,1);
 r=stepSpawners(b,JSON.parse(JSON.stringify(r.state)),{type:'tick',clock:'actions',amount:1},{actors:spawned});assert.deepEqual(r.events.filter(e=>e.type==='spawner-spawn').map(e=>e.mobId),['soldier','drone']);assert.equal(r.state.blocks[p.id].waveIndex,1);
 r=stepSpawners(b,r.state,{type:'tick',clock:'actions',amount:2});assert.deepEqual(r.events.filter(e=>e.type==='spawner-spawn').map(e=>e.mobId),['robot']);
 r=stepSpawners(b,r.state,{type:'tick',clock:'actions',amount:60});assert.equal(r.state.blocks[p.id].emitted,4);assert.ok(!r.events.some(e=>e.type==='spawner-spawn'));
});
test('five population categories validate quotas, scope and spawner rules',()=>{
 assert.equal(Object.keys(POPULATION_TYPES).length,5);assert.equal(normalizeConfig({}).content.population.enabled,false);
 for(const config of [{enabled:'yes'},{rules:{unknown:{}}},{rules:{ordinary:{scope:'world'}}},{rules:{rare:{min:3,max:2}}},{rules:{neutral:{family:'human'}}},{rules:{spawner:{period:1}}},{rules:{spawner:{batch:4,aliveLimit:2}}}])assert.throws(()=>populationSettings(config));
 assert.throws(()=>populationSettings({enabled:true,rules:{boss:{min:0,max:0}}},{requireBoss:true}));
});
test('floor quotas, family preferences and room quotas produce deterministic safe placements',()=>{
 const b=build({ordinary:{scope:'floor',min:6,max:6,family:'mechanical'},rare:{scope:'room',min:1,max:1},neutral:{min:3,max:3},boss:{min:2,max:2},spawner:{min:2,max:2}}),p=b.content.population;
 assert.deepEqual(generateDungeon(b.recipe),b);assert.equal(validateDungeon(b).ok,true);assert.equal(p.summary.ordinary.placed,6);assert.equal(p.summary.neutral.placed,3);assert.equal(p.summary.boss.placed,2);assert.equal(p.summary.spawner.placed,2);assert.ok(p.placements.filter(p=>p.populationKind==='ordinary').every(p=>p.family==='mechanical'));
 const excluded=new Set([...b.content.setpieces.zones,...b.content.setpieces.challenges].map(r=>r.roomId)),reserved=new Set(b.level.protectedTiles),seen=new Set();
 for(const point of p.placements){assert.ok(!excluded.has(point.roomId));assert.ok(!reserved.has(`${point.x}:${point.y}`));assert.ok(!seen.has(`${point.x}:${point.y}`));seen.add(`${point.x}:${point.y}`);}
 assert.ok(p.placements.filter(p=>p.populationKind==='boss').every(p=>p.spawnArea.length===9));
});
test('shortage is explicit and never forces inhabitants onto protected routes',()=>{
 const b=generateDungeon({seed:0,candidates:1,generator:{roomCount:2},content:{population:{enabled:true,rules:{ordinary:{scope:'floor',min:240,max:240},spawner:{min:2,max:2}}}}});
 assert.equal(b.content.population.summary.ordinary.placed,0);assert.equal(b.content.population.summary.ordinary.shortfall,240);assert.ok(b.content.population.warnings.length);assert.equal(validateDungeon(b).ok,true);
});
test('population JSON is exact and forged placements or summaries fail semantic validation',()=>{
 const b=build({spawner:{min:1,max:1}});assert.deepEqual(importDungeon(JSON.stringify(b)),JSON.parse(JSON.stringify(b)));
 for(const mutate of [c=>c.content.population.placements[0].x=0,c=>c.content.population.summary.ordinary.placed=999,c=>c.content.population.rules.spawner.period=1]){const c=structuredClone(b);mutate(c);c.fingerprint=fingerprint({level:c.level,content:c.content});assert.equal(validateDungeon(c).ok,false);}
});
test('spawners warn, emit on explicit periods, obey alive/total caps and remain immutable',()=>{
 const b=build({spawner:{min:1,max:1,period:3,batch:1,aliveLimit:2,totalLimit:3}});let state=createSpawnerState(b),actors=[],events=[];const before=structuredClone(b);
 const tick=()=>{const r=stepSpawners(b,state,{type:'tick',clock:'actions',amount:1},{actors});assert.ok(r.ok,r.message);state=r.state;events.push(...r.events);actors.push(...r.events.filter(e=>e.type==='spawner-spawn').map(e=>({...e,hp:10})));};
 tick();assert.equal(events.length,0);tick();assert.ok(events.some(e=>e.type==='spawner-warning'));tick();assert.equal(actors.length,1);
 for(let i=0;i<12;i++)tick();assert.equal(actors.length,2);actors[0].hp=0;for(let i=0;i<5;i++)tick();assert.equal(actors.length,3);actors=[];for(let i=0;i<12;i++)tick();assert.equal(Object.values(state.blocks)[0].emitted,3);assert.deepEqual(b,before);
});
test('destroyed, paused and surrounded spawners do not emit; invalid actions are rejected',()=>{
 const b=build({spawner:{min:1,max:1}}),p=b.content.population.placements.find(p=>p.populationKind==='spawner'),initial=createSpawnerState(b);
 const paused=stepSpawners(b,initial,{type:'tick',clock:'actions',amount:5},{activeIds:[]});assert.deepEqual(paused.state,initial);
 const blockedCells=[];for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)blockedCells.push({x:p.x+dx,y:p.y+dy});
 const boxed=stepSpawners(b,initial,{type:'tick',clock:'actions',amount:4},{blockedCells:blockedCells.filter(c=>c.x>=0&&c.y>=0&&c.x<b.level.board.width&&c.y<b.level.board.height)});assert.ok(boxed.ok);assert.ok(!boxed.events.some(e=>e.type==='spawner-spawn'));
 const killed=stepSpawners(b,initial,{type:'destroy',id:p.id,position:p});assert.ok(killed.ok);assert.equal(stepSpawners(b,killed.state,{type:'tick',clock:'actions',amount:60}).events.length,0);
 for(const amount of [-1,Infinity,.5])assert.equal(stepSpawners(b,initial,{type:'tick',clock:'actions',amount}).ok,false);
});
test('real-time adapters choose seconds and apply elapsed time without wall clocks',()=>{
 const b=build({spawner:{min:1,max:1,period:2}});let s=createSpawnerState(b,{clock:'seconds'});let r=stepSpawners(b,s,{type:'tick',clock:'seconds',amount:1});assert.ok(r.events.some(e=>e.type==='spawner-warning'));r=stepSpawners(b,r.state,{type:'tick',clock:'seconds',amount:1});assert.ok(r.events.some(e=>e.type==='spawner-spawn'));assert.equal(stepSpawners(b,s,{type:'tick',clock:'actions',amount:1}).ok,false);
 const legacy=createSpawnerState(b,{clock:'seconds'});for(const block of Object.values(legacy.blocks))for(const field of ['activated','armed','delayElapsed','waveIndex','waveOffset'])delete block[field];assert.equal(stepSpawners(b,legacy,{type:'tick',clock:'seconds',amount:1}).ok,true);
});
