import test from 'node:test';
import assert from 'node:assert/strict';
import {generateSettlement,normalizeSettlement,validateSettlement} from '../engine/api/settlements.mjs';
import {createRecipe,generateBase,materialize,exportRuntime} from '../app/index.mjs';
import {cellColor} from '../app/raster.mjs';
import {terrainLegendEntries} from '../app/display-colors.mjs';
import {FIELDS} from '../Web/HTML/ui/controls.mjs';
import {readFile} from 'node:fs/promises';

test('town is an open street plan with a river, bridges, lake, squares and parks, without houses',()=>{
 const city=generateSettlement({seed:42}),f=city.atlas.layers[0].fields;
 assert.equal(city.parcels.length,0,'No building parcels even with the former default density');
 for(const biome of ['river','lake','square','park'])assert.ok(f.biome.filter(v=>v===biome).length>=12,'Visible '+biome);
 assert.ok(f.road.includes('bridge'),'Actual river crossing');
 assert.ok(f.structure.every(v=>!v),'No buildings or structure content');
 assert.ok(city.neighborhoods.length>=4&&city.quarters.length>=1,'Actual districts');
 assert.ok(validateSettlement(city).ok);
});
test('village has roads and bridges among forests and meadows, without urban spaces or houses',()=>{
 const village=generateSettlement({type:'village',seed:42,buildingDensity:1}),f=village.atlas.layers[0].fields;
 assert.equal(village.parcels.length,0);
 assert.ok(!f.biome.includes('square')&&!f.biome.includes('park'));
 assert.ok(f.waterType.includes('river')&&f.road.includes('bridge'));
 const dry=f.waterType.flatMap((v,i)=>v==='none'&&!f.road[i]?[i]:[]);
 assert.ok(dry.filter(i=>f.biome[i]==='forest').length/dry.length>=.35,'Substantial forest biome');
 assert.ok(dry.filter(i=>f.biome[i]==='plains').length/dry.length>=.2,'Substantial meadows');
 assert.ok(village.neighborhoods.length>=4&&village.quarters.length>=1);
 const town=generateSettlement({seed:42});
 assert.ok(f.road.filter(Boolean).length<town.atlas.layers[0].fields.road.filter(Boolean).length,'Simpler village roads');
 assert.ok(validateSettlement(village).ok);
});
test('dry maps and all street families retain valid districts and deterministic open geometry',()=>{
 for(const type of ['town','village'])for(const pattern of ['organic','grid','radial','ribbon']){
  const options={type,pattern,width:32,height:40,seed:71,terrain:{water:0,relief:0}},m=generateSettlement(options);
  assert.equal(m.parcels.length,0);assert.ok(m.atlas.layers[0].fields.waterType.every(v=>v==='none'));
  assert.ok(validateSettlement(m).ok);assert.equal(m.fingerprint,generateSettlement(options).fingerprint);
 }
});
test('town public spaces use shared raster/legend colors and survive scene/runtime export',async()=>{
 const r=await createRecipe('settlements'),p=await generateBase(r),l=(await materialize(p))[0],runtime=await exportRuntime(p);
 for(const biome of ['square','park']){
  const i=l.biome.indexOf(biome);assert.ok(i>=0);
  const entry=terrainLegendEntries(l).find(e=>e.id===biome);assert.ok(entry,'Named legend '+biome);
  assert.deepEqual(cellColor(l,i),[1,3,5].map(n=>parseInt(entry.color.slice(n,n+2),16)));
  assert.equal(runtime.scene.map.layers[0].biome[i],biome);
 }
 assert.deepEqual(runtime.navigation[0].parcels,[]);
 assert.deepEqual(runtime.navigation[0].neighborhoods,p.source.neighborhoods);
});
test('water control still changes the actual water coverage in town and village',()=>{
 for(const type of ['town','village'])for(const water of [.12,.35]){
  const m=generateSettlement({type,terrain:{water,relief:.2}}),f=m.atlas.layers[0].fields,actual=f.waterType.filter(v=>v!=='none').length/f.waterType.length;
  assert.ok(Math.abs(actual-water)<.02,type+' water '+water+' became '+actual);
 }
});
test('organic village keeps wooded outskirts free from a repeated comb of subdivision roads',()=>{
 const m=generateSettlement({type:'village',seed:42}),f=m.atlas.layers[0].fields,fringe=[];
 for(let y=1;y<63;y++)for(let x=1;x<79;x++)if(x<12||x>=68||y<10||y>=54)fringe.push(y*80+x);
 assert.ok(fringe.filter(i=>f.road[i]).length/fringe.length<.08,'Outskirts should keep forest/meadow instead of parallel subdivision strips');
 assert.ok(m.neighborhoods.length>=4&&m.quarters.length>=1,'The settlement itself still has actual districts');
});
test('160-cell town at the reported seed avoids repeated long narrow district strips',()=>{
 const m=generateSettlement({type:'town',width:160,height:160,seed:3915985362,buildingDensity:.55}),total=m.neighborhoods.reduce((s,n)=>s+n.area,0),strips=m.neighborhoods.filter(n=>Math.max(n.bounds.width,n.bounds.height)/Math.min(n.bounds.width,n.bounds.height)>=5&&Math.min(n.bounds.width,n.bounds.height)<=4),area=strips.reduce((s,n)=>s+n.area,0);
 assert.ok(total>0);assert.ok(area/total<.05,'Thin strips occupy '+(area/total*100).toFixed(1)+'% of districts ('+strips.length+' strips)');
 assert.ok(validateSettlement(m).ok);assert.deepEqual(m.parcels,[]);
});
test('town and village accept 300 by 300 consistently in UI, API and schemas and reject 301',async()=>{
 for(const type of ['town','village']){const r=normalizeSettlement({type,width:300,height:300});assert.equal(r.width,300);assert.equal(r.height,300);assert.throws(()=>normalizeSettlement({type,width:301,height:300}));assert.throws(()=>normalizeSettlement({type,width:300,height:301}));}
 for(const field of ['width','height'])assert.equal(FIELDS.settlements.flatMap(([,fields])=>fields).find(f=>f.path===field).max,300);
 for(const file of ['../schemas/generation-settlements.schema.json','../engine/schemas/settlement.schema.json']){
  const s=JSON.parse(await readFile(new URL(file,import.meta.url),'utf8')),properties=s.properties.request?.properties??s.properties;
  assert.equal(properties.width.maximum,300);assert.equal(properties.height.maximum,300);
 }
});
