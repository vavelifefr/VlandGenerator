import {MODES} from '../app/contracts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {smallProject} from './helpers.mjs';
import {materialize,contentScene,editProject,validateProject,exportRuntime,importProject,resolveTransition,previewDistribution,applyDistribution} from '../app/index.mjs';
import {createSource,analyzeSource,createSpawnState,planSpawns,commitSpawnPlan,updateSpawnState,hash,createDistributionRequest} from '../content/index.mjs';

async function candidates(p,l,catalogId){const scene=await contentScene(p),s=createSource({id:'search',category:'objects',layer:l,catalogId}),mask=analyzeSource({...scene,sources:[...scene.sources,s]},s.id).eligibleMask;return mask.runs.flatMap(([y,x,n])=>Array.from({length:n},(_,i)=>({x:x+i,y})));}
async function pair(mode,kind='teleport'){
 let p=await smallProject(mode),layers=await materialize(p),a=mode==='caves'?layers.find(l=>l.kind==='underground'):layers[0],b=layers.find(l=>l.id!==a.id)??a,catalogId=kind==='teleport'?'portal':kind;
 const near=(points,p)=>points.sort((a,b)=>Math.abs(a.x-p.x)+Math.abs(a.y-p.y)-Math.abs(b.x-p.x)-Math.abs(b.y-p.y))[0];let from,to;
 if(mode==='sideview'){const h=p.source.request.physics.height;from={x:a.spawn.x,y:a.spawn.y+h-1};to={x:b.exit.x,y:b.exit.y+h-1};}else{from=near(await candidates(p,a,catalogId),a.spawn);to=near((await candidates(p,b,catalogId)).filter(t=>a.id!==b.id||t.x!==from.x||t.y!==from.y),b.exit);}
 const s=createSource({id:'point-a',name:'Первая точка',kind:'spawner',category:'objects',layer:a,catalogId,...from});s.limits={maxAlive:1,batchSize:1,total:1,populationId:null};p=await editProject(p,{type:'source.put',source:s});return{p,a,b,from,to,s};
}

test('all registered modes and three transport types bind exact source points, preserve geometry and roundtrip through runtime',async()=>{
 for(const mode of Object.keys(MODES))for(const kind of ['teleport','lift','stairs']){
  const {p,b,to}=await pair(mode,kind),before=hash(p.source),linked=await editProject(p,{type:'transport.connect',fromSourceId:'point-a',target:{layerId:b.id,...to}});assert.equal(linked.transitions.length,1);assert.equal(linked.sources.length,2);assert.ok(linked.sources.every(s=>s.origin.kind==='manual'));assert.equal(hash(linked.source),before);assert.ok((await validateProject(linked)).transitions.ok);assert.deepEqual(await importProject(linked),linked);
  const runtime=await exportRuntime(linked),link=runtime.links.find(t=>t.origin==='editor');assert.equal(link.kind,kind);assert.equal(link.to.layerId,b.id);assert.deepEqual(runtime.initialState.entities,[]);
  const scene=runtime.scene,plan=planSpawns(scene,runtime.initialState),one=commitSpawnPlan(scene,runtime.initialState,plan,{acceptedIds:[plan.commands[0].id]});assert.equal(resolveTransition(runtime,one,link.id,link.fromSourceId).code,'NOT_READY');
  let live=commitSpawnPlan(scene,runtime.initialState,plan);assert.equal(live.entities.length,2);assert.ok(resolveTransition(runtime,live,link.id,link.fromSourceId).ok);live=updateSpawnState(scene,live,{disabledSourceIds:[link.toSourceId]});assert.equal(resolveTransition(runtime,live,link.id,link.fromSourceId).code,'NOT_READY');
 }
});

test('invalid kind, same point, conditional source, occupied target and malformed transport data are rejected atomically',async()=>{
 const {p,a,b,to,s}=await pair('dungeon'),stamp=hash(p);await assert.rejects(editProject(p,{type:'transport.connect',fromSourceId:s.id,target:{layerId:a.id,...s.area}}));await assert.rejects(editProject(p,{type:'transport.connect',fromSourceId:s.id,target:{layerId:'missing',...to}}));
 const lift=createSource({id:'lift',kind:'spawner',category:'objects',layer:b,catalogId:'lift',...to}),mixed=await editProject(p,{type:'source.put',source:lift});await assert.rejects(editProject(mixed,{type:'transport.connect',fromSourceId:s.id,toSourceId:lift.id}),e=>e.code==='INVALID_TRANSITION');
 const conditional=await editProject(p,{type:'source.put',source:{...s,schedule:{...s.schedule,trigger:'enter'}}});await assert.rejects(editProject(conditional,{type:'transport.connect',fromSourceId:s.id,target:{layerId:b.id,...to}}),e=>e.code==='INVALID_TRANSITION');
 for(const value of [false,null,'x',-1,Infinity])await assert.rejects(editProject(p,{type:'transport.connect',fromSourceId:s.id,target:{layerId:b.id,...to},travelCost:value}));for(const value of [null,0,'false'])await assert.rejects(editProject(p,{type:'transport.connect',fromSourceId:s.id,target:{layerId:b.id,...to},bidirectional:value}));assert.equal(hash(p),stamp);
});

