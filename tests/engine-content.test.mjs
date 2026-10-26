import test from 'node:test';
import assert from 'node:assert/strict';
import {generateDungeon,normalizeConfig,CONTENT_CATEGORIES,CONTENT_TYPES,createContentState,contentAction,contentBlockedCells,findPath,isWalkable,exportTileGrid,validateDungeon,importDungeon,fingerprint,SHAPES,SHAPE_MIN_SIZE,roomContains} from '../engine/api/index.mjs';
import {roomShape} from '../engine/core/shapes.mjs';
const key=p=>`${p.x}:${p.y}`;
const scene=(content={},generator={})=>generateDungeon({seed:7,candidates:1,generator:{roomCount:20,preset:'branches',...generator},content:{floodFrequency:1,timedFrequency:1,...content}});

test('semantic categories, genre policies and themes are explicit and deterministic',()=>{
 assert.equal(Object.keys(CONTENT_CATEGORIES).length,10);assert.ok(Object.keys(CONTENT_TYPES).length>=12);
 const a=scene(),b=generateDungeon(a.recipe);assert.deepEqual(a,b);
 for(const content of [{genre:'racing'},{theme:'unknown'},{propDensity:3},{floodFrequency:-1},{timedFrequency:2},{abilityFrequency:NaN}])assert.throws(()=>normalizeConfig({content}));
});

test('four genres and five themes reserve safe objects and keep the obligatory exit reachable',()=>{
 for(const genre of ['turn-based','metroidvania','fps','bullet-hell'])for(const theme of ['sci-fi','ruins','caverns','fantasy','abstract']){
  const b=scene({genre,theme}),data=b.content.setpieces,seen=new Set(b.content.hints.map(key));
  assert.equal(validateDungeon(b).ok,true);assert.ok(findPath(b,b.level.spawn,b.level.rooms.find(r=>r.id===b.level.plan.finalId).core));
  for(const s of data.slots){assert.ok(!seen.has(key(s.anchor)));seen.add(key(s.anchor));assert.ok(s.approach.length);assert.ok(!b.level.protectedTiles.includes(key(s.anchor)));assert.ok(CONTENT_TYPES[s.typeId]);}
  assert.ok(data.challenges.every(c=>c.clock===(genre==='turn-based'?'actions':'seconds')));
 }
});

test('flood rooms are optional, full-room, with an accessible outside controller and explicit drainage',()=>{
 const b=scene(),zone=b.content.setpieces.zones.find(z=>z.type==='flood');assert.ok(zone);
 const slot=b.content.setpieces.slots.find(s=>s.id===zone.controllerId),room=b.level.rooms.find(r=>r.id===zone.roomId),before=structuredClone(b),state=createContentState(b);
 assert.ok(!b.level.plan.mainPath.includes(zone.roomId));assert.notEqual(slot.roomId,zone.roomId);assert.ok(findPath(b,b.level.spawn,slot.anchor,{content:state}));
 assert.equal(isWalkable(b,room.core,{content:state}),false);assert.equal(exportTileGrid(b,{content:state}).walkable[room.core.y*b.level.board.width+room.core.x],0);
 assert.equal(contentAction(b,state,{type:'interact',id:slot.id,position:{x:0,y:0}}).ok,false);
 const drained=contentAction(b,state,{type:'interact',id:slot.id,position:slot.anchor});assert.ok(drained.ok);assert.ok(drained.events.some(e=>e.type==='zone-cleared'));
 assert.equal(isWalkable(b,room.core,{content:drained.state}),true);assert.deepEqual(b,before);assert.equal(contentAction(b,drained.state,{type:'interact',id:slot.id,position:slot.anchor}).ok,false);
});

test('Metroidvania ability gates use symbolic capabilities with an accessible acquisition fallback',()=>{
 const b=scene({genre:'metroidvania',floodFrequency:0,abilityFrequency:1}),zone=b.content.setpieces.zones[0];assert.ok(zone);assert.equal(zone.type,'ability-seal');
 const slot=b.content.setpieces.slots.find(s=>s.id===zone.controllerId),state=createContentState(b),capable=createContentState(b,{capabilities:[zone.bypassCapability]});
 assert.ok(contentBlockedCells(b,state).some(p=>key(p)===key(zone.cells[0])));assert.ok(!contentBlockedCells(b,capable).some(p=>key(p)===key(zone.cells[0])));
 const used=contentAction(b,state,{type:'interact',id:slot.id,position:slot.anchor});assert.ok(used.state.capabilities.includes(zone.bypassCapability));
});

test('a turn trial is sized to a shortest local path plus 2–3 actions, succeeds and pays only once',()=>{
 const b=scene({floodFrequency:0}),c=b.content.setpieces.challenges[0];assert.ok(c);assert.equal(c.budget,c.minimumActions+c.errorAllowance);
 let state=createContentState(b),events=[];
 for(const p of c.route){const r=contentAction(b,state,{type:'move',position:p});assert.ok(r.ok);state=r.state;events.push(...r.events);}
 assert.equal(state.challenges[c.id].state,'success');assert.ok(events.find(e=>e.type==='challenge-success'&&e.id===c.id&&e.reward));
 assert.equal(state.challenges[c.id].elapsed,c.minimumActions);
 const retried=contentAction(b,state,{type:'retry',id:c.id,position:c.entry});state=retried.state;events=[];
 for(const p of c.route){const r=contentAction(b,state,{type:'move',position:p});state=r.state;events.push(...r.events);}
 assert.ok(events.find(e=>e.id===c.id&&e.type==='challenge-success'&&!e.reward));
});

