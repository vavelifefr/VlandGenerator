import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveBiomes} from '../engine/core/atlas-biomes.mjs';
import {createRecipe,generateBase,materialize,exportRuntime} from '../app/index.mjs';
import {cellColor} from '../app/raster.mjs';
import {terrainLegendEntries} from '../app/display-colors.mjs';
import {normalizeAtlasRequest} from '../engine/api/atlas-catalog.mjs';
import {surfaceFields} from '../engine/core/atlas-landforms.mjs';
import {gridNeighbors} from '../engine/core/topology.mjs';
import {readFile} from 'node:fs/promises';

test('the published display palette accepts the newly generated surface biomes',async()=>{
 const s=JSON.parse(await readFile(new URL('../schemas/display-palette.schema.json',import.meta.url),'utf8'));
 for(const id of ['square','park','gravel','shallow-water'])assert.equal(s.properties.biome.properties[id]?.type,'string',id+' palette schema');
});

for(const kind of ['square','hex'])test(kind+' shallows follow real depth near shores and offshore banks, without creating land or filling deep water',()=>{
 const width=20,height=20,n=width*height,r={width,height,topology:{kind},landscape:{baseBiome:'meadow'},biomes:{coastWidth:0,transitionWidth:0,foothillWidth:0},hydrology:{floodplainWidth:0}},f={waterType:Array(n).fill('sea'),waterDepth:Array(n).fill(.2),elevation:Array(n).fill(.2),biome:Array(n).fill('ocean'),material:Array(n).fill('water'),slope:Array(n).fill(.01),humidity:Array(n).fill(.5),temperature:Array(n).fill(.6)};
 for(let x=3;x<=7;x++){f.waterType[x]='none';f.waterDepth[x]=0;f.elevation[x]=.6;f.biome[x]='plains';f.material[x]='grass';}
 const shore=width+5,deep=width+6,bank=17*width+17;f.waterDepth[shore]=.1;f.waterDepth[bank]=.05;
 const before=structuredClone(f);deriveBiomes(f,r);
 assert.equal(f.biome[shore],'shallow-water');assert.equal(f.biome[bank],'shallow-water','A raised seabed does not need a nearby dry coast');
 assert.equal(f.biome[deep],'ocean','A steep deep coast stays deep');
 assert.deepEqual(f.waterType,before.waterType);assert.deepEqual(f.waterDepth,before.waterDepth);assert.deepEqual(f.elevation,before.elevation);
 assert.equal(f.material[shore],'water');assert.equal(f.material[bank],'water');
});

for(const mode of ['landscape','hexlandscape'])test(mode+' automatic water biome survives shared colors, scene and runtime, with the same75percent geological land mask',async()=>{
 const r=await createRecipe(mode);Object.assign(r.generation,{width:64,height:64});r.generation.landscape={...r.generation.landscape,structure:'islands',landPercent:75,biomes:[{id:'gravel-area',type:'gravel',percent:25}]};
 const p=await generateBase(r),f=p.source.layers[0].fields,layer=(await materialize(p))[0],runtime=await exportRuntime(p),shallow=layer.biome.flatMap((v,i)=>v==='shallow-water'?[i]:[]);
 assert.ok(shallow.length>10&&f.biome.includes('ocean'),'Both shallows and deeper sea remain visible');
 assert.equal(f.waterType.filter(v=>v!=='sea').length,3072,'Geological land includes inland fresh water');
 assert.ok(shallow.every(i=>f.waterType[i]==='sea'&&f.waterDepth[i]>0));
 const entry=terrainLegendEntries(layer).find(e=>e.id==='shallow-water');assert.equal(entry.name,'Мелководье');
 assert.deepEqual(cellColor(layer,shallow[0]),[1,3,5].map(n=>parseInt(entry.color.slice(n,n+2),16)));
 assert.equal(runtime.scene.map.layers[0].biome[shallow[0]],'shallow-water');assert.equal(runtime.scene.map.layers[0].water[shallow[0]],'sea');
 assert.deepEqual((await generateBase(r)).source,p.source);
});

test('100 and300 square/hex island surfaces preserve three separate75percent land masses with a depth-derived shallow sea',()=>{
 for(const kind of ['square','hex'])for(const size of [100,300]){
  const r=normalizeAtlasRequest({schema:'vland.atlas.request',schemaVersion:1,width:size,height:size,layers:{above:0,underground:0},seed:42,topology:{kind},landscape:{structure:'islands',baseBiome:'meadow',landPercent:75}}),{fields:f}=surfaceFields(r),seen=new Uint8Array(size*size);let groups=0;
  for(let i=0;i<seen.length;i++)if(!seen[i]&&f.waterType[i]!=='sea'){
   groups++;const q=[i];seen[i]=1;for(let at=0;at<q.length;at++)for(const j of gridNeighbors(q[at],size,size,r.topology))if(!seen[j]&&f.waterType[j]!=='sea'){seen[j]=1;q.push(j);}
  }
  assert.equal(groups,3);assert.equal(f.waterType.filter(v=>v!=='sea').length,size*size*.75);assert.ok(f.biome.includes('shallow-water')&&f.biome.includes('ocean'));
 }
});
