import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRecipe} from '../app/index.mjs';
import {normalizeAtlasRequest} from '../engine/api/atlas-catalog.mjs';
import {atlasSeed} from '../engine/core/atlas-landforms.mjs';
import {landscapeElevation,landscapeBiome,normalizeLandscapeProfile,LANDSCAPE_BIOMES} from '../engine/core/landscape-profile.mjs';
import {gridNeighbors} from '../engine/core/topology.mjs';

const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
function hull(points){points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);const lower=[],upper=[];for(const p of points){while(lower.length>=2&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p);}for(let i=points.length-1;i>=0;i--){const p=points[i];while(upper.length>=2&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p);}return lower.slice(0,-1).concat(upper.slice(0,-1));}
const polygonArea=p=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-a[1]*b[0];},0))/2;
function measure(r,shapeSeed=r.seed){
 const {width:w,height:h}=r,n=w*h,values=Array.from({length:n},(_,i)=>landscapeElevation(.5,r,i%w,Math.floor(i/w),shapeSeed)),land=Uint8Array.from(values,v=>+(v>.36)),seen=new Uint8Array(n),sea=new Uint8Array(n),q=[];
 for(let i=0;i<n;i++)if(!land[i]&&(i<w||i>=n-w||i%w===0||i%w===w-1)){sea[i]=1;q.push(i);}
 for(let k=0;k<q.length;k++)for(const j of gridNeighbors(q[k],w,h,r.topology))if(!land[j]&&!sea[j]){sea[j]=1;q.push(j);}
 const position=i=>[i%w+(r.topology.kind==='hex'?(Math.floor(i/w)&1)*.5:0),Math.floor(i/w)],corners=r.topology.kind==='hex'?[[0,-2/3],[.5,-1/3],[.5,1/3],[0,2/3],[-.5,1/3],[-.5,-1/3]]:[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]],parts=[];
 for(let i=0;i<n;i++)if(land[i]&&!seen[i]){
  const cells=[i],points=[];seen[i]=1;let minx=w,maxx=0,miny=h,maxy=0,sx=0,sy=0,xx=0,yy=0,xy=0;
  for(let k=0;k<cells.length;k++){const j=cells[k],ns=gridNeighbors(j,w,h,r.topology),p=position(j);sx+=p[0];sy+=p[1];xx+=p[0]*p[0];yy+=p[1]*p[1];xy+=p[0]*p[1];minx=Math.min(minx,p[0]);maxx=Math.max(maxx,p[0]);miny=Math.min(miny,p[1]);maxy=Math.max(maxy,p[1]);for(const z of ns)if(land[z]&&!seen[z]){seen[z]=1;cells.push(z);}if(ns.some(z=>!land[z]))for(const c of corners)points.push([p[0]+c[0],p[1]+c[1]]);}
  const polygon=hull(points);let bayDepth=0;
  for(let y=Math.floor(miny);y<=maxy;y++)for(let x=Math.floor(minx);x<=maxx;x++){const j=y*w+x;if(!sea[j])continue;const p=position(j);let depth=Infinity;for(let k=0;k<polygon.length;k++){const a=polygon[k],b=polygon[(k+1)%polygon.length],d=cross(a,b,p)/Math.hypot(b[0]-a[0],b[1]-a[1]);if(d<0){depth=-1;break;}depth=Math.min(depth,d);}bayDepth=Math.max(bayDepth,depth);}
  const vx=xx/cells.length-(sx/cells.length)**2,vy=yy/cells.length-(sy/cells.length)**2,covariance=xy/cells.length-sx*sy/cells.length**2,difference=Math.hypot(vx-vy,2*covariance);
  parts.push({center:[sx/cells.length/w,sy/cells.length/h],cells:cells.length,bayDepth,hullDeficit:1-cells.length/polygonArea(polygon),aspect:(maxx-minx+1)/(maxy-miny+1),elongation:Math.sqrt((vx+vy+difference)/(vx+vy-difference))});
 }
 return{values,parts};
}

