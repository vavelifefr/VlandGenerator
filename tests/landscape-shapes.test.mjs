import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {landscapeElevation} from '../engine/core/landscape-profile.mjs';
import {gridNeighbors} from '../engine/core/topology.mjs';
import {generateAtlas,validateAtlas} from '../engine/api/atlas.mjs';

const request=(structure='islands',kind='hex',width=16,height=256,seed=2026)=>({width,height,seed,topology:{kind},landscape:{structure,baseBiome:'meadow',landPercent:structure==='islands'?25:structure==='continent'?45:75,uniformity:50}});
const heights=r=>Array.from({length:r.width*r.height},(_,i)=>landscapeElevation(.5,r,i%r.width,Math.floor(i/r.width),r.seed));
function components(a,r){const seen=new Uint8Array(a.length),groups=[];for(let i=0;i<a.length;i++)if(a[i]>.36&&!seen[i]){const q=[i];seen[i]=1;let x=0,y=0,minx=r.width,maxx=0,miny=r.height,maxy=0;for(let k=0;k<q.length;k++){const n=q[k],xx=n%r.width,yy=Math.floor(n/r.width);x+=xx;y+=yy;minx=Math.min(minx,xx);maxx=Math.max(maxx,xx);miny=Math.min(miny,yy);maxy=Math.max(maxy,yy);for(const j of gridNeighbors(n,r.width,r.height,r.topology))if(a[j]>.36&&!seen[j]){seen[j]=1;q.push(j);}}groups.push({cells:q.length,x:x/q.length,y:y/q.length,aspect:(maxx-minx+1)/(maxy-miny+1)});}return groups.sort((a,b)=>a.x-b.x);}
const seaFrame=(a,r)=>a.every((v,i)=>i>=r.width&&i<a.length-r.width&&i%r.width!==0&&i%r.width!==r.width-1||v<.28);

test('hex16x256 pure seed2026 builds three connected islands without a one-cell satellite',()=>{
 const r=request(),parts=components(heights(r),r);assert.equal(parts.length,3);assert.ok(parts.every(p=>p.cells>=3));
});

test('native hex16x256 seed11 heightmap preserves the three island cores before navigation repairs',()=>{
 const r=request('islands','hex',16,256,11),a=generateAtlas({schema:'vland.atlas.request',schemaVersion:1,...r,layers:{above:0,underground:0},resources:{frequency:0,starter:false},ecology:{vegetation:0},structures:{density:0},events:{density:0,spawners:0}});assert.ok(validateAtlas(a).ok);assert.equal(components(a.layers[0].fields.heightmap,r).length,3);
});

test('coast hex16x256 seed125 keeps shoreline land connected without a detached cell',()=>{
 const r=request('coast','hex',16,256,125);assert.equal(components(heights(r),r).length,1);
});

test('coast remains one mainland with fully dry and sea opposite edges across 768 narrow-map cases',()=>{
 for(const kind of ['square','hex'])for(const [w,h]of [[16,16],[16,256],[256,16]])for(let seed=0;seed<128;seed++){
  const r=request('coast',kind,w,h,seed),a=heights(r),label=[kind,w,h,seed,'coast'].join('/'),top=a.slice(0,w),bottom=a.slice(-w),left=a.filter((_,i)=>i%w===0),right=a.filter((_,i)=>i%w===w-1),dry=edge=>edge.every(v=>v>.36),sea=edge=>edge.every(v=>v<.36);
  assert.equal(components(a,r).length,1,label+' connected mainland');assert.ok(dry(top)&&sea(bottom)||sea(top)&&dry(bottom)||dry(left)&&sea(right)||sea(left)&&dry(right),label+' opposite full dry and sea sides');
 }
});

