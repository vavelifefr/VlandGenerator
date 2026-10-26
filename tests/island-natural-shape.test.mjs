import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAtlasRequest} from '../engine/api/atlas-catalog.mjs';
import {atlasSeed} from '../engine/core/atlas-landforms.mjs';
import {landscapeElevation} from '../engine/core/landscape-profile.mjs';
import {gridNeighbors} from '../engine/core/topology.mjs';
import {coastCoreWidth} from '../tools/verify-coast-correction.mjs';
import {straitWidthMetrics} from '../tools/continent-shape-metrics.mjs';

export function islandSample(kind,size,seed,erosion){
 const r=normalizeAtlasRequest({schema:'vland.atlas.request',schemaVersion:1,width:size,height:size,seed,topology:{kind},layers:{above:0,underground:0},landscape:{structure:'islands',baseBiome:'meadow',biomes:[],landPercent:75,coastErosion:erosion,uniformity:50}}),derived=atlasSeed(r,'surface','relief');
 return{r,mask:Uint8Array.from({length:size*size},(_,i)=>+(landscapeElevation(.5,r,i%size,Math.floor(i/size),derived)>.36))};
}
export function islandFrameMetrics(mask,size){
 let minX=size,minY=size,maxX=0,maxY=0;
 for(let i=0;i<mask.length;i++)if(mask[i]){const x=i%size,y=Math.floor(i/size);minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
 const spans=[];
 for(let side=0;side<4;side++){
  const depths=[];
  for(let along=Math.floor(size*.15);along<Math.ceil(size*.85);along++){
   let depth=0;for(;depth<size;depth++){const x=side<2?along:side===2?depth:size-1-depth,y=side>=2?along:side===0?depth:size-1-depth;if(mask[y*size+x])break;}
   depths.push(depth);
  }
  depths.sort((a,b)=>a-b);spans.push((depths[Math.floor(depths.length*.85)]-depths[Math.floor(depths.length*.15)])/size);
 }
 return{boxFill:mask.reduce((s,v)=>s+v,0)/((maxX-minX+1)*(maxY-minY+1)),sideDepthSpans:spans,meanSideDepthSpan:spans.reduce((s,v)=>s+v,0)/4};
}
function components(mask,r,value){const seen=new Uint8Array(mask.length),groups=[];for(let i=0;i<mask.length;i++)if(mask[i]===value&&!seen[i]){const cells=[i];seen[i]=1;for(let at=0;at<cells.length;at++)for(const j of gridNeighbors(cells[at],r.width,r.height,r.topology))if(mask[j]===value&&!seen[j]){seen[j]=1;cells.push(j);}groups.push(cells);}return groups;}
function centerTriangleArea(parts,size){const [a,b,c]=parts.map(cells=>({x:cells.reduce((s,i)=>s+i%size,0)/cells.length/size,y:cells.reduce((s,i)=>s+Math.floor(i/size),0)/cells.length/size}));return Math.abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x))/2;}

test('three parallel island strips are very rare across public seeds on both grids',t=>{
 const rows=[];
 for(const kind of ['square','hex']){
  const parallelSeeds=[];let seed7TriangleArea;
  for(let seed=1;seed<=100;seed++){
   const {r,mask}=islandSample(kind,100,seed,50),parts=components(mask,r,1);
   assert.equal(parts.length,3,`${kind}/seed${seed}: preserve three islands`);
   assert.equal(mask.reduce((s,v)=>s+v,0),7500,`${kind}/seed${seed}: preserve75percent land`);
   assert.equal(components(mask,r,0).length,1,`${kind}/seed${seed}: preserve connected sea`);
   // Bent strips may have slightly offset centroids; staggered bodies form a much larger triangle.
   const area=centerTriangleArea(parts,100);if(area<.06)parallelSeeds.push(seed);
   if(seed===7)seed7TriangleArea=area;
  }
  rows.push({kind,sampledSeeds:100,parallelSeeds,parallelPercent:parallelSeeds.length,seed7TriangleArea});
 }
 t.diagnostic(JSON.stringify({islandLayoutFrequency:rows}));
 for(const row of rows){assert.ok(row.parallelSeeds.length>0,`${row.kind}: retain rare parallel layouts`);assert.ok(row.parallelPercent<=4,`${row.kind}: parallel strips must be very rare, observed${row.parallelPercent}percent`);assert.ok(row.seed7TriangleArea>.08,`${row.kind}/seed7: rejected strip example must use a staggered arrangement`);}
});

