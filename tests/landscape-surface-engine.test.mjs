import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeLandscapeProfile} from '../engine/core/landscape-profile.mjs';
import {applyLandscapeRegions} from '../engine/core/landscape-regions.mjs';
import {normalizeAtlasRequest} from '../engine/api/atlas-catalog.mjs';
import {surfaceFields} from '../engine/core/atlas-landforms.mjs';
import {gridNeighbors} from '../engine/core/topology.mjs';
import {deriveBiomes} from '../engine/core/atlas-biomes.mjs';

const card=(id,type,percent)=>({id,type,percent});
const profile=(biomes=[],baseBiome='meadow',structure='land')=>({structure,baseBiome,biomes,landPercent:75,uniformity:50,coastErosion:50});
function request(kind,size,biomes=[],baseBiome='meadow',structure='land',seed=42){return normalizeAtlasRequest({schema:'vland.atlas.request',schemaVersion:1,width:size,height:size,seed,topology:{kind},layers:{above:0,underground:0},landscape:profile(biomes,baseBiome,structure)});}
function groups(labels,type,r){const seen=new Uint8Array(labels.length),result=[];for(let i=0;i<labels.length;i++)if(labels[i]===type&&!seen[i]){const queue=[i];seen[i]=1;for(let at=0;at<queue.length;at++)for(const j of gridNeighbors(queue[at],r.width,r.height,r.topology))if(labels[j]===type&&!seen[j]){seen[j]=1;queue.push(j);}result.push(queue.length);}return result.sort((a,b)=>b-a);}

test('Surface profile accepts repeated stable biome cards and rejects invalid percentages atomically',()=>{
 const p=profile(Array.from({length:10},(_,i)=>card('forest-'+i,'forest',5)));
 assert.deepEqual(normalizeLandscapeProfile(p),p);assert.notEqual(normalizeLandscapeProfile(p).biomes,p.biomes);
 assert.deepEqual(normalizeLandscapeProfile(profile([card('same-as-base','meadow',12.5)])),profile([card('same-as-base','meadow',12.5)]));
 for(const biomes of [[card('x','forest',50),card('y','forest',50.1)],[card('x','forest',5),card('x','snow',5)],[card('x','forest',.01)],[card('x','forest',NaN)],[card('x','unknown',5)],Array.from({length:65},(_,i)=>card('x'+i,'forest',1))])assert.throws(()=>normalizeLandscapeProfile(profile(biomes)));
 assert.throws(()=>normalizeLandscapeProfile({structure:'land',baseBiome:'meadow',additionalBiomes:['forest']}),'no old unique-list alias');
});

test('biome IDs count Unicode codepoints consistently with JSON Schema maxLength',()=>{
 const accepted=profile([card('🌲'.repeat(40),'forest',10)]);assert.deepEqual(normalizeLandscapeProfile(accepted),accepted);
 assert.throws(()=>normalizeLandscapeProfile(profile([card('🌲'.repeat(65),'forest',10)])));
});

for(const kind of ['square','hex'])test(kind+' percentages spend final dry land only, with exact rounding and no geographic mutation',()=>{
 const r={width:50,height:50,seed:42,topology:{kind},landscape:profile([card('wet','swamp',25),card('high','mountains',25),card('woods','forest',12.5)])},n=r.width*r.height;
 const fields={elevation:[],humidity:[],temperature:[],slope:[],waterType:[]};
 for(let i=0;i<n;i++){fields.elevation.push(.4+(i%50)/50*.45);fields.humidity.push(.3+Math.floor(i/50)/50*.6);fields.temperature.push(.55);fields.slope.push(.015);fields.waterType.push(i<200?'sea':i<250?'river':i<300?'lake':'none');}
 const before=structuredClone(fields),labels=applyLandscapeRegions(fields,r),dry=labels.flatMap((_,i)=>fields.waterType[i]==='none'?[i]:[]),count=id=>dry.filter(i=>labels[i]===id).length;
 assert.equal(count('swamp'),550);assert.equal(count('mountains'),550);assert.equal(count('forest'),275);assert.equal(count('meadow'),825);
 assert.deepEqual(fields.elevation,before.elevation);assert.deepEqual(fields.waterType,before.waterType);
 const mean=id=>dry.filter(i=>labels[i]===id).reduce((sum,i)=>sum+fields.elevation[i],0)/count(id);
 assert.ok(mean('mountains')>mean('swamp')+.12,'geographic suitability puts mountains above wetlands');
 for(const type of ['forest','swamp','mountains']){const components=groups(labels.map((v,i)=>fields.waterType[i]==='none'?v:''),type,r);assert.ok(components.filter(v=>v<4).reduce((a,b)=>a+b,0)<count(type)*.08,'no confetti of isolated cells: '+type);}
});

