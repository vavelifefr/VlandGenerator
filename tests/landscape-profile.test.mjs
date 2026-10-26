import test from 'node:test';
import assert from 'node:assert/strict';
import {LANDSCAPE_STRUCTURES,LANDSCAPE_BIOMES,normalizeLandscapeProfile,landscapeElevation,landscapeClimate,landscapeBiome} from '../engine/core/landscape-profile.mjs';
import {gridNeighbors} from '../engine/core/topology.mjs';
import {surfaceWater} from '../engine/core/atlas-water.mjs';
import {ATLAS_BIOMES} from '../engine/api/atlas-catalog.mjs';

const request=(structure='land',baseBiome='meadow',kind='square',width=32,height=32)=>({width,height,seed:42,topology:{kind},landscape:{structure,baseBiome,landPercent:structure==='islands'?25:75,uniformity:50,coastErosion:50},landforms:{coastDetail:.25},biomes:{coastWidth:2},hydrology:{floodplainWidth:2}});
const elevations=(r,seed=r.seed)=>Array.from({length:r.width*r.height},(_,i)=>landscapeElevation(.5,r,i%r.width,Math.floor(i/r.width),seed));
const components=(values,r)=>{const seen=new Uint8Array(values.length),groups=[];for(let i=0;i<values.length;i++)if(values[i]>.36&&!seen[i]){const q=[i];seen[i]=1;for(let k=0;k<q.length;k++)for(const j of gridNeighbors(q[k],r.width,r.height,r.topology))if(values[j]>.36&&!seen[j]){seen[j]=1;q.push(j);}groups.push(q);}return groups.sort((a,b)=>b.length-a.length);};
const perimeter=(values,r)=>values.filter((_,i)=>i<r.width||i>=values.length-r.width||i%r.width===0||i%r.width===r.width-1);

test('landscape selection has exactly four structures and seven explicit mandatory base biomes',()=>{
 assert.deepEqual(Object.keys(LANDSCAPE_STRUCTURES),['land','coast','islands','continent']);
 assert.deepEqual(Object.keys(LANDSCAPE_BIOMES),['meadow','forest','swamp','desert','snow','mountains','volcanic']);
 for(const structure of Object.keys(LANDSCAPE_STRUCTURES))for(const baseBiome of Object.keys(LANDSCAPE_BIOMES))assert.deepEqual(normalizeLandscapeProfile({structure,baseBiome}),{structure,baseBiome,biomes:[],landPercent:75,uniformity:50,coastErosion:50});
 for(const value of [undefined,null,[],{}, {structure:'land'}, {baseBiome:'forest'}, {structure:'random',baseBiome:'forest'}, {structure:'land',baseBiome:'auto'}, {structure:['land'],baseBiome:'forest'}, {structure:'land',baseBiome:'forest',extra:1}])assert.throws(()=>normalizeLandscapeProfile(value),/Ландшафт/);
});

