import test from 'node:test';
import assert from 'node:assert/strict';
import {generateSettlement,normalizeSettlement,validateSettlement} from '../engine/api/settlements.mjs';
import {fingerprint} from '../engine/api/identity.mjs';
import {createRecipe,generateBase,exportRuntime,materialize} from '../app/index.mjs';
const limits={neighborhoods:{minArea:16,maxArea:80},quarters:{minArea:80,maxArea:320}};
const connected=(cells,width)=>{const left=new Set(cells),queue=[cells[0]];left.delete(cells[0]);for(let q=0;q<queue.length;q++){const i=queue[q];for(const j of [i-width,i+width,...(i%width?[i-1]:[]),...(i%width<width-1?[i+1]:[])])if(left.delete(j))queue.push(j);}return left.size===0;};
test('neighborhoods fill land between streets and adjacent neighborhoods form bounded quarters',()=>{
 const city=generateSettlement({width:64,height:56,seed:71,terrain:{water:0,relief:0},...limits}),f=city.atlas.layers[0].fields,used=new Set();
 assert.ok(city.neighborhoods?.length>3);assert.ok(city.quarters?.length>0);
 for(const n of city.neighborhoods){assert.equal(n.area,n.cells.length);assert.ok(n.area>=16&&n.area<=80);assert.ok(connected(n.cells,64));for(const i of n.cells){assert.ok(!used.has(i));used.add(i);assert.equal(f.road[i],'');assert.equal(f.waterType[i],'none');}}
 for(const q of city.quarters){assert.ok(q.neighborhoodIds.length>=2);assert.equal(q.area,q.neighborhoodIds.reduce((s,id)=>s+city.neighborhoods.find(n=>n.id===id).area,0));assert.ok(q.area>=80&&q.area<=320);}
 assert.ok(validateSettlement(city).ok);assert.equal(city.fingerprint,generateSettlement({width:64,height:56,seed:71,terrain:{water:0,relief:0},...limits}).fingerprint);
});
test('area ranges are strict, partial options normalize and impossible geography reports unmet targets',()=>{
 assert.equal(normalizeSettlement({neighborhoods:{maxArea:100}}).neighborhoods.maxArea,100);
 for(const value of [{neighborhoods:{minArea:81,maxArea:80}},{quarters:{minArea:321,maxArea:320}},{neighborhoods:{minArea:0}},{quarters:{maxArea:50},neighborhoods:{minArea:30}},{quarters:{unknown:1}}])assert.throws(()=>normalizeSettlement(value));
 const city=generateSettlement({width:32,height:32,neighborhoods:{minArea:500,maxArea:600},quarters:{minArea:1000,maxArea:2000}});
 assert.equal(city.neighborhoods.length,0);assert.ok(city.planning.unassigned.length>0);assert.ok(city.planning.unassigned.every(r=>r.reason==='below-minimum'||r.reason==='above-maximum'));
});
test('region membership and quarter area cannot be forged by resealing the snapshot',()=>{
 const city=generateSettlement({width:64,height:56,seed:71,terrain:{water:0,relief:0},...limits});
 for(const mutate of [c=>c.neighborhoods[0].area++,c=>c.neighborhoods[0].cells.push(c.streets[0].from.y*64+c.streets[0].from.x),c=>c.quarters[0].area++,c=>c.quarters[0].neighborhoodIds=['missing','missing']]){const c=structuredClone(city);mutate(c);c.fingerprint=fingerprint({...c,fingerprint:undefined});assert.equal(validateSettlement(c).ok,false);}
});
test('settlement neighborhood and quarter metadata survive materialization and runtime export',async()=>{
 const r=await createRecipe('settlements');Object.assign(r.generation,{width:48,height:40,...limits});const p=await generateBase(r),layers=await materialize(p),out=await exportRuntime(p);
 for(const key of ['neighborhoods','quarters','planning']){assert.deepEqual(layers[0][key],p.source[key]);assert.deepEqual(out.navigation[0][key],p.source[key]);}
});