test('landscape biome cards normalize strictly, immutably and preserve stable repeated-card order',()=>{
 const value={structure:'continent',baseBiome:'meadow',landPercent:75,uniformity:50,coastErosion:50,biomes:[{id:'v',type:'volcanic',percent:10},{id:'f',type:'forest',percent:20},{id:'f2',type:'forest',percent:15}]},before=structuredClone(value);
 assert.deepEqual(normalizeLandscapeProfile(value),value);assert.deepEqual(normalizeLandscapeProfile(normalizeLandscapeProfile(value)),value);assert.deepEqual(value,before);assert.deepEqual(normalizeLandscapeProfile({structure:'land',baseBiome:'desert'}),{structure:'land',baseBiome:'desert',biomes:[],landPercent:75,uniformity:50,coastErosion:50});
 for(const biomes of [null,{},'forest',[{id:'x',type:'unknown',percent:1}],[{id:'x',type:'forest',percent:100.1}],[{id:'x',type:'forest',percent:1},{id:'x',type:'forest',percent:1}],Array(1)])assert.throws(()=>normalizeLandscapeProfile({...value,biomes}));
});

test('explicit local landscape biome identity retains water and steep-slope exceptions',()=>{
 const r={landscape:{baseBiome:'meadow'}},f={waterType:['none'],elevation:[.58],slope:[.01]};assert.equal(landscapeBiome(f,0,r,'desert'),'desert');assert.equal(landscapeBiome(f,0,r,'snow'),'snow');assert.equal(landscapeBiome(f,0,r,'volcanic'),'volcanic');assert.equal(landscapeBiome(f,0,r),'plains');f.waterType[0]='river';assert.equal(landscapeBiome(f,0,r,'desert'),'river');f.waterType[0]='none';f.slope[0]=.2;assert.equal(landscapeBiome(f,0,r,'desert'),'cliffs');
});

test('requested maximum erosion adds resolved sea-connected bays at50 and300 on both grids',t=>{
 // Smooth zero erosion is intentional; mandatory deep bays at default50
 // belonged to the superseded branching-island shape (SEA_EROSION_PLAN).
 const rows=[];
 for(const size of [50,300])for(const kind of ['square','hex'])for(const structure of ['islands','continent']){
  const r={width:size,height:size,seed:42,topology:{kind},landscape:{structure,baseBiome:'meadow',landPercent:structure==='islands'?25:45}},levels=[];
  for(const coastErosion of [0,100]){
   const m=measure({...r,landscape:{...r.landscape,coastErosion}});assert.equal(m.parts.length,structure==='islands'?3:1);assert.equal(m.parts.reduce((sum,p)=>sum+p.cells,0),size*size*r.landscape.landPercent/100);
   levels.push(Math.max(...m.parts.map(p=>p.bayDepth)));
  }
  const row={size,kind,structure,zeroBayDepth:levels[0],highBayDepth:levels[1]};rows.push(row);
  assert.ok(levels[1]>=size/25,JSON.stringify(row)+' maximum erosion retains the resolved2/12-cell sea-connected bay');assert.ok(levels[1]>levels[0],JSON.stringify(row)+' erosion must deepen the inlet relative to zero');
 }
 t.diagnostic(JSON.stringify(rows));
});

test('irregular shapes preserve topology, determinism and bounded 300 preparation for all requested scales',t=>{
 const rows=[];for(const size of [50,100,200,300])for(const kind of ['square','hex'])for(const structure of ['islands','continent','coast']){
  const r={width:size,height:size,seed:7,topology:{kind},landscape:{structure,baseBiome:'meadow'}},before=structuredClone(r),start=performance.now(),a=Array.from({length:size*size},(_,i)=>landscapeElevation(.5,r,i%size,Math.floor(i/size))),elapsedMs=Math.round(performance.now()-start);assert.ok(a.every(Number.isFinite));assert.deepEqual(r,before);assert.deepEqual(a,Array.from({length:size*size},(_,i)=>landscapeElevation(.5,r,i%size,Math.floor(i/size))));assert.ok(elapsedMs<45000);rows.push({size,kind,structure,elapsedMs});
  const seen=new Uint8Array(a.length),groups=[];for(let i=0;i<a.length;i++)if(a[i]>.36&&!seen[i]){const q=[i];seen[i]=1;for(let k=0;k<q.length;k++)for(const j of gridNeighbors(q[k],size,size,r.topology))if(a[j]>.36&&!seen[j]){seen[j]=1;q.push(j);}groups.push(q.length);}
  assert.equal(groups.length,structure==='islands'?3:1);assert.ok(groups.every(count=>count>=3));const edges=[a.slice(0,size),a.slice(-size),a.filter((_,i)=>i%size===0),a.filter((_,i)=>i%size===size-1)],dry=edge=>edge.every(v=>v>.36),sea=edge=>edge.every(v=>v<.36);
  if(structure==='coast')assert.ok(dry(edges[0])&&sea(edges[1])||sea(edges[0])&&dry(edges[1])||dry(edges[2])&&sea(edges[3])||sea(edges[2])&&dry(edges[3]));else assert.ok(edges.every(sea));if(structure==='continent')assert.ok(groups[0]>a.length*.3);
 }
 t.diagnostic(JSON.stringify(rows));
});

