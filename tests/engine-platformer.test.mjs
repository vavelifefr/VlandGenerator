import test from 'node:test';
import assert from 'node:assert/strict';
import {generatePlatformer,validatePlatformer,platformerFingerprint,generateMap,importMap,exportMapTiles,analyzePlatformer} from '../engine/api/index.mjs';
const request={schema:'vland.platformer.request',schemaVersion:1,seed:42};
test('side-view levels use physical support, jumps, ladders and connectors1–3 for1–30 rooms',()=>{
  for(const preset of ['metroidvania','roguelite','vertical'])for(const rooms of [1,3,10,30])for(const seed of [0,42]){
    const m=generatePlatformer({...request,preset,rooms,seed});assert.equal(validatePlatformer(m).ok,true);assert.equal(m.analysis.reachableRooms.length,rooms);assert.ok(m.connectors.every(c=>c.length>=1&&c.length<=3));assert.equal(importMap(m).fingerprint,m.fingerprint);
  }
});
test('required jumps are verified by sampled body trajectories, not top-down flood fill',()=>{
  const m=generatePlatformer({...request,rooms:3,gaps:1,platforms:0,branches:0});const jumps=m.analysis.path.segments.filter(s=>s.type==='jump');assert.ok(jumps.length);const walls=new Set(m.board.walls.map(p=>p.x+':'+p.y));assert.ok(m.rooms.every(r=>!walls.has((r.x+Math.floor(r.width/2))+':'+(r.y+r.height))));for(const s of jumps)for(const p of s.trajectory)for(let y=Math.floor(p.y+.001);y<Math.ceil(p.y+m.request.physics.height-.001);y++)for(let x=Math.floor(p.x+.001);x<Math.ceil(p.x+m.request.physics.width-.001);x++)assert.ok(!walls.has(x+':'+y));
  assert.equal(exportMapTiles(m).schema,'vland.platformer.tiles');assert.deepEqual(generateMap(request),generateMap(request));
});
test('forged collision geometry and insufficient movement cannot borrow a saved ok flag',()=>{
  const a=generatePlatformer(request),b=structuredClone(a);b.board.walls.push({...b.spawn,type:'rock'});b.fingerprint=platformerFingerprint(b);b.analysis={ok:true};assert.equal(validatePlatformer(b).ok,false);const c=structuredClone(a);c.connectors[0].length=4;c.fingerprint=platformerFingerprint(c);assert.equal(validatePlatformer(c).ok,false);
  assert.throws(()=>generatePlatformer({...request,physics:{gravity:0}}));assert.throws(()=>generatePlatformer({...request,rooms:31}));assert.throws(()=>generatePlatformer({...request,typo:true}));
  const two=generatePlatformer({...request,rooms:5,physics:{width:2,height:3},gaps:0});assert.equal(analyzePlatformer(two).ok,true);
});
test('a30-room vertical chain fits the board and honours configured room bounds',()=>{
  const m=generatePlatformer({...request,rooms:30,branches:1,roomWidth:{min:12,max:12}});assert.equal(validatePlatformer(m).ok,true);assert.equal(m.analysis.reachableRooms.length,30);assert.ok(m.rooms.every(r=>r.x+r.width<=m.board.width&&r.y+r.height<=m.board.height&&r.width===12));
});