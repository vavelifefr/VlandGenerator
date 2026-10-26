import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {atlasSizeBudget} from '../app/generation-budget.mjs';
import {gridNeighbors} from '../engine/core/topology.mjs';
test('atlas size budget counts every physical layer and explains invalid 256 square settings before work starts',()=>{
 const invalid=atlasSizeBudget('landscape',{width:256,height:256,layers:{above:1,underground:2}});
 assert.equal(invalid.cells,262144);assert.equal(invalid.maxCells,98304);assert.equal(invalid.ok,false);assert.match(invalid.message,/262144/);assert.equal(invalid.maxLayers,1);
 assert.equal(atlasSizeBudget('landscape',{width:256,height:256,layers:{above:0,underground:0}}).ok,true);
 assert.equal(atlasSizeBudget('caves',{width:256,height:256,layers:{above:0,underground:1}}).ok,false);
 assert.equal(atlasSizeBudget('caves',{width:128,height:128,layers:{above:0,underground:2}}).ok,true);
 assert.equal(atlasSizeBudget('dungeon',{}),null);
});
test('square and odd-r neighbor order stays identical at every edge',()=>{
 for(const kind of ['square','hex'])for(let i=0;i<35;i++){const x=i%7,y=Math.floor(i/7),dirs=kind==='hex'?(y%2?[[1,0],[-1,0],[0,-1],[1,-1],[0,1],[1,1]]:[[1,0],[-1,0],[-1,-1],[0,-1],[-1,1],[0,1]]):[[0,-1],[1,0],[0,1],[-1,0]];
 assert.deepEqual(gridNeighbors(i,7,5,{kind}),dirs.flatMap(([dx,dy])=>x+dx>=0&&x+dx<7&&y+dy>=0&&y+dy<5?[(y+dy)*7+x+dx]:[]));}
});
test('256 square profile generation finishes inside worker budget with deterministic project checksum',()=>{
 const result=spawnSync(process.execPath,['--input-type=module','-e',`const {createRecipe,generateBase}=await import(${JSON.stringify(new URL('../app/index.mjs',import.meta.url).href)});const r=await createRecipe('landscape');Object.assign(r.generation,{width:256,height:256,layers:{above:0,underground:0}});const p=await generateBase(r),again=await generateBase(r);console.log(JSON.stringify({deterministic:p.checksum===again.checksum,ok:p.source.navigation.ok&&again.source.navigation.ok,access:p.source.access.ok&&again.source.access.ok}));`],{cwd:new URL('../',import.meta.url),timeout:Number(process.env.VLAND_LARGE_TEST_MS??45000),encoding:'utf8',maxBuffer:4096});
 // Reviewed default meadow uses one core identity rather than climate variants.
 // Native profile-free generation retains its separate exact checksum below.
 assert.ifError(result.error);assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(result.stdout),{deterministic:true,ok:true,access:true});
});

test('profile-free 256 square generation preserves the pre-optimization checksum',()=>{
 const result=spawnSync(process.execPath,['--input-type=module','-e',`const {createRecipe,generateBase}=await import(${JSON.stringify(new URL('../app/index.mjs',import.meta.url).href)});const {defaults}=await import(${JSON.stringify(new URL('../app/modes/natural.mjs',import.meta.url).href)});const r=await createRecipe('landscape');r.generation=structuredClone(defaults);for(const key of ['resources','ecology','structures','events'])delete r.generation[key];Object.assign(r.generation,{width:256,height:256,layers:{above:0,underground:0}});const p=await generateBase(r);console.log(JSON.stringify({checksum:p.checksum,ok:p.source.navigation.ok,access:p.source.access.ok}));`],{cwd:new URL('../',import.meta.url),timeout:Number(process.env.VLAND_LARGE_TEST_MS??45000),encoding:'utf8',maxBuffer:4096});
 assert.ifError(result.error);assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(result.stdout),{checksum:'e2f4d469',ok:true,access:true});
});