test('seed changes continent placement and aspect, and rotates the three-island composition',t=>{
 const reports=[];for(const kind of ['square','hex'])for(const structure of ['islands','continent']){
  const samples=Array.from({length:64},(_,seed)=>{const r=request(structure,kind,64,64,seed),a=heights(r);return{a,parts:components(a,r)};});
  if(structure==='continent'){
   assert.ok(new Set(samples.map(s=>Math.round(s.parts[0].x))).size>1,kind+': continent center moves beyond subpixel boundary jitter');
   assert.ok(new Set(samples.map(s=>Math.round(s.parts[0].aspect*10))).size>1,kind+': continent proportions vary with seed');
  }else{assert.ok(samples.some(s=>s.parts[0].y<32),kind+': leftmost core can be in the upper half');assert.ok(samples.some(s=>s.parts[0].y>32),kind+': leftmost core can be in the lower half');}
  const ps=samples.flatMap(s=>s.parts);reports.push({kind,structure,uniqueMasks:new Set(samples.map(s=>createHash('sha256').update(Uint8Array.from(s.a,v=>+(v>.36))).digest('hex'))).size,centerX:[Math.min(...ps.map(p=>p.x)),Math.max(...ps.map(p=>p.x))],centerY:[Math.min(...ps.map(p=>p.y)),Math.max(...ps.map(p=>p.y))],aspect:[Math.min(...ps.map(p=>p.aspect)),Math.max(...ps.map(p=>p.aspect))]});
 }
 t.diagnostic(JSON.stringify({seedRange:'0..63',size:'64x64',reports}));
});

test('connected seed geometry keeps three separated islands or one large continent and deep sea on both grids and narrow maps',()=>{
 for(const kind of ['square','hex'])for(const [w,h]of [[16,16],[32,32],[64,64],[16,256],[256,16]])for(const seed of [0,7,11,42,2026])for(const structure of ['islands','continent']){
  const r=request(structure,kind,w,h,seed),a=heights(r),parts=components(a,r),label=[kind,w,h,seed,structure].join('/');assert.equal(parts.length,structure==='islands'?3:1,label);assert.ok(parts.every(p=>p.cells>=3),label+' nonempty cores');if(structure==='continent')assert.ok(parts[0].cells>a.length*.3,label+' large landmass');assert.ok(seaFrame(a,r),label+' deep sea frame');
 }
});

test('minimum 16x16 maps keep every core usable across 128 seeds on both grids',()=>{
 for(const kind of ['square','hex'])for(let seed=0;seed<128;seed++)for(const structure of ['islands','continent']){
  const r=request(structure,kind,16,16,seed),a=heights(r),parts=components(a,r),label=[kind,16,seed,structure].join('/');assert.equal(parts.length,structure==='islands'?3:1,label);assert.ok(parts.every(p=>p.cells>=3),label+' each core has at least three cells');if(structure==='continent')assert.ok(parts[0].cells>a.length*.3,label+' large landmass');assert.ok(seaFrame(a,r),label+' deep sea frame');
 }
});

test('prepared geometry follows request/seed changes without mutating input or exposing cache state',()=>{
 const r=request('continent','square',32,32,7),before=structuredClone(r),a=heights(r);assert.deepEqual(heights(r),a);assert.deepEqual(r,before);
 r.seed=42;assert.deepEqual(heights(r),heights(structuredClone(r)));r.width=16;r.height=64;assert.deepEqual(heights(r),heights(structuredClone(r)));r.topology.kind='hex';r.landscape.structure='islands';assert.deepEqual(heights(r),heights(structuredClone(r)));r.landscape.structure='coast';const coastBefore=structuredClone(r);assert.deepEqual(heights(r),heights(structuredClone(r)));assert.deepEqual(r,coastBefore);Object.assign(r,before);assert.deepEqual(heights(r),a);
});

test('256x256 prepared island and continent geometry fits the existing worker time budget',t=>{
 const results=[];for(const kind of ['square','hex'])for(const structure of ['islands','continent']){const r=request(structure,kind,256,256,42),start=performance.now(),a=heights(r),elapsedMs=Math.round(performance.now()-start);assert.equal(components(a,r).length,structure==='islands'?3:1);assert.ok(elapsedMs<45000,'Geometry stays inside the existing generation budget');results.push({kind,structure,elapsedMs});}t.diagnostic(JSON.stringify({size:'256x256',results}));
});
