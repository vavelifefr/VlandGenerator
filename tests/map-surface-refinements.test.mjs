import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {generateSettlement,normalizeSettlement} from '../engine/api/settlements.mjs';
import {createRecipe,generateBase,materialize,exportRuntime} from '../app/index.mjs';
import {applyLandscapeRegions} from '../engine/core/landscape-regions.mjs';
import {cellColor} from '../app/raster.mjs';
import {terrainLegendEntries} from '../app/display-colors.mjs';
import {FIELDS} from '../Web/HTML/ui/controls.mjs';

test('reported wet towns never turn whole banks or thin river-side faces into gravel squares',()=>{
 for(const seed of [4163501467,2542161317,2098411840,3377461464]){
  const m=generateSettlement({width:160,height:160,seed,streetWidth:1,terrain:{water:.5,relief:.5}}),f=m.atlas.layers[0].fields;
  for(const face of m.planning.unassigned)assert.ok(face.cells.every(i=>f.biome[i]!=='square'&&f.biome[i]!=='park'),'Unplanned land is not an urban public space: '+seed);
  assert.ok(f.biome.filter(v=>v==='square').length<=160*160*.015,'Small plaza budget');
  for(const face of m.neighborhoods.filter(v=>v.cells.some(i=>f.biome[i]==='square'))){
   assert.ok(Math.min(face.bounds.width,face.bounds.height)>=4,'No one-cell beige river banks');
   assert.ok(Math.max(face.bounds.width,face.bounds.height)/Math.min(face.bounds.width,face.bounds.height)<=2.5,'Compact plaza');
  }
 }
});

test('the reported high-water valley lets its lake meet the river instead of preserving two parallel dry rails',()=>{
 const m=generateSettlement({width:160,height:160,seed:4163501467,streetWidth:1,terrain:{water:.5,relief:.5}}),f=m.atlas.layers[0].fields;
 const confluence=f.waterType.flatMap((v,i)=>v==='river'?[i]:[]).filter(i=>[i-160,i+160,i-1,i+1].some(j=>f.waterType[j]==='lake'));
 assert.ok(confluence.length>=50,'A lake filling half this valley must reach the river rather than stop at a mandatory constant-width buffer');
 assert.equal(f.waterType.filter(v=>v!=='none').length,12800,'The same water budget is retained');
});

test('city percentage controls the extent of actual streets while keeping districts and natural outskirts',async()=>{
 const cities=[25,60,100].map(cityPercent=>generateSettlement({width:80,height:64,seed:42,cityPercent,terrain:{water:0,relief:0}}));
 const area=m=>{const cells=m.atlas.layers[0].fields.road.flatMap((v,i)=>v?[i]:[]),xs=cells.map(i=>i%80),ys=cells.map(i=>Math.floor(i/80));return (Math.max(...xs)-Math.min(...xs)+1)*(Math.max(...ys)-Math.min(...ys)+1);};
 assert.ok(area(cities[0])<area(cities[1])*.7);assert.ok(area(cities[1])<area(cities[2])*.8);
 for(const m of cities){assert.ok(m.neighborhoods.length>=4&&m.quarters.length>=1);assert.equal(m.parcels.length,0);}
 assert.equal(normalizeSettlement({}).cityPercent,60);
 for(const cityPercent of [0,4,101,NaN,25.5])assert.throws(()=>normalizeSettlement({cityPercent}));
 assert.equal(FIELDS.settlements.flatMap(([,f])=>f).find(f=>f.path==='cityPercent').max,100);
 const schema=JSON.parse(await readFile(new URL('../schemas/generation-settlements.schema.json',import.meta.url),'utf8'));
 assert.deepEqual([schema.properties.cityPercent.minimum,schema.properties.cityPercent.maximum],[5,100]);
});

test('gravel is a quota-controlled additional biome on both landscape grids and survives runtime export',async()=>{
 for(const mode of ['landscape','hexlandscape']){
  const r=await createRecipe(mode);Object.assign(r.generation,{width:40,height:40,layers:{above:0,underground:0}});
  r.generation.landscape={structure:'coast',baseBiome:'meadow',biomes:[{id:'gravel-area',type:'gravel',percent:25}],landPercent:75,uniformity:50,coastErosion:50};
  const p=await generateBase(r),f=p.source.layers[0].fields,labels=applyLandscapeRegions(structuredClone(f),p.source.request),dry=f.waterType.filter(v=>v==='none').length;
  assert.ok(Math.abs(labels.filter((v,i)=>v==='gravel'&&f.waterType[i]==='none').length-dry*.25)<=1,'Exact dry quota');
  const l=(await materialize(p))[0],i=l.biome.indexOf('gravel');assert.ok(i>=0);assert.equal(l.material[i],'gravel');
  const legend=terrainLegendEntries(l).find(e=>e.id==='gravel');assert.equal(legend.name,'Гравий');
  assert.deepEqual(cellColor(l,i),[1,3,5].map(n=>parseInt(legend.color.slice(n,n+2),16)));
  assert.equal((await exportRuntime(p)).scene.map.layers[0].biome[i],'gravel');
 }
});

test('height colors reveal upper mountain relief with a monotone shared display curve',()=>{
 const l={material:['gravel','gravel','gravel'],biome:['alpine','alpine','alpine'],solid:[0,0,0],elevation:[.7,.8,.9]};
 const c=l.elevation.map((_,i)=>cellColor(l,i,'elevation')[0]);
 assert.ok(c[0]<c[1]&&c[1]<c[2]);assert.ok(c[2]-c[0]>=65,'Upper terrain must have more than the old 44 gray levels');
 assert.deepEqual(l.elevation,[.7,.8,.9],'Display does not modify actual heights');
});
