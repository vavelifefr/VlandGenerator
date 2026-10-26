import test from 'node:test';
import assert from 'node:assert/strict';
import {applyLandscapeRegions} from '../engine/core/landscape-regions.mjs';
import {gridNeighbors} from '../engine/core/topology.mjs';
import {hash} from '../content/common.mjs';
import {normalizeAtlasRequest} from '../engine/api/atlas-catalog.mjs';
import {surfaceFields} from '../engine/core/atlas-landforms.mjs';
import {ATLAS_BIOMES} from '../engine/api/atlas-catalog.mjs';

const card=(id,type,percent)=>({id,type,percent});
function sample(kind,size=50){const n=size*size,r={width:size,height:size,seed:42,topology:{kind},landscape:{structure:'coast',baseBiome:'meadow',biomes:[card('woods','forest',25),card('wet','swamp',15),card('high','mountains',20)]}},f={elevation:[],humidity:[],temperature:new Array(n).fill(.57),slope:new Array(n).fill(.01),waterType:[]};
 for(let i=0;i<n;i++){const x=i%size/(size-1),y=Math.floor(i/size)/(size-1);f.elevation.push(x<.1?.3:.4+x*.35+y*.03);f.humidity.push(.35+y*.5);f.waterType.push(x<.1?'sea':'none');}return {r,f};}
function components(values,id,r){const seen=new Uint8Array(values.length),groups=[];for(let i=0;i<values.length;i++)if(values[i]===id&&!seen[i]){const q=[i];seen[i]=1;for(let k=0;k<q.length;k++)for(const j of gridNeighbors(q[k],r.width,r.height,r.topology))if(values[j]===id&&!seen[j]){seen[j]=1;q.push(j);}groups.push(q.length);}return groups.sort((a,b)=>b-a);}

for(const kind of ['square','hex'])test(kind+' geographic territories spend requested percentages without changing relief or wetting a new crater',()=>{
 const {r,f}=sample(kind),original=structuredClone(f),before=hash(r),labels=applyLandscapeRegions(f,r),dry=labels.flatMap((_,i)=>f.waterType[i]==='none'?[i]:[]);
 assert.equal(hash(r),before,'request immutable');assert.ok(labels.every(id=>[r.landscape.baseBiome,...r.landscape.biomes.map(c=>c.type)].includes(id)),'no automatic extra selection');
 const count=id=>dry.filter(i=>labels[i]===id).length;
 assert.equal(count('meadow'),dry.length*.4);assert.equal(count('forest'),Math.round(dry.length*.25));
 assert.equal(count('swamp'),Math.floor(dry.length*.15));assert.equal(count('mountains'),dry.length*.2);
 const mean=(id,field)=>dry.filter(i=>labels[i]===id).reduce((s,i)=>s+f[field][i],0)/count(id);
 assert.ok(mean('swamp','elevation')+.1<mean('mountains','elevation'),'low wetland vs high mountain');assert.ok(mean('swamp','humidity')>mean('mountains','humidity'),'wetland humidity');
 assert.deepEqual(f.elevation,original.elevation);assert.deepEqual(f.waterType,original.waterType);
 const again=sample(kind);assert.deepEqual(applyLandscapeRegions(again.f,again.r),labels);assert.deepEqual(again.f,f,'deterministic terrain/climate');
});

test('empty and zero-percent cards change no fields; increasing map size grows requested territories',()=>{
 const {r,f}=sample('square');r.landscape.biomes=[card('zero','forest',0)];const before=hash(f);assert.ok(applyLandscapeRegions(f,r).every(id=>id==='meadow'));assert.equal(hash(f),before);
 const a=sample('square',50),b=sample('square',100),la=applyLandscapeRegions(a.f,a.r),lb=applyLandscapeRegions(b.f,b.r);
 for(const type of ['forest','swamp','mountains'])assert.ok(lb.filter((v,i)=>v===type&&b.f.waterType[i]==='none').length>la.filter((v,i)=>v===type&&a.f.waterType[i]==='none').length*3,type+' scaled area');
});

test('repeated cards combine percentages while independent stable IDs influence a shared continuous field',()=>{
 const a=sample('square',100),b=sample('square',100);a.r.landscape.biomes=[card('one','forest',40)];b.r.landscape.biomes=[card('one','forest',20),card('two','forest',20)];
 const la=applyLandscapeRegions(a.f,a.r),lb=applyLandscapeRegions(b.f,b.r),dry=a.f.waterType.filter(v=>v==='none').length;
 assert.equal(la.filter((v,i)=>v==='forest'&&a.f.waterType[i]==='none').length,dry*.4);assert.equal(lb.filter((v,i)=>v==='forest'&&b.f.waterType[i]==='none').length,dry*.4);assert.notDeepEqual(la,lb,'repeat is a real influence rather than an ignored duplicate');
});

test('one biome can follow several broad natural wet belts instead of being forced into one seed blob',()=>{
 const {r,f}=sample('square',100);r.landscape.biomes=[card('woods','forest',30)];for(let i=0;i<10000;i++){f.humidity[i]=.5+.4*Math.cos((i%100)/12);f.elevation[i]=.55;f.waterType[i]='none';}
 const labels=applyLandscapeRegions(f,r),groups=components(labels,'forest',r);assert.ok(groups.filter(size=>size>=200).length>=2,JSON.stringify(groups));assert.ok(groups.slice(0,5).reduce((a,b)=>a+b,0)>2900,'substantial zones, not confetti');
});

for(const kind of ['square','hex'])test(kind+' real surface uses chosen biome families and keeps water, material and acyclic flow consistent',()=>{
 const r=normalizeAtlasRequest({schema:'vland.atlas.request',schemaVersion:1,width:50,height:50,seed:42,topology:{kind},landscape:{structure:'land',baseBiome:'mountains',biomes:[card('low','meadow',25),card('trees','forest',20),card('wet','swamp',10)]}}),{fields:f}=surfaceFields(r);
 for(const family of [['plains','tundra','savanna'],['forest','rainforest','taiga'],['wetland'],['alpine','foothills','snow']])assert.ok(family.some(id=>f.biome.includes(id)),family+' visible territory');
 assert.ok(!f.biome.includes('desert')&&!f.biome.includes('volcanic'),'no unselected climatic extremes');
 for(let i=0;i<f.flowTo.length;i++){assert.ok(f.flowTo[i]<0||f.flowRank[f.flowTo[i]]<f.flowRank[i],'acyclic flow');assert.equal(f.material[i],ATLAS_BIOMES[f.biome[i]].material);}
});

test('small islands retain every selected territory according to final dry land quotas',()=>{
 const r=normalizeAtlasRequest({schema:'vland.atlas.request',schemaVersion:1,width:50,height:50,seed:7,landscape:{structure:'islands',baseBiome:'mountains',biomes:['meadow','forest','swamp','desert','snow','volcanic'].map((type,i)=>card('region-'+i,type,10))}}),{fields:f}=surfaceFields(r),labels=applyLandscapeRegions(structuredClone(f),r),dry=f.waterType.filter(v=>v==='none').length;
 for(const type of ['meadow','forest','swamp','desert','snow','volcanic'])assert.ok(labels.filter((v,i)=>v===type&&f.waterType[i]==='none').length>=Math.floor(dry*.1),type+' territory survives before local contextual IDs');
});
