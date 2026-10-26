import test from 'node:test';
import assert from 'node:assert/strict';
import {createRecipe,generateBase,materialize,validateProject,editProject,exportRuntime,importProject} from '../app/index.mjs';
import {transportSettings} from '../engine/core/transport-settings.mjs';
import {reachableTiles} from '../engine/core/validation.mjs';
import {validateDungeon} from '../engine/api/serialization.mjs';
import {validateWorld,generateWorld} from '../engine/api/world.mjs';
import {findWorldPath} from '../engine/api/world-navigation.mjs';
import {fingerprint} from '../engine/api/identity.mjs';
import {requestToRecipe,recipeToRequest} from '../engine/api/request.mjs';
import {hash} from '../content/index.mjs';

async function recipe(mode='dungeon',kind='teleport',count=10){const r=await createRecipe(mode);r.seed=4147868664;const setup=g=>{g.rooms={...g.rooms,count};g.layout={...g.layout,preset:'branches',loopChance:0,allowDisconnected:true};g.search={...g.search,candidates:1};};if(mode==='dungeon'){setup(r.generation);r.generation.layout.transports={maxGroups:3,maxRoomsPerGroup:3,chance:1,travelCost:4};}else{for(const l of r.generation.layers)setup(l.request);r.generation.autoTransports={maxGroups:3,maxRoomsPerGroup:3,chance:1,travelCost:4,landingSize:1,types:{[kind]:1}};}return r;}
const physical=level=>{const seen=reachableTiles({...level,transportLinks:[]},{opened:new Set(level.plan.edges.map(e=>e.id))});return level.rooms.filter(r=>!seen.has(r.core.x+':'+r.core.y)).map(r=>r.id).sort();};

test('transport settings are strict and friendly/native request roundtrips preserve their units',async()=>{
 for(const bad of [null,[],{extra:1},{maxGroups:0},{maxGroups:5},{maxRoomsPerGroup:9},{chance:-1},{chance:2},{travelCost:NaN},{travelCost:0}])assert.throws(()=>transportSettings(bad));
 for(const bad of [{types:{}},{types:{lift:0}},{types:{lift:-1}},{types:{lift:null}},{types:{boat:1}},{landingSize:4}])assert.throws(()=>transportSettings(bad,true));
 const r=await recipe(),request={schema:'vland.request',schemaVersion:1,seed:r.seed,...r.generation},round=recipeToRequest(requestToRecipe(request));assert.deepEqual(round.layout.transports,r.generation.layout.transports);
 const invalid=await recipe('tiers','lift');invalid.generation.layers=invalid.generation.layers.slice(0,1);await assert.rejects(generateBase(invalid),e=>e.code==='INVALID_WORLD'&&e.message.includes('два яруса'));
});

test('multiple disjoint optional areas get deterministic protected teleports, while the physical main route remains intact',async()=>{
 const r=await recipe();r.seed=7;r.generation.rooms.count=20;r.generation.layout.transports.maxGroups=4;const p=await generateBase(r),again=await generateBase(r),level=p.source.level;assert.equal(p.checksum,again.checksum);assert.equal(level.transportLinks.length,4);assert.deepEqual(physical(level),[...level.isolation.isolatedRoomIds].sort());
 const main=reachableTiles({...level,transportLinks:[]});assert.ok(main.has(level.rooms.find(r=>r.id===level.plan.finalId).core.x+':'+level.rooms.find(r=>r.id===level.plan.finalId).core.y));assert.ok(level.connections.every(c=>c.cells.length>=1&&c.cells.length<=3));assert.ok(level.transportLinks.every(t=>t.kind==='teleport'&&t.bidirectional&&t.automatic&&t.travelCost===4));
 assert.ok((await validateProject(p)).transitions.reports.every(t=>t.ok));assert.deepEqual(p.sources,[]);assert.deepEqual(p.transitions,[]);assert.deepEqual(await importProject(p),p);const runtime=await exportRuntime(p);assert.equal(runtime.links.length,4);assert.equal(runtime.scene.map.fixtures.filter(f=>f.properties.automatic).length,8);
});

test('each selected automatic type really reaches optional rooms; stairs and lifts cross actual physical layers',async()=>{
 for(const kind of ['teleport','lift','stairs']){const p=await generateBase(await recipe('tiers',kind)),world=p.source,groups=world.automaticTransports.groups;assert.ok(groups.length);assert.ok(groups.every(g=>g.kind===kind));assert.equal(world.automaticTransports.counts[kind],groups.length);assert.ok(world.navigation.ok);assert.deepEqual(world.navigation.unreachableAutomaticLinks,[]);assert.ok((await validateProject(p)).ok);assert.deepEqual(await importProject(p),p);
  for(const l of world.layers){assert.deepEqual(physical(l.dungeon.level),[...l.dungeon.level.isolation.isolatedRoomIds].sort());assert.ok(l.dungeon.level.connections.every(c=>c.cells.length<=3));}
  for(const link of world.verticalLinks.filter(l=>l.automatic)){assert.notEqual(link.from.layerId,link.to.layerId);assert.equal(link.direction,'both');assert.equal(link.kind,kind);assert.equal(link.travelCost,4);const to={layerId:link.from.layerId,...link.from.anchor},out=findWorldPath(world,null,to),back=findWorldPath(world,to,world.spawn);assert.ok(out&&back);assert.ok(out.segments.some(s=>s.type==='vertical'&&s.linkId===link.id));}
  const runtime=await exportRuntime(p);assert.equal(runtime.links.filter(l=>l.automatic).length,groups.length);assert.deepEqual(runtime.initialState.entities,[]);
 }
});