test('rebind preserves the old counterpart; destination in another pair is protected; source deletion removes only its link',async()=>{
 const {p,b,to,s}=await pair('tiers');let linked=await editProject(p,{type:'transport.connect',fromSourceId:s.id,target:{layerId:b.id,...to}}),old=structuredClone(linked.sources.find(x=>x.id!==s.id));
 const list=(await candidates(linked,b,'portal')).filter(p=>Math.abs(p.x-to.x)+Math.abs(p.y-to.y)>2),other=list[0],third=createSource({id:'third',kind:'spawner',category:'objects',layer:b,catalogId:'portal',...other});linked=await editProject(linked,{type:'source.put',source:third});linked=await editProject(linked,{type:'transport.connect',fromSourceId:s.id,toSourceId:third.id,travelCost:3});assert.equal(linked.transitions[0].toSourceId,third.id);assert.deepEqual(linked.sources.find(s=>s.id===old.id),old);
 await assert.rejects(editProject(linked,{type:'transport.connect',fromSourceId:old.id,toSourceId:third.id}),e=>e.code==='TRANSITION_IN_USE');const removed=await editProject(linked,{type:'source.remove',sourceId:third.id});assert.deepEqual(removed.transitions,[]);assert.ok(removed.sources.some(s=>s.id===old.id));
 const unlinked=await editProject(linked,{type:'transport.disconnect',linkId:linked.transitions[0].id});assert.deepEqual(unlinked.sources,linked.sources);assert.deepEqual(unlinked.source,linked.source);
});

test('a one-way hop into an isolated pocket is rejected; a bidirectional link proves access and return',async()=>{
 let {p,a,s}=await pair('dungeon');let spot=null;for(let y=3;y<a.height-3&&!spot;y++)for(let x=3;x<a.width-3&&!spot;x++){let ok=true;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)if(!a.solid[(y+dy)*a.width+x+dx]||a.reserved[(y+dy)*a.width+x+dx])ok=false;if(ok)spot={x,y};}assert.ok(spot);
 for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)p=await editProject(p,{type:'paint',layerId:a.id,x:spot.x+dx,y:spot.y+dy,surface:'floor',trait:'normal'});
 const target={layerId:a.id,...spot},stamp=hash(p);await assert.rejects(editProject(p,{type:'transport.connect',fromSourceId:s.id,target,bidirectional:false}),e=>e.code==='UNREACHABLE_TRANSITION'&&e.details.some(m=>m.includes('возврата')));assert.equal(hash(p),stamp);
 const linked=await editProject(p,{type:'transport.connect',fromSourceId:s.id,target});assert.ok((await validateProject(linked)).ok);await assert.rejects(editProject(linked,{type:'paint',...target,surface:'wall',trait:'normal'}),e=>e.code==='PROTECTED_ROUTE');
 const wet=await editProject(linked,{type:'paint',...target,surface:'sea',trait:'normal'});assert.equal((await validateProject(wet)).transitions.ok,false);await assert.rejects(exportRuntime(wet),e=>e.code==='INVALID_MAP');
});

test('bound automatic points survive redistribution; unreachable live destination is never inferred from proposals',async()=>{
 const {p,a}=await pair('dungeon');let linked=await editProject(p,{type:'transport.connect',fromSourceId:'point-a',target:{layerId:a.id,...(await candidates(p,a,'portal')).find(t=>t.x!==p.sources[0].area.x&&t.y!==p.sources[0].area.y)}});
 const keep=structuredClone(linked.sources),request=createDistributionRequest(createSource({id:'template',kind:'spawner',category:'objects',layer:a,catalogId:'portal'}));request.placement.count=2;linked=await applyDistribution(linked,await previewDistribution(linked,request));for(const s of keep)assert.deepEqual(linked.sources.find(t=>t.id===s.id),s);assert.equal(linked.transitions.length,1);
 const runtime=await exportRuntime(linked);assert.equal(resolveTransition(runtime,runtime.initialState,linked.transitions[0].id,'point-a').ok,false);
});