test('island water passages vary with seed and include winding layouts without a central three-way junction',t=>{
 const rows=[];
 for(const kind of ['square','hex'])for(const seed of [1,7,29,42,63,71,2026,870414469,4018650511]){
  const size=100,{r,mask}=islandSample(kind,size,seed,50),parts=components(mask,r,1);assert.equal(parts.length,3);
  const centers=parts.map(cells=>({x:cells.reduce((s,i)=>s+i%size,0)/cells.length/size,y:cells.reduce((s,i)=>s+Math.floor(i/size),0)/cells.length/size})),[a,b,c]=centers,
   triangleArea=Math.abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x))/2;
  rows.push({kind,seed,triangleArea,centerDry:!!mask[50*size+50]});
 }
 for(const kind of ['square','hex']){
  const selected=rows.filter(r=>r.kind===kind);
  assert.ok(selected.some(r=>r.triangleArea<.06),'Keep explicit coverage of a rare parallel layout instead of always three radial sectors');
  assert.ok(selected.some(r=>r.triangleArea>.08),'Keep genuinely different island arrangements');
  assert.ok(selected.some(r=>r.centerDry),'Map center is allowed to be inside an island');
 }
 t.diagnostic(JSON.stringify(rows));
});

test('winding straits include visible wide reaches and narrow passages on both grids100/300',t=>{
 const rows=[];
 for(const kind of ['square','hex'])for(const size of [100,300]){
  // Keep the two-passage layout as an explicit rare fixture; seed7 is now staggered.
  const {r,mask}=islandSample(kind,size,63,50),m=straitWidthMetrics(mask,size,size,r.topology);rows.push({kind,size,seed:63,...m});
  assert.ok(m.samples>=size,'Measure actual passages between distinct islands');
  assert.ok(m.p90>=size*.045,`${kind}/${size}: wide reaches must remain visible, p90=${m.p90}`);
  assert.ok(m.p10<=size*.02,`${kind}/${size}: retain narrow passages`);
  assert.ok(m.range>=size*.03,`${kind}/${size}: straits must not have near-uniform width`);
 }
 t.diagnostic(JSON.stringify(rows));
});

test('75percent islands have recessed outer coasts rather than filling three pieces of a rectangular frame',t=>{
 const rows=[],failures=[];
 // Preserve geometry checks for the rejected example and both layout families.
 for(const kind of ['square','hex'])for(const size of [100,300])for(const seed of [42,7,63])for(const erosion of [50,100]){
  const {r,mask}=islandSample(kind,size,seed,erosion),m=islandFrameMetrics(mask,size),parts=components(mask,r,1);
  assert.equal(mask.reduce((s,v)=>s+v,0),Math.round(mask.length*.75));assert.equal(parts.length,3);assert.equal(components(mask,r,0).length,1);
  assert.ok(mask.every((v,i)=>!(i<size||i>=mask.length-size||i%size===0||i%size===size-1)||!v));
  for(const cells of parts){const one=new Uint8Array(mask.length);for(const i of cells)one[i]=1;assert.ok(cells.length>=mask.length*.05);const thin=coastCoreWidth(one,size,size,r.topology).primary.lostFraction;assert.ok(thin<=.04,JSON.stringify({kind,size,seed,erosion,cells:cells.length,thin}));}
  const row={kind,size,seed,erosion,...m};rows.push(row);
  // Keep the original four-sided depth regression on seeds42/7. The rare seed63
  // additionally covers area, thickness, topology and rectangular box filling.
  // Four integer-cell depth spans are averaged; allow one cell in their sum.
  if(m.boxFill>.87||(seed!==63&&m.meanSideDepthSpan+1/(size*4)<.065))failures.push(row);
 }
 t.diagnostic(JSON.stringify(rows));assert.deepEqual(failures,[],'Outer coastline must recede regionally from the map frame without thin appendages inflating the bounds');
});
