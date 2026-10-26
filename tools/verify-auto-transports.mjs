import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createRecipe,generateBase,validateProject,exportRuntime} from '../app/index.mjs';
import {reachableTiles} from '../engine/core/validation.mjs';
const rows=[];
for(const count of [1,10,30])for(const kind of ['dungeon','teleport','lift','stairs','mixed'])for(const seed of [0,7,42,4147868664,4294967295]){
 const mode=kind==='dungeon'?'dungeon':'tiers',recipe=await createRecipe(mode);recipe.seed=seed;const settings={maxGroups:4,maxRoomsPerGroup:3,chance:1,travelCost:3};
 const set=g=>{g.rooms={...g.rooms,count};g.layout={...g.layout,preset:'branches',loopChance:0,allowDisconnected:true};g.search={candidates:1};};
 if(mode==='dungeon'){set(recipe.generation);recipe.generation.layout.transports=settings;}else{for(const l of recipe.generation.layers)set(l.request);recipe.generation.autoTransports={...settings,landingSize:1,types:kind==='mixed'?{teleport:1,lift:1,stairs:1}:{[kind]:1}};}
 let project;try{project=await generateBase(recipe);}catch(e){throw new Error(JSON.stringify({mode,kind,count,seed,error:e.message}),{cause:e});}const report=await validateProject(project);assert.ok(report.ok,JSON.stringify({mode,kind,count,seed,errors:report.errors}));assert.ok(report.transitions.reports.every(t=>t.ok));
 const levels=mode==='dungeon'?[project.source.level]:project.source.layers.map(l=>l.dungeon.level);let rooms=0;
 for(const level of levels){const physical=reachableTiles({...level,transportLinks:[]},{opened:new Set(level.plan.edges.map(e=>e.id))}),isolated=level.rooms.filter(r=>!physical.has(r.core.x+':'+r.core.y)).map(r=>r.id);assert.deepEqual(isolated.sort(),[...level.isolation.isolatedRoomIds].sort());assert.ok(level.connections.every(c=>c.cells.length>=1&&c.cells.length<=3));assert.ok(level.isolation.groups.length<=4);rooms+=isolated.length;}
 const runtime=await exportRuntime(project),automatic=runtime.links.filter(t=>t.automatic);assert.ok(automatic.every(t=>(t.bidirectional??(t.direction==='both'))&&t.travelCost===3));if(kind!=='mixed'&&mode==='tiers')assert.ok(automatic.every(t=>t.kind===kind));
 rows.push({mode,kind,count,seed,isolatedRooms:rooms,links:automatic.length,types:[...new Set(automatic.map(t=>t.kind))],valid:true});
 if(seed===4147868664&&count===10){await writeFile(new URL('../evidence/auto-transports-'+kind+'-project.json',import.meta.url),JSON.stringify(project));await writeFile(new URL('../evidence/auto-transports-'+kind+'-runtime.json',import.meta.url),JSON.stringify(runtime));}
}
const result={ok:true,maps:rows.length,isolatedMaps:rows.filter(r=>r.links).length,automaticLinks:rows.reduce((n,r)=>n+r.links,0),maxConnector:3,rows};await writeFile(new URL('../evidence/auto-transports-stress.json',import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,rows:undefined}));
