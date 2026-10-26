import {MODES} from '../app/contracts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {smallProject} from './helpers.mjs';
import {createRecipe,generateBase,validateProject,materialize,contentScene,previewDistribution,applyDistribution,editProject,exportRuntime,importProject} from '../app/index.mjs';
import {createSource,createDistributionRequest,hash} from '../content/index.mjs';
import {reachableTiles,validateLevel,findTilePath} from '../engine/core/validation.mjs';
import {validateDungeon} from '../engine/api/serialization.mjs';
import {findPath,stepWalkthrough,createWalkthrough} from '../engine/api/navigation.mjs';
import {findMovementPath} from '../engine/api/movement.mjs';

async function reportedRecipe(){const r=await createRecipe();r.seed=4147868664;r.generation.rooms.minArea=25;r.generation.rooms.maxArea=100;r.generation.layout.preset='branches';r.generation.search.candidates=1;return r;}

test('reported seed has a two-cell passage and a secret gate, with no disconnected room by default',async()=>{
 const r=await reportedRecipe(),p=await generateBase(r),l=p.source.level;
 assert.equal(r.generation.layout.allowDisconnected,false);assert.deepEqual([l.board.width,l.board.height],[67,67]);assert.deepEqual(l.gates.find(g=>g.id==='edge-12'),{id:'edge-12',kind:'secret',position:{x:15,y:57}});assert.equal(l.connections.find(c=>c.id==='edge-12').cells.length,2);
 const seen=reachableTiles(l,{opened:new Set(l.plan.edges.map(e=>e.id))});assert.ok(l.rooms.every(r=>r.floorTiles.every(t=>seen.has(t.x+':'+t.y))));assert.ok((await validateProject(p)).ok);
});

test('validators reject a missing passage, blocked corridor cell and mismatched door even when a loop provides a bypass',async()=>{
 const l=(await generateBase(await reportedRecipe())).source.level;
 const missing=structuredClone(l);missing.connections.shift();assert.equal(validateLevel(missing).ok,false);
 const blocked=structuredClone(l),c=blocked.connections[0];blocked.board.walls.push({...c.cells[0],type:'bedrock'});assert.ok(validateLevel(blocked).errors.some(e=>e.includes('Проход перекрыт')));
 const cap=structuredClone(l);cap.rooms.find(r=>r.doors.length).doors[0].x++;assert.equal(validateLevel(cap).ok,false);
});

test('intentional isolation requires the flag and a valid explicit paired link; all navigation and export paths follow it',async()=>{
 const r=await reportedRecipe();r.generation.layout.allowDisconnected=true;const p=await generateBase(r),l=p.source.level;
 assert.equal(l.transportLinks.length,1);const link=l.transportLinks[0],all=new Set(l.plan.edges.map(e=>e.id)),without={...l,transportLinks:[]},physical=reachableTiles(without,{opened:all});assert.ok(l.isolation.isolatedRoomIds.some(id=>!physical.has(l.rooms.find(r=>r.id===id).core.x+':'+l.rooms.find(r=>r.id===id).core.y)));
 assert.equal(validateLevel(without).ok,false);const forbidden=structuredClone(l);forbidden.options.allowDisconnected=false;assert.equal(validateDungeon(forbidden).ok,false);const bad=structuredClone(l);bad.transportLinks[0].to.x=0;assert.equal(validateDungeon(bad).ok,false);
 for(const path of [findTilePath(l,link.from,link.to),findPath(l,link.from,link.to),findMovementPath(l,link.from,link.to)])assert.equal(path.length,2);
 const walk={...createWalkthrough(l),position:{x:link.from.x,y:link.from.y}},travel=stepWalkthrough(l,walk,{type:'travel',id:link.id});assert.ok(travel.ok);assert.deepEqual(travel.state.position,{x:link.to.x,y:link.to.y});
 const runtime=await exportRuntime(p);assert.equal(runtime.links.length,1);assert.equal(runtime.links[0].from.layerId,'main');assert.equal(runtime.scene.map.fixtures.filter(f=>f.properties.transportId).length,2);assert.deepEqual(await importProject(p),p);assert.ok(l.connections.every(c=>c.cells.length>=1&&c.cells.length<=3));
});

test('single required room is never isolated; tier requests support isolation without breaking vertical navigation',async()=>{
 const r=await createRecipe();r.generation.rooms.count=1;r.generation.layout.allowDisconnected=true;const p=await generateBase(r);assert.deepEqual(p.source.level.isolation.isolatedRoomIds,[]);assert.ok((await validateProject(p)).ok);
 const tier=await createRecipe('tiers');for(const l of tier.generation.layers)l.request.layout={allowDisconnected:true};assert.ok((await validateProject(await generateBase(tier))).ok);
});

test('same distribution group cannot overwrite other categories, kinds, layers or manual sources in any mode',async()=>{
 for(const mode of Object.keys(MODES)){
  let p=await smallProject(mode),scene=await contentScene(p),layer=scene.map.layers[0];
  const catalog=structuredClone(p.catalog);for(const c of catalog)c.constraints={requiresWalkable:true,requiresEmptyTile:true};p=await editProject(p,{type:'catalog',catalog});
  const native=hash(p.source),ids={objects:'portal',items:'chest',resources:'crystal',flora:'mushroom',fauna:'guard',events:'event'};
  for(const [category,catalogId]of Object.entries(ids))for(const kind of ['zone','spawner']){
   const s=createSource({id:'template',category,kind,layer,catalogId,seed:42}),req=createDistributionRequest(s);req.groupId='shared-group';req.placement.count=2;const before=structuredClone(p.sources),preview=await previewDistribution(p,req);assert.ok(preview.validation.ok,preview.validation.errors.join(' '));p=await applyDistribution(p,preview);assert.deepEqual(p.sources.filter(s=>before.some(b=>b.id===s.id)),before);
  }
  const selected=p.sources.find(s=>s.category==='items'&&s.kind==='zone');p=await editProject(p,{type:'source.put',source:{...selected,name:'Manual'}});const template=createSource({id:'template',category:'items',kind:'zone',layer,catalogId:'chest',seed:99}),request=createDistributionRequest(template);request.groupId='shared-group';const before=structuredClone(p.sources),preview=await previewDistribution(p,request);assert.equal(preview.delta.removeIds.length,0);p=await applyDistribution(p,preview);assert.deepEqual(p.sources,before);assert.equal(hash(p.source),native);
  for(const id of ['portal','lift','stairs'])assert.ok(p.catalog.find(c=>c.id===id&&c.category==='objects'&&c.properties.transport),mode+' '+id);
 }
});
