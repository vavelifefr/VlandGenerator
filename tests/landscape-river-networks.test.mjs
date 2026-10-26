import test from 'node:test';
import assert from 'node:assert/strict';
import {surfaceWater,watershed} from '../engine/core/atlas-water.mjs';
import {createRecipe,generateBase,contentScene} from '../app/index.mjs';
import {hash,analyzeSource,createSource,maskCells} from '../content/index.mjs';
import {gridNeighbors,gridDistance} from '../engine/core/topology.mjs';
import {normalizeAtlasRequest} from '../engine/api/atlas-catalog.mjs';
import {surfaceFields} from '../engine/core/atlas-landforms.mjs';

const settings={rivers:.7,lakes:.6,riverWidth:1,minLakeArea:4};
function valley(size){return{elevation:Array.from({length:size*size},(_,i)=>{const x=i%size,y=Math.floor(i/size);return y===size-1?.3:.42+(size-1-y)/size*.25+Math.abs(x-(size-1)/2)/size*.35;}),rainfall:new Array(size*size).fill(1)};}
function starts(w){const incoming=new Uint8Array(w.waterType.length);for(let i=0;i<incoming.length;i++)if(w.waterType[i]==='river'&&w.flowTo[i]>=0&&w.waterType[w.flowTo[i]]==='river')incoming[w.flowTo[i]]=1;return w.waterType.flatMap((t,i)=>t==='river'&&!incoming[i]?[i]:[]);}

test('profile river heads begin in high watersheds and converge into tributaries on both grids',()=>{
 for(const kind of ['square','hex']){const f=valley(100),before=hash(f),w=surfaceWater(f,100,100,.36,settings,{kind},true),heads=starts(w),dry=f.elevation.filter(e=>e>.36),high=Math.min(...dry)+(Math.max(...dry)-Math.min(...dry))*.6;assert.ok(heads.length>=2,kind+' multiple headwaters');assert.ok(heads.length<=4,kind+' bounded headwater count');for(const i of heads)assert.ok(f.elevation[i]>=high,kind+' high head '+i+' at '+f.elevation[i]);let joins=0;const incoming=new Uint16Array(10000);for(let i=0;i<10000;i++)if(w.waterType[i]==='river'&&w.flowTo[i]>=0&&w.waterType[w.flowTo[i]]==='river')incoming[w.flowTo[i]]++;for(const n of incoming)joins+=n>=2;assert.ok(joins>0,kind+' tributaries merge');assert.equal(hash(f),before);}
});

test('larger profile maps permit more high tributaries while fifty-cell maps keep a small network',()=>{
 for(const kind of ['square','hex']){const counts=[];for(const size of [50,100,200,300]){const f=valley(size),w=surfaceWater(f,size,size,.36,{...settings,rivers:1},{kind},true);counts.push(starts(w).length);}assert.ok(counts[0]<=3,kind+' simple 50: '+counts);assert.ok(counts[3]>counts[0],kind+' larger network: '+counts);assert.ok(counts.every(n=>n>=2&&n<=20),kind+' bounded '+counts);}
});

test('selected profile channels retain the original acyclic drainage and conditioned wet heads',()=>{
 for(const kind of ['square','hex']){const f=valley(100),w=surfaceWater(f,100,100,.36,{...settings,riverWidth:3},{kind},true),route=watershed(f.elevation,100,100,f.rainfall,{kind});for(const key of ['flowTo','flowRank','drainage','filledElevation','basin'])assert.deepEqual(w[key],route[key]);for(let i=0;i<10000;i++){const j=w.flowTo[i];if(j>=0)assert.ok(w.flowRank[j]<w.flowRank[i]);if(j>=0&&w.waterType[i]!=='none'&&w.waterType[j]!=='none')assert.ok(f.elevation[j]+w.waterDepth[j]<=f.elevation[i]+w.waterDepth[i]+.000001);assert.ok(w.waterDepth[i]>=0&&w.waterDepth[i]<=1);}const zero=surfaceWater(f,100,100,.36,{...settings,rivers:0,riverWidth:5},{kind},true);assert.ok(!zero.waterType.includes('river'));}
});