for(const kind of ['square','hex'])test(kind+' Surface relief retains broad regional variation and stable rivers while cards are changed',()=>{
 const a=request(kind,100,[]),b=request(kind,100,[card('woods','forest',25),card('wet','swamp',15),card('high','mountains',20)]),fa=surfaceFields(a).fields,fb=surfaceFields(b).fields;
 assert.ok(Math.max(...fa.elevation)-Math.min(...fa.elevation)>.3,'wide Surface relief instead of compressed uniform biome plateau');
 assert.ok(Math.max(...fa.humidity)-Math.min(...fa.humidity)>.35,'broad climate field');
 assert.deepEqual(fa.elevation,fb.elevation);assert.deepEqual(fa.waterType,fb.waterType);assert.deepEqual(fa.flowTo,fb.flowTo);
 assert.ok(['forest','taiga','rainforest'].some(id=>fb.biome.includes(id)));assert.ok(fb.biome.includes('wetland'));assert.ok(fb.biome.includes('alpine'));
 for(let i=0;i<fb.flowTo.length;i++)assert.ok(fb.flowTo[i]<0||fb.flowRank[fb.flowTo[i]]<fb.flowRank[i],'acyclic rivers');
 assert.deepEqual(surfaceFields(b).fields,fb,'deterministic');
});

test('largest remainder allocation counts water-free tiny maps and allows zero and 100 percent',()=>{
 const r={width:16,height:16,seed:1,topology:{kind:'square'},landscape:profile([card('a','forest',33.3),card('b','swamp',33.3),card('z','snow',0)])},n=256,fields={elevation:new Array(n).fill(.5),humidity:new Array(n).fill(.5),temperature:new Array(n).fill(.5),slope:new Array(n).fill(0),waterType:new Array(n).fill('sea')};
 for(const i of [100,101,116])fields.waterType[i]='none';let labels=applyLandscapeRegions(fields,r);for(const id of ['forest','swamp','meadow'])assert.equal(labels.filter((v,i)=>fields.waterType[i]==='none'&&v===id).length,1);
 r.landscape=profile([card('all','forest',100)]);labels=applyLandscapeRegions(fields,r);assert.ok(labels.filter((_,i)=>fields.waterType[i]==='none').every(id=>id==='forest'));
});

test('regional boundaries create real foothill terrain and retain cores instead of only tinting neighboring colors',()=>{
 const size=50,n=size*size,r={width:size,height:size,topology:{kind:'square'},landscape:profile(),biomes:{transitionWidth:4,coastWidth:0,foothillWidth:0},hydrology:{floodplainWidth:0}},labels=Array.from({length:n},(_,i)=>i%size<25?'forest':'mountains'),make=()=>({elevation:new Array(n).fill(.7),slope:new Array(n).fill(.02),waterType:new Array(n).fill('none'),humidity:new Array(n).fill(.65),temperature:new Array(n).fill(.55),biome:labels.map(type=>type==='forest'?'forest':'alpine'),material:labels.map(type=>type==='forest'?'grass':'gravel')});
 const fields=make(),before=[...labels];deriveBiomes(fields,r,labels);assert.deepEqual(labels,before,'territory quotas do not change');
 assert.ok(fields.biome.filter(id=>id==='foothills').length>=300,'actual semantic transition tiles');assert.ok(fields.biome.filter(id=>id==='forest').length>=800,'forest interior');assert.ok(fields.biome.filter(id=>id==='alpine').length>=800,'mountain interior');
 for(let i=0;i<n;i++)if(fields.biome[i]==='foothills')assert.equal(fields.material[i],'gravel');
 const hard=make();r.biomes.transitionWidth=0;deriveBiomes(hard,r,labels);assert.ok(!hard.biome.includes('foothills'),'zero transition setting remains respected');
});
