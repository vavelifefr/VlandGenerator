import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createRecipe,generateBase,validateProject} from '../app/index.mjs';
import {reachableTiles} from '../engine/core/validation.mjs';
const rows=[];
for(const count of [1,10,30])for(let i=0;i<12;i++)for(const isolated of [false,true]){
 const seed=i===0?4147868664:(Math.imul(i+1,2654435761)^count)>>>0,r=await createRecipe();r.seed=seed;r.generation.rooms.count=count;r.generation.rooms.minArea=25;r.generation.rooms.maxArea=100;r.generation.layout.preset=['compact','branches','rings','sectors'][i%4];r.generation.layout.allowDisconnected=isolated;r.generation.search.candidates=1;
 const p=await generateBase(r),l=p.source.level,validation=await validateProject(p);assert.ok(validation.ok,validation.errors.join(' '));assert.ok(l.connections.every(c=>c.cells.length>=1&&c.cells.length<=3));
 const opened=new Set(l.plan.edges.map(e=>e.id)),seen=reachableTiles(l,{opened});assert.ok(l.rooms.every(r=>r.floorTiles.every(t=>seen.has(t.x+':'+t.y))));if(!isolated)assert.ok(!l.transportLinks?.length);
 const physical=reachableTiles({...l,transportLinks:[]},{opened}),unreachable=l.rooms.filter(r=>!physical.has(r.core.x+':'+r.core.y)).map(r=>r.id);assert.deepEqual([...unreachable].sort(),[...(l.isolation?.isolatedRoomIds??[])].sort());
 rows.push({seed,rooms:count,preset:r.generation.layout.preset,allowDisconnected:isolated,physicalComponents:unreachable.length?2:1,isolatedRoomIds:unreachable,transports:l.transportLinks?.length??0,maxPassage:Math.max(...l.connections.map(c=>c.cells.length)),valid:true});
}
const result={ok:true,maps:rows.length,intentionallyIsolatedMaps:rows.filter(r=>r.transports).length,rows};await writeFile(new URL('../evidence/connection-stress.json',import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,rows:undefined}));
