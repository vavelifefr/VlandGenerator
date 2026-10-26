import test from 'node:test';
import assert from 'node:assert/strict';
import {generateMap,validateMap,importMap,exportMap,exportMapTiles,generateAtlas,validateAtlas,atlasFingerprint,findAtlasPath,ATLAS_PRESETS,ATLAS_RESOURCES,normalizeAtlasRequest,createMovementField,movementFits} from '../engine/api/index.mjs';
import {gaussianBlur,thermalErosion} from '../engine/core/atlas-math.mjs';
import {watershed} from '../engine/core/atlas-water.mjs';
import {executeMapOperation} from '../engine/api/operations.mjs';
import {createAtlasRuntime,tickAtlas,actOnAtlas} from '../engine/api/atlas-runtime.mjs';
const request={schema:'vland.atlas.request',schemaVersion:1,seed:42,width:40,height:32,layers:{above:1,underground:2}};
test('Gaussian kernel preserves constants and spreads impulses symmetrically; erosion conserves height',()=>{
  assert.ok(gaussianBlur(new Array(81).fill(.3),9,9,1).every(v=>Math.abs(v-.3)<1e-6));const impulse=new Array(81).fill(0);impulse[40]=1;const blurred=gaussianBlur(impulse,9,9,1);assert.ok(blurred[40]>blurred[41]&&blurred[41]>0);assert.equal(blurred[39],blurred[41]);assert.equal(blurred[31],blurred[49]);const eroded=thermalErosion(impulse,9,9,8);assert.ok(Math.abs(eroded.reduce((a,b)=>a+b,0)-1)<1e-4);assert.ok(eroded[40]<1);
});
test('Priority-Flood resolves depressions and flats into acyclic, accumulating watersheds',()=>{
  const heights=new Array(81).fill(.5);heights[40]=.05;const a=watershed(heights,9,9);
  assert.equal(a.filledElevation[40],.5);for(let i=0;i<81;i++){let at=i,steps=0;while(a.flowTo[at]>=0){const to=a.flowTo[at];assert.ok(a.flowRank[to]<a.flowRank[at]);assert.ok(a.filledElevation[to]<=a.filledElevation[at]);assert.ok(a.drainage[to]>=a.drainage[at]);at=to;assert.ok(++steps<81);}}
});
test('eight atlas presets produce playable shared-XY layers, coherent ores and repeatable snapshots',()=>{
  for(const preset of Object.keys(ATLAS_PRESETS))for(const seed of [0,42]){
    const a=generateAtlas({...request,preset,seed}),report=validateAtlas(a);assert.equal(report.ok,true,preset+': '+report.errors);assert.ok(a.navigation.ok);assert.equal(new Set(a.layers.map(l=>l.board.width+':'+l.board.height)).size,1);
    for(const l of a.layers)for(const d of l.deposits){const spec=ATLAS_RESOURCES[d.type];assert.ok(d.depth>=spec.minDepth&&d.depth<=spec.maxDepth);for(const p of d.cells)assert.ok(spec.hosts.includes(l.fields.rock[p.y*l.board.width+p.x]));}
    assert.equal(importMap(JSON.stringify(a)).fingerprint,a.fingerprint);assert.equal(exportMapTiles(a).layers.length,a.layers.length);
  }
  const a=generateAtlas(request),b=generateAtlas(request);assert.deepEqual(a,b);assert.notEqual(a.fingerprint,generateAtlas({...request,seed:43}).fingerprint);
});
test('content streams do not change natural heights, drainage or cave geometry',()=>{
  const a=generateAtlas(request),b=generateAtlas({...request,resources:{frequency:0},events:{density:0,spawners:0},structures:{density:0},ecology:{vegetation:0}});
  for(let k=0;k<a.layers.length;k++){assert.deepEqual(a.layers[k].fields.heightmap,b.layers[k].fields.heightmap);assert.deepEqual(a.layers[k].fields.waterType,b.layers[k].fields.waterType);assert.ok(b.layers[k].fields.resource.every(id=>id===''));assert.ok(b.layers[k].fields.vegetation.every(id=>id===''));assert.equal(b.layers[k].sites.length,0);}
});
test('validation recalculates navigation/hydrology and rejects resealed contradictory snapshots',()=>{
  const a=generateAtlas(request),mutations=[b=>{b.layers[0].fields.flowTo[0]=0;},b=>{b.layers[1].fields.support[b.links[0].from.y*b.request.width+b.links[0].from.x]=0;},b=>{b.layers[0].fields.waterType[0]='ocean';},b=>{b.links[0].to.x++;},b=>{b.layers[0].fields.humidity.pop();}];
  for(const change of mutations){const b=structuredClone(a);change(b);b.fingerprint=atlasFingerprint(b);assert.equal(validateMap(b).ok,false);}
  const b=structuredClone(a);b.navigation={ok:true};b.analysis={cells:-1};for(const l of b.layers)l.analysis={reachable:false};const imported=importMap(b);assert.ok(imported.navigation.ok);assert.ok(imported.analysis.cells>0);assert.ok(imported.layers.every(l=>l.analysis.reachable));
});
test('full-world path honours footprint limits and live blocked cells',()=>{
  const a=generateAtlas(request);assert.equal(findAtlasPath(a).ok,true);assert.equal(findAtlasPath(a,a.spawn,a.exit,'large').ok,false);const states={[a.spawn.layerId]:{blockedCells:[a.spawn]}};assert.equal(findAtlasPath(a,a.spawn,a.exit,'walker',{layerStates:states}).reachable,false);
  assert.equal(executeMapOperation('map-movement',{map:a,layerId:a.spawn.layerId,profile:'walker',state:{blockedCells:[a.spawn]}}).worldAnalysis.ok,false);assert.throws(()=>findAtlasPath(a,{layerId:'missing',x:1,y:1}));
  const large=generateAtlas({...request,seed:138,preset:'caverns',profile:'large',caves:{style:'tunnels',openness:.75,connectivity:1,aquifers:1},layers:{above:0,underground:3}});assert.equal(validateAtlas(large).ok,true);
});
test('hazards avoid starts, finite spawners and static sites remain reachable',()=>{
  const a=generateAtlas({...request,width:64,height:64,events:{density:2,spawners:2},structures:{density:2}});let spawners=0;
  for(const l of a.layers){const field=createMovementField(l,a.request.profile);for(const s of l.sites){assert.ok(movementFits(field,s.position));if(['event','spawner'].includes(s.kind))assert.ok(Math.hypot(s.position.x-l.spawn.x,s.position.y-l.spawn.y)>a.request.playability.safeRadius);if(s.kind==='spawner'){spawners++;assert.equal(s.program.repeat,'once');assert.ok(s.totalLimit<=4);}}}assert.ok(spawners>0);assert.equal(validateAtlas(a).ok,true);
});
test('strict zero settings and incompatible/oversized atlas requests are handled honestly',()=>{
  const r=normalizeAtlasRequest({...request,terrain:{water:0,blur:0,erosion:0},layers:{above:0,underground:0},events:{density:0,spawners:0}});assert.equal(r.terrain.water,0);assert.equal(r.layers.underground,0);
  const dry=generateAtlas({...request,terrain:{water:0},hydrology:{rivers:0,lakes:0},layers:{above:0,underground:0}});assert.ok(dry.layers[0].fields.waterType.every(type=>type==='none'));assert.ok(dry.layers[0].fields.heightmap.every(h=>h>dry.hydrology.seaLevel));assert.ok(!dry.layers[0].fields.biome.includes('coast'));
  for(const bad of [{...request,width:301},{...request,width:256,height:256},{...request,terrain:{typo:1}},{...request,geology:{rocks:[]}},{...request,preset:'caverns',layers:{underground:0}}])assert.throws(()=>generateAtlas(bad));
  const a=generateMap({...request,width:16,height:16,layers:{above:0,underground:0}});assert.equal(validateMap(a).ok,true);
  const fullBody=generateAtlas({...request,width:16,height:16,layers:{above:0,underground:1},profile:{width:8,height:8}});assert.equal(validateAtlas(fullBody).ok,true);assert.ok(fullBody.repairs.some(r=>r.type==='safe-clearing'));
});
test('atlas runtime caps finite waves, respects living actors and persists unique event/resource outcomes',()=>{
  const a=generateAtlas({...request,width:64,height:64,events:{density:2,spawners:2}}),before=JSON.stringify(a);let state=createAtlasRuntime(a);const layer=a.layers.find(l=>l.sites.some(s=>s.kind==='spawner')),s=layer.sites.find(s=>s.kind==='spawner'),actors=[{layerId:layer.id,...s.position}];
  let step=tickAtlas(a,state,{elapsed:1,actors});state=step.state;assert.equal(step.orders.find(o=>o.spawnerId===s.id).members.length,1);assert.equal(tickAtlas(a,state,{elapsed:4,actors,aliveBySpawner:{[s.id]:3}}).orders.filter(o=>o.spawnerId===s.id).length,0);step=tickAtlas(a,state,{elapsed:4,actors});state=step.state;assert.equal(state.spawners[s.id].wave,2);assert.equal(tickAtlas(a,state,{elapsed:60,actors}).orders.filter(o=>o.spawnerId===s.id).length,0);
  const el=a.layers.find(l=>l.sites.some(s=>s.kind==='event')),event=el.sites.find(s=>s.kind==='event'),action={type:'choose-event',layerId:el.id,id:event.id,choice:'investigate'},decision=actOnAtlas(a,state,action);state=decision.state;assert.ok(decision.orders.length);assert.equal(actOnAtlas(a,state,action).orders.length,0);
  const oreLayer=a.layers.find(l=>l.deposits.length),p=oreLayer.deposits[0].cells[0],i=p.y*a.request.width+p.x,amount=oreLayer.fields.resourceAmount[i],harvest={type:'harvest',layerId:oreLayer.id,position:p,amount:10000};const mined=actOnAtlas(a,state,harvest);assert.equal(mined.orders[0].amount,amount);assert.throws(()=>actOnAtlas(a,mined.state,harvest));assert.equal(JSON.stringify(a),before);const corrupt=structuredClone(state);corrupt.spawners[s.id].wave=99;assert.throws(()=>tickAtlas(a,corrupt));
});
test('maximum atlas area can be exported and imported within24MiB using compact JSON',()=>{
  const a=generateAtlas({...request,width:256,height:128,layers:{above:0,underground:2}}),text=exportMap(a);assert.ok(new TextEncoder().encode(text).byteLength<24*1024*1024);assert.equal(importMap(text).fingerprint,a.fingerprint);
});