test('timer failure warns, leaves exits open and can be retried; clocks are explicit',()=>{
 for(const genre of ['turn-based','fps','bullet-hell','metroidvania']){
  const b=scene({genre,floodFrequency:0}),c=b.content.setpieces.challenges[0];assert.ok(c);
  let r=contentAction(b,createContentState(b),{type:'move',position:c.entry});assert.equal(r.state.challenges[c.id].elapsed,0);
  const before=structuredClone(r.state);assert.deepEqual(r.state,before);
  r=contentAction(b,r.state,{type:'tick',clock:c.clock,amount:c.budget});assert.equal(r.state.challenges[c.id].state,'failed');assert.ok(r.events.some(e=>e.type==='challenge-warning'));assert.ok(r.events.some(e=>e.type==='challenge-failed'));assert.equal(c.blocksExit,false);
  const again=contentAction(b,r.state,{type:'move',position:c.entry});assert.equal(again.state.challenges[c.id].state,'active');assert.equal(again.state.challenges[c.id].attempts,2);
  for(const amount of [-1,Infinity,NaN])assert.equal(contentAction(b,again.state,{type:'tick',clock:c.clock,amount}).ok,false);
  const outside=contentAction(b,again.state,{type:'move',position:b.level.spawn});assert.equal(outside.state.challenges[c.id].state,'failed');assert.deepEqual(outside.events.find(e=>e.id===c.id&&e.type==='challenge-failed').position,c.entry);
  assert.equal(contentAction(b,null,{type:'tick',clock:'actions',amount:1}).ok,false);assert.throws(()=>createContentState(b,{capabilities:['bad name']}));
 }
});

test('destruction is material-aware, immutable and cannot destroy a pump or execute arbitrary effects',()=>{
 const b=scene(),data=b.content.setpieces,slot=data.slots.find(s=>s.destructible),pump=data.slots.find(s=>s.typeId==='drain-pump'),state=createContentState(b);assert.ok(slot&&pump);
 const r=contentAction(b,state,{type:'destroy',id:slot.id,position:slot.anchor});assert.ok(r.ok);assert.ok(r.state.destroyedSlotIds.includes(slot.id));assert.ok(!state.destroyedSlotIds.includes(slot.id));
 assert.equal(contentAction(b,state,{type:'destroy',id:pump.id,position:pump.anchor}).ok,false);assert.equal(contentAction(b,state,{type:'eval',code:'throw 1'}).ok,false);
});

test('JSON importer validates scenarios independently of a recomputed checksum',()=>{
 const original=scene();
 for(const mutate of [b=>b.content.setpieces.zones[0].roomId=b.level.plan.startId,b=>b.content.setpieces.slots[0].anchor={x:0,y:0},b=>b.content.setpieces.challenges[0].budget=1,b=>b.content.setpieces.challenges[0].onFailure='eval',b=>b.content.setpieces.zones[0].controllerId='missing']){
  const b=structuredClone(original);mutate(b);b.fingerprint=fingerprint({level:b.level,content:b.content});assert.equal(validateDungeon(b).ok,false);assert.throws(()=>importDungeon(b));
 }
});

test('all eight puzzle masks fit their minimum size in four rotations with a 3×3 core',()=>{
 for(const shape of ['S','Z','U','H','P','I','X','O'])for(let rotation=0;rotation<4;rotation++){
  const size=SHAPE_MIN_SIZE[shape],room={id:'mask',x:2,y:2,width:size,height:size+4,core:{x:2+Math.floor(size/2),y:4+Math.floor(size/2)},purpose:'chamber'},weights=Object.fromEntries(SHAPES.map(id=>[id,id===shape?1:0]));let calls=0;
  const mask=roomShape(room,()=>++calls===1?.5:rotation/4,{shapeWeights:weights});assert.equal(mask.shape,shape);assert.equal(mask.rotation,rotation);
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)assert.ok(mask.floor.has(key({x:mask.core.x+dx,y:mask.core.y+dy})),shape);
  assert.ok(mask.floor.size>=25);for(const k of mask.floor){const[x,y]=k.split(':').map(Number);assert.ok(roomContains(room,{x,y},{interior:true}));}
 }
});

test('puzzle-only floors keep every entrance, placement area and maximum-three-cell connector',()=>{
 for(const shape of ['S','Z','U','H','P','I','X','O']){
  const min=SHAPE_MIN_SIZE[shape],b=scene({floodFrequency:0,timedFrequency:0},{roomCount:8,roomMin:min,roomMax:Math.max(min,20),interlocking:false,compositions:false,shapeWeights:Object.fromEntries(SHAPES.map(id=>[id,id===shape?1:0]))});
  assert.equal(validateDungeon(b).ok,true);assert.ok(b.level.rooms.some(r=>r.shape===shape));assert.ok(b.level.connections.every(c=>c.cells.length<=3));assert.ok(b.content.setpieces.slots.length>0);
 }
});