test('actual app seeds preserve staggered island arrangements across both grids',async t=>{
 const rows=[];for(const seed of [42,7])for(const mode of ['landscape','hexlandscape']){
  const recipe=await createRecipe(mode);Object.assign(recipe.generation,{width:300,height:300,layers:{above:0,underground:0},landscape:{structure:'islands',baseBiome:'forest',landPercent:25,uniformity:50,coastErosion:50,biomes:[{id:'m',type:'meadow',percent:20},{id:'s',type:'swamp',percent:10},{id:'h',type:'mountains',percent:20}]}});
  const r=normalizeAtlasRequest({schema:'vland.atlas.request',schemaVersion:1,seed,...recipe.generation}),shapeSeed=atlasSeed(r,'surface','relief'),m=measure(r,shapeSeed);assert.equal(m.parts.length,3);assert.equal(m.parts.reduce((sum,p)=>sum+p.cells,0),22500);const [a,b,c]=m.parts.map(p=>p.center),triangleArea=Math.abs(cross(a,b,c))/2;rows.push({mode,seed,shapeSeed,triangleArea,elongation:m.parts.map(p=>p.elongation)});
 }
 // Use the accepted non-collinear layout bound from island-natural-shape.
 // The later rare-strip correction does not require an elongated body in every seed.
 t.diagnostic(JSON.stringify(rows));for(const row of rows)assert.ok(row.triangleArea>.08,JSON.stringify(row)+' seeds42/7 must use staggered bodies; visual acceptance remains separate');
});

test('coastline silhouettes stay deterministic under explicit coverage, including feasible16-cell islands',()=>{
 const cases=[['square','islands',16,'6e0152459a0293ae008aa8fe60fd3e840907b2023c205fedee773adf36cd29b9'],['square','islands',50,'208f536ee8a989b41a9a62aa66c976d64b21c001212373faac8fbc1c8d47ad04'],['square','coast',300,'7219749acf1a8515dc20a86f4c819eed95e9d3c82317b541ce8164f9b63fb146'],['square','continent',300,'692a87d09be836070a7ddd2809c10b430657456290c09f7118e7b8f3ab79f5ad'],['hex','islands',16,'14eeb98962bf476bf477ffa1de6b65b88c7afa2de942828580a33c95fa2612f1'],['hex','islands',50,'63687606b9a80a5212a67131fd958aa843d3a865dda37655480f27f5f7aadb03'],['hex','coast',300,'26bfa4545e38743a4c729fa59c7114de84046a0fea7e2d978470a14e36b160ac'],['hex','continent',300,'91872a755ee1aab68ff3b183b53c77a52df9f54ee046e7f29d25307331d59439']];
 // Pins follow the current reviewed coast/island geometry; quotas and components
 // are checked independently so a hash update cannot hide a topology regression.
 for(const [kind,structure,size,expected]of cases){const r={width:size,height:size,seed:42,topology:{kind},landscape:{structure,baseBiome:'forest',landPercent:size===16?25:75,uniformity:50,coastErosion:50}},a=Array.from({length:size*size},(_,i)=>landscapeElevation(.5,r,i%size,Math.floor(i/size),93344066));assert.equal(createHash('sha256').update(JSON.stringify(a.map(value=>value>.36))).digest('hex'),expected,[kind,structure,size].join('/'));const m=measure(r,93344066);assert.equal(m.parts.length,structure==='islands'?3:1);assert.equal(m.parts.reduce((sum,p)=>sum+p.cells,0),size*size*r.landscape.landPercent/100);}
});