test('underlying land, coast, islands and continent have their promised sea geometry on square and hex grids',()=>{
 for(const kind of ['square','hex'])for(const size of [16,32,64])for(const seed of [7,42,2026])for(const structure of Object.keys(LANDSCAPE_STRUCTURES)){
  const r=request(structure,'meadow',kind,size,size),a=elevations(r,seed),land=components(a,r),edge=perimeter(a,r);
  assert.ok(a.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
  if(structure==='land'){assert.ok(a.every(v=>v>.36));assert.equal(land.length,1);}
  else if(structure==='coast'){assert.equal(land.length,1);assert.ok(edge.some(v=>v>.36));assert.ok(edge.some(v=>v<.36));const edges=[a.slice(0,size),a.slice(-size),a.filter((_,i)=>i%size===0),a.filter((_,i)=>i%size===size-1)];assert.ok(edges.some(e=>e.every(v=>v>.36)));assert.ok(edges.some(e=>e.every(v=>v<.36)));}
  else{assert.ok(edge.every(v=>v<.36),'Sea frame '+structure+' '+kind+' '+size+' '+seed);if(structure==='continent'){assert.equal(land.length,1);assert.ok(land[0].length>a.length*.3);}else{assert.equal(land.length,3);assert.ok(land.every(g=>g.length>=3));}}
 }
});

test('all base biomes retain structure guarantees on the same geographic skeleton',()=>{
 for(const kind of ['square','hex'])for(const baseBiome of Object.keys(LANDSCAPE_BIOMES))for(const structure of Object.keys(LANDSCAPE_STRUCTURES)){
  const r=request(structure,baseBiome,kind),a=elevations(r);if(structure==='land')assert.ok(a.every(v=>v>.36));if(['islands','continent'].includes(structure))assert.ok(perimeter(a,r).every(v=>v<.36));if(structure==='islands')assert.equal(components(a,r).length,3);
 }
 const mean=id=>{const a=elevations(request('land',id));return a.reduce((n,v)=>n+v,0)/a.length;};assert.equal(mean('swamp'),mean('meadow'));assert.equal(mean('meadow'),mean('mountains'));
});

test('profile fields are deterministic, seed-sensitive, finite on a large rectangular hex map, and do not mutate requests',()=>{
 const r=request('continent','forest','hex',256,128),before=JSON.stringify(r),a=elevations(r);assert.deepEqual(a,elevations(r));assert.notDeepEqual(a,elevations(r,71));assert.equal(JSON.stringify(r),before);assert.ok(a.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
});

test('base biome territories retain natural climatic subtypes, water and steep-slope contexts',()=>{
 const families={meadow:['plains','savanna','tundra'],forest:['forest','taiga','rainforest'],swamp:['wetland'],desert:['desert','cold-desert'],snow:['snow','tundra'],mountains:['foothills','alpine','snow'],volcanic:['volcanic']};
 for(const [baseBiome,family]of Object.entries(families)){
  const r=request('land',baseBiome),f={waterType:['none'],elevation:[.7],slope:[.01],humidity:[1],temperature:[.9]};assert.ok(family.includes(landscapeBiome(f,0,r)));f.humidity[0]=0;f.temperature[0]=.01;assert.ok(family.includes(landscapeBiome(f,0,r)));
  for(const [water,biome]of [['sea','ocean'],['river','river'],['lake','lake']]){f.waterType[0]=water;assert.equal(landscapeBiome(f,0,r),biome);}f.waterType[0]='none';f.slope[0]=.2;assert.equal(landscapeBiome(f,0,r),'cliffs');
  assert.ok(family.every(id=>ATLAS_BIOMES[id]));
 }
});

test('broad Surface climates retain profile tendencies rather than forcing a uniform climate at every cell',()=>{
 for(const kind of ['square','hex'])for(const seed of [7,42,2026]){
  const samples={};for(const id of ['desert','swamp','snow','forest']){const r=request('land',id,kind),values=[];for(let y=0;y<160;y+=8)for(let x=0;x<160;x+=8)values.push(landscapeClimate(r,x,y,.58,seed));samples[id]=values;assert.ok(values.every(v=>Object.values(v).every(n=>n>=0&&n<=1)));}
  const mean=(id,key)=>samples[id].reduce((sum,v)=>sum+v[key],0)/samples[id].length;
  assert.ok(mean('desert','temperature')>mean('snow','temperature')+.4);assert.ok(mean('swamp','humidity')>mean('desert','humidity')+.4);
  assert.ok(Math.max(...samples.forest.map(v=>v.humidity))-Math.min(...samples.forest.map(v=>v.humidity))>.5);
 }
});

test('volcanic profile produces a cone rim above its crater and uses existing basalt ground',()=>{
 const r=request('land','volcanic','square',101,101),center=landscapeElevation(.25,r,50,50,42),rim=[landscapeElevation(.25,r,58,50,42),landscapeElevation(.25,r,50,58,42)],plain=landscapeElevation(.25,r,10,10,42);assert.ok(rim.every(v=>v>center+.05));assert.ok(center>plain+.05);assert.equal(ATLAS_BIOMES[LANDSCAPE_BIOMES.volcanic.biome].material,'basalt');
});

test('profile elevation feeds existing hydrology with a sea frame while allowing freshwater',()=>{
 const r=request('islands','forest'),elevation=elevations(r),water=surfaceWater({elevation,rainfall:Array(elevation.length).fill(.6)},r.width,r.height,.36,{rivers:.55,lakes:.6,riverWidth:1,minLakeArea:1},r.topology);assert.ok(perimeter(water.waterType,r).every(v=>v==='sea'));assert.ok(water.waterType.includes('none'));assert.ok(water.waterType.includes('sea'));assert.ok(water.flowTo.every((j,i)=>j<0||water.flowRank[j]<water.flowRank[i]));
});