test('short lowland arms rejoin a lower existing channel within the configured width and reject a steep bank',()=>{
 for(const [kind,seed,indices] of [['square',7,[909,908,808,708]],['hex',42,[325,225,125,26]]]){const r=normalizeAtlasRequest({schema:'vland.atlas.request',schemaVersion:1,width:100,height:100,seed,topology:{kind},layers:{above:0,underground:0},landscape:{structure:'land',baseBiome:'meadow'},hydrology:{riverWidth:3}}),f=surfaceFields(r).fields,water=surfaceWater(f,100,100,.36,r.hydrology,{kind},true),core=surfaceWater(f,100,100,.36,{...r.hydrology,riverWidth:1},{kind},true),[from,...tail]=indices,to=tail.at(-1),path=tail.slice(0,-1);assert.equal(core.waterType[from],'river');assert.equal(core.waterType[to],'river');assert.ok(water.flowRank[to]<water.flowRank[from]);let previous=from;for(let k=0;k<path.length;k++){const i=path[k];assert.equal(core.waterType[i],'none');assert.equal(water.waterType[i],'river');assert.equal(water.flowTo[i],indices[k+2]);assert.ok(water.filledElevation[i]<=water.filledElevation[previous]+.000001);assert.ok(gridDistance({x:from%100,y:Math.floor(from/100)},{x:i%100,y:Math.floor(i/100)},{kind})<=2);previous=i;}assert.equal(water.waterType[to],'river');
  const cores=core.waterType.flatMap((t,i)=>t==='river'?[i]:[]);for(let i=0;i<10000;i++)if(water.waterType[i]==='river'&&core.waterType[i]!=='river')assert.ok(cores.some(j=>gridDistance({x:i%100,y:Math.floor(i/100)},{x:j%100,y:Math.floor(j/100)},{kind})<=2),'all arms and banks respect the original core radius');const steep=structuredClone(f);steep.elevation[path[0]]=.95;const rejected=surfaceWater(steep,100,100,.36,r.hydrology,{kind},true);assert.equal(rejected.waterType[path[0]],'none');
 }
});

test('real fifty to three-hundred maps retain valid hydrology and river-only content eligibility',async()=>{
 for(const mode of ['landscape','hexlandscape'])for(const size of [50,100,200,300]){const r=await createRecipe(mode);Object.assign(r.generation,{width:size,height:size,layers:{above:0,underground:0},landscape:{structure:'coast',baseBiome:'forest'}});const p=await generateBase(r),a=p.source,f=a.layers[0].fields,label=mode+' '+size;assert.equal(a.navigation.ok,true,label);assert.equal(a.access.ok,true,label);assert.ok(f.waterType.includes('river'),label+' real river');for(let i=0;i<size*size;i++){const j=f.flowTo[i];if(j>=0)assert.ok(f.flowRank[j]<f.flowRank[i],label+' acyclic');assert.ok(f.waterDepth[i]>=0&&f.waterDepth[i]<=1,label+' depth');if(['river','lake'].includes(f.waterType[i]))assert.ok(Math.max(.4,f.filledElevation[i]+.035)-f.heightmap[i]<=1,label+' required unclamped depth');if(j>=0&&f.waterType[i]!=='none'&&f.waterType[j]!=='none')assert.ok(f.heightmap[j]+f.waterDepth[j]<=f.heightmap[i]+f.waterDepth[i]+.000001,label+' wet head');const slope=Math.max(0,...gridNeighbors(i,size,size,a.request.topology).map(k=>Math.abs(f.heightmap[k]-f.heightmap[i])));assert.ok(Math.abs(slope-f.slope[i])<=.000001,label+' source slope');if(f.waterType[i]==='river')assert.equal(f.biome[i],'river',label+' content biome');}
  const scene=await contentScene(p),layer=scene.map.layers[0];scene.catalog=[...scene.catalog,{id:'river-event',name:'River event',category:'events',type:'event',subtype:'river',color:'#00aaee',glyph:'~',footprint:{width:1,height:1},blocking:false,channel:'trigger',constraints:{allowedTerrain:['river'],allowedBiomes:['river']},properties:{}}];scene.sources=[createSource({id:'river-only',category:'events',kind:'zone',layer,catalogId:'river-event'})];const report=analyzeSource(scene,'river-only'),eligible=maskCells(report.eligibleMask,size);assert.ok(eligible.length>0,label+' river-only eligible');for(const i of eligible){assert.equal(layer.water[i],'river');assert.equal(layer.biome[i],'river');}
 }
});