test('a world proves external access instead of inventing a local stairs jump; altered or absent real landings are rejected',async()=>{
 const p=await generateBase(await recipe('tiers','stairs')),world=p.source,l=world.layers.find(l=>l.dungeon.level.externalTransports?.length);assert.ok(l);assert.equal(validateDungeon(l.dungeon).ok,false);assert.ok(validateWorld(world).ok);
 for(const corrupt of [w=>w.verticalLinks.splice(w.verticalLinks.findIndex(t=>t.automatic),1),w=>w.layers.find(l=>l.dungeon.level.externalTransports?.length).dungeon.level.externalTransports[0].worldLinkId='missing',w=>w.verticalLinks.find(t=>t.automatic).direction='forward',w=>w.verticalLinks.find(t=>t.automatic).from.anchor.x=0,w=>w.request.autoTransports.types.stairs=0]){const copy=structuredClone(world);corrupt(copy);copy.fingerprint=fingerprint({...copy,navigation:undefined,fingerprint:undefined});assert.equal(validateWorld(copy).ok,false);}
});

test('isolation stays opt-in, zero chance leaves physical passages, and necessary start/exit/boss rooms stay connected',async()=>{
 for(const mode of ['dungeon','tiers']){const r=await recipe(mode,'lift',1);if(mode==='dungeon')r.generation.layout.transports.chance=0;else r.generation.autoTransports.chance=0;const p=await generateBase(r),levels=mode==='dungeon'?[p.source.level]:p.source.layers.map(l=>l.dungeon.level);assert.ok((await validateProject(p)).ok);for(const l of levels){assert.equal(l.transportLinks.length,0);assert.equal(l.externalTransports?.length??0,0);assert.deepEqual(l.isolation.isolatedRoomIds,[]);assert.deepEqual(physical(l),[]);}}
 const r=await recipe();r.generation.layout.allowDisconnected=false;const p=await generateBase(r);assert.equal(p.source.level.transportLinks?.length??0,0);assert.deepEqual(physical(p.source.level),[]);
});

test('reserved automatic platforms resist blocking edits and changed water invalidates arrival before export',async()=>{
 const r=await recipe('tiers','lift');r.generation.autoTransports.landingSize=2;const p=await generateBase(r),link=p.source.verticalLinks.find(l=>l.automatic),target={layerId:link.from.layerId,...link.from.anchor};assert.ok(link);await assert.rejects(editProject(p,{type:'paint',...target,surface:'wall',trait:'normal'}));
 const stamp=hash(p.source),wet=await editProject(p,{type:'paint',layerId:target.layerId,x:target.x+1,y:target.y+1,surface:'water',trait:'normal'});assert.equal(hash(wet.source),stamp);const report=await validateProject(wet);assert.equal(report.transitions.ok,false);await assert.rejects(exportRuntime(wet),e=>e.code==='INVALID_MAP');assert.ok((await materialize(p)).find(l=>l.id===target.layerId).reserved[target.y*(await materialize(p)).find(l=>l.id===target.layerId).width+target.x]);
});

test('native world content cannot flood automatic arrival rooms or place enemies and mechanisms on transport endpoints',()=>{
 for(const seed of [0,7,4147868664]){
  const request={schema:'vland.world.request',schemaVersion:1,seed,autoTransports:{maxGroups:3,types:{stairs:1}},layers:['lower','upper'].map((id,i)=>({id,elevation:i*4,request:{schema:'vland.request',schemaVersion:1,rooms:{count:10},layout:{allowDisconnected:true,preset:'branches',loopChance:0},search:{candidates:1},content:{floodFrequency:1,timedFrequency:1}}}))},world=generateWorld(request);assert.ok(validateWorld(world).ok);assert.deepEqual(world.navigation.unreturnableAutomaticLinks,[]);
  for(const layer of world.layers)for(const t of layer.dungeon.level.externalTransports??[]){const group=layer.dungeon.level.isolation.groups.find(g=>g.edgeId===t.edgeId),inner=[t.from,t.to].find(p=>group.roomIds.includes(p.roomId));assert.ok(!layer.dungeon.content.setpieces.zones.some(z=>z.roomId===inner.roomId));assert.ok(!layer.dungeon.content.hints.some(h=>h.x===inner.x&&h.y===inner.y));}
 }
});

test('reordering JSON object properties does not change valid automatic transport settings or pair semantics',async()=>{
 const p=await generateBase(await recipe('tiers','lift')),reorder=v=>Array.isArray(v)?v.map(reorder):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,reorder(v[k])])):v,copy=reorder(p);assert.equal(copy.checksum,p.checksum);assert.ok((await validateProject(copy)).ok);assert.deepEqual(await importProject(copy),copy);
});
