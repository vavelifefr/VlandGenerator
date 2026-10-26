import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAtlasRequest} from '../engine/api/atlas-catalog.mjs';
import {surfaceFields} from '../engine/core/atlas-landforms.mjs';
import {surfaceWater} from '../engine/core/atlas-water.mjs';
import {applyLandscapeRegions} from '../engine/core/landscape-regions.mjs';

function request(seed,uniformity,kind='square',rivers=.8){
 const r=normalizeAtlasRequest({schema:'vland.atlas.request',schemaVersion:1,seed,width:128,height:128,topology:{kind},layers:{above:0,underground:0},hydrology:{rivers,lakes:0,riverWidth:1},landscape:{structure:'land',baseBiome:'meadow',biomes:[{id:'forest',type:'forest',percent:30},{id:'highlands',type:'mountains',percent:25}]}});
 r.landscape.uniformity=uniformity;return r;
}
function transitions(f,w,step){let sum=0,count=0;for(let y=0;y<w;y++)for(let x=0;x<w-step;x++){const i=y*w+x,j=i+step;if(f.waterType[i]!=='none'||f.waterType[j]!=='none')continue;sum+=Math.abs(f.elevation[i]-f.elevation[j]);count++;}return sum/count;}
function biomeBoundary(f,w){let sum=0,count=0;for(let y=0;y<w;y++)for(let x=0;x<w-8;x++){const i=y*w+x,j=i+8;if(f.waterType[i]!=='none'||f.waterType[j]!=='none')continue;sum+=f.biome[i]!==f.biome[j]?1:0;count++;}return sum/count;}
function headSpread(f,w){const incoming=new Uint16Array(w*w);for(let i=0;i<w*w;i++)if(f.waterType[i]==='river'&&f.flowTo[i]>=0&&f.waterType[f.flowTo[i]]==='river')incoming[f.flowTo[i]]++;const heads=[];for(let i=0;i<w*w;i++)if(f.waterType[i]==='river'&&!incoming[i])heads.push(i);if(heads.length<2)return 0;return heads.reduce((sum,i)=>sum+Math.min(...heads.filter(j=>i!==j).map(j=>Math.hypot(i%w-j%w,Math.floor(i/w)-Math.floor(j/w)))),0)/heads.length;}

test('uniformity distributes coherent relief, selected biome territories and river sources together',t=>{
 for(const kind of ['square','hex']){
  const measurements=[];
  for(const seed of [7,42,2026]){const low=surfaceFields(request(seed,0,kind)).fields,high=surfaceFields(request(seed,100,kind)).fields;measurements.push({low,high});}
  const average=(key,fn)=>measurements.reduce((sum,m)=>sum+fn(m[key],128),0)/measurements.length;
  const reliefLow=average('low',(f,w)=>transitions(f,w,8)),reliefHigh=average('high',(f,w)=>transitions(f,w,8));
  assert.ok(reliefHigh>reliefLow*1.2,`${kind}: high uniformity has more distributed relief provinces: ${reliefLow} -> ${reliefHigh}`);
  const biomeLow=average('low',biomeBoundary),biomeHigh=average('high',biomeBoundary);
  assert.ok(biomeHigh>biomeLow*1.15,`${kind}: selected territories spread across more geographic zones: ${biomeLow} -> ${biomeHigh}`);
  const riversLow=average('low',headSpread),riversHigh=average('high',headSpread);
  assert.ok(riversHigh>riversLow*1.1,`${kind}: source spacing grows with uniformity: ${riversLow} -> ${riversHigh}`);
  t.diagnostic(JSON.stringify({kind,seeds:[7,42,2026],reliefDifferenceAtEightCells:{low:reliefLow,high:reliefHigh},biomeDifferenceAtEightCells:{low:biomeLow,high:biomeHigh},riverHeadNearestNeighbor:{low:riversLow,high:riversHigh}}));
 }
});

test('uniformity retains deterministic geography, sea mask and disabled rivers',()=>{
 for(const kind of ['square','hex'])for(const uniformity of [0,50,100]){
  const r=request(71,uniformity,kind,0),f=surfaceFields(r).fields;
  assert.deepEqual(f,surfaceFields(r).fields);
  assert.equal(f.waterType.filter(v=>v==='river').length,0);
  assert.equal(f.waterType.filter(v=>v==='sea').length,0);
  for(let i=0;i<f.flowTo.length;i++)if(f.flowTo[i]>=0)assert.ok(f.flowRank[f.flowTo[i]]<f.flowRank[i]);
 }
});

test('source balance selects separate eligible catchments without changing the watershed or river budget',()=>{
 const size=128,fields={elevation:Array.from({length:size*size},(_,i)=>{const x=i%size,y=Math.floor(i/size);return y===size-1?.3:.42+(size-1-y)/size*.25+Math.abs(x-(size-1)/2)/size*.35;}),rainfall:new Array(size*size).fill(1)},settings={rivers:.8,lakes:0,riverWidth:1,minLakeArea:4};
 for(const kind of ['square','hex']){
  const low=surfaceWater(fields,size,size,.36,settings,{kind},true,0),high=surfaceWater(fields,size,size,.36,settings,{kind},true,100);
  for(const key of ['flowTo','flowRank','drainage','filledElevation','basin'])assert.deepEqual(low[key],high[key],kind+' same '+key);
  assert.ok(headSpread(high,size)>headSpread(low,size)*2,kind+' separate geographic source areas on the same relief');
  for(const f of [low,high]){const incoming=new Uint8Array(size*size);for(let i=0;i<incoming.length;i++)if(f.waterType[i]==='river'&&f.flowTo[i]>=0&&f.waterType[f.flowTo[i]]==='river')incoming[f.flowTo[i]]=1;let heads=0;for(let i=0;i<incoming.length;i++)if(f.waterType[i]==='river'&&!incoming[i]){heads++;assert.ok(fields.elevation[i]>=.42+(.84-.42)*.6);assert.ok(f.drainage[i]>=f.riverThreshold);}assert.ok(heads<=Math.ceil(size*settings.rivers/20));}
 }
});

test('uniformity preserves exact selected biome areas, repeated cards and the sea geometry',()=>{
 for(const kind of ['square','hex']){
  let sea;
  for(const uniformity of [0,50,100]){
   const r=request(29,uniformity,kind,0);r.landscape.structure='coast';r.landscape.landPercent=75;r.landscape.biomes=[{id:'forest-a',type:'forest',percent:10},{id:'forest-b',type:'forest',percent:20},{id:'high',type:'mountains',percent:25}];
   const f=surfaceFields(r).fields,mask=f.waterType.map(t=>t==='sea');if(sea)assert.deepEqual(mask,sea);else sea=mask;
   const labels=applyLandscapeRegions(structuredClone(f),r),dry=labels.filter((_,i)=>f.waterType[i]==='none'),counts=Object.fromEntries(['forest','mountains','meadow'].map(type=>[type,dry.filter(v=>v===type).length]));
   assert.ok(Math.abs(counts.forest-dry.length*.3)<=1);assert.ok(Math.abs(counts.mountains-dry.length*.25)<=1);assert.equal(counts.forest+counts.mountains+counts.meadow,dry.length);
  }
 }
});
