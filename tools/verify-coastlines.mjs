// Synthetic shore geometry QA. Metrics use regional downsampled silhouettes,
// connected exterior sea and convex-hull deficits, not raw pixel perimeter.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';
import {normalizeAtlasRequest} from '../engine/api/atlas-catalog.mjs';
import {atlasSeed} from '../engine/core/atlas-landforms.mjs';
import {landscapeElevation} from '../engine/core/landscape-profile.mjs';
import {gridNeighbors} from '../engine/core/topology.mjs';
import {rasterizeLayer,encodePNG} from '../app/raster.mjs';

const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
function hull(points){
 points.sort((a,b)=>a.x-b.x||a.y-b.y);const halves=[];
 for(const list of [points,[...points].reverse()]){const edge=[];for(const p of list){while(edge.length>1&&cross(edge.at(-2),edge.at(-1),p)<=0)edge.pop();edge.push(p);}edge.pop();halves.push(edge);}
 return halves.flat();
}
function polygonArea(points){let area=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];area+=a.x*b.y-a.y*b.x;}return Math.abs(area)/2;}
const segmentDistance=(p,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);};
function inside(p,polygon){for(let i=0;i<polygon.length;i++)if(cross(polygon[i],polygon[(i+1)%polygon.length],p)<-1e-8)return false;return true;}
function groups(mask,w,h,topology){
 const seen=new Uint8Array(mask.length),out=[];
 for(let i=0;i<mask.length;i++)if(mask[i]&&!seen[i]){const q=[i];seen[i]=1;for(let at=0;at<q.length;at++)for(const j of gridNeighbors(q[at],w,h,topology))if(mask[j]&&!seen[j]){seen[j]=1;q.push(j);}out.push(q);}
 return out.sort((a,b)=>b.length-a.length);
}
function exteriorSea(mask,w,h){
 const sea=new Uint8Array(mask.length),q=[];for(let i=0;i<mask.length;i++)if(!mask[i]&&(i<w||i>=mask.length-w||i%w===0||i%w===w-1)){sea[i]=1;q.push(i);}
 for(let at=0;at<q.length;at++)for(const j of gridNeighbors(q[at],w,h,{kind:'square'}))if(!mask[j]&&!sea[j]){sea[j]=1;q.push(j);}return sea;
}
function coarseMask(mask,w,h,factor,topology){
 // Sample in physical coordinates so odd-r row offsets do not become spurious
 // coastline oscillations. A majority over the source block removes pixel noise.
 const hex=topology?.kind==='hex',dy=hex?Math.sqrt(3)/2:1,step=factor,cw=Math.ceil((w+(hex?.5:0))/step),ch=Math.ceil(h*dy/step),result=new Uint8Array(cw*ch);
 for(let y=0;y<ch;y++)for(let x=0;x<cw;x++){let land=0,total=0;const y0=Math.floor(y*step/dy),y1=Math.min(h,Math.ceil((y+1)*step/dy));for(let yy=y0;yy<y1;yy++){const offset=hex?(yy&1)*.5:0,x0=Math.max(0,Math.floor(x*step-offset)),x1=Math.min(w,Math.ceil((x+1)*step-offset));for(let xx=x0;xx<x1;xx++){total++;land+=mask[yy*w+xx];}}result[y*cw+x]=land>total/2?1:0;}
 return{mask:result,width:cw,height:ch};
}
function scaleMetrics(mask,w,h){
 const sea=exteriorSea(mask,w,h),components=groups(mask,w,h,{kind:'square'}),reports=[];
 for(const cells of components){
  if(cells.length<4)continue;
  const corners=[];let sx=0,sy=0;for(const i of cells){const x=i%w,y=Math.floor(i/w);sx+=x+.5;sy+=y+.5;if(gridNeighbors(i,w,h,{kind:'square'}).length<4||gridNeighbors(i,w,h,{kind:'square'}).some(j=>!mask[j]))corners.push({x,y},{x:x+1,y},{x:x+1,y:y+1},{x,y:y+1});}
  const polygon=hull(corners),area=polygonArea(polygon),hullCoastLength=polygon.reduce((sum,a,i)=>{const b=polygon[(i+1)%polygon.length],mapEdge=a.x===b.x&&(a.x===0||a.x===w)||a.y===b.y&&(a.y===0||a.y===h);return sum+(mapEdge?0:Math.hypot(a.x-b.x,a.y-b.y));},0),cx=sx/cells.length,cy=sy/cells.length;
  let xx=0,yy=0,xy=0;for(const i of cells){const x=i%w+.5-cx,y=Math.floor(i/w)+.5-cy;xx+=x*x;yy+=y*y;xy+=x*y;}const delta=Math.hypot(xx-yy,2*xy),elongation=Math.sqrt((xx+yy+delta)/Math.max(1e-9,xx+yy-delta));
  const gap=new Uint8Array(mask.length),depth=new Float64Array(mask.length),threshold=.06*Math.sqrt(cells.length),xs=polygon.map(p=>p.x),ys=polygon.map(p=>p.y),x0=Math.max(0,Math.floor(Math.min(...xs))),x1=Math.min(w-1,Math.ceil(Math.max(...xs))),y0=Math.max(0,Math.floor(Math.min(...ys))),y1=Math.min(h-1,Math.ceil(Math.max(...ys)));let deepBayArea=0;
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const i=y*w+x,p={x:x+.5,y:y+.5};if(!sea[i]||!inside(p,polygon))continue;gap[i]=1;let nearest=Infinity;for(let k=0;k<polygon.length;k++)nearest=Math.min(nearest,segmentDistance(p,polygon[k],polygon[(k+1)%polygon.length]));depth[i]=nearest;if(nearest>=threshold)deepBayArea++;}
  const bays=groups(gap,w,h,{kind:'square'}).filter(c=>c.length>=Math.max(2,area*.005)&&c.some(i=>depth[i]>=threshold));
  // Crofton estimate over four directions is less orientation-dependent than
  // counting horizontal/vertical pixel edges alone.
  const owned=new Uint8Array(mask.length);for(const i of cells)owned[i]=1;let axial=0,diagonal=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const v=owned[y*w+x];if(x+1<w)axial+=+(v!==owned[y*w+x+1]);if(y+1<h)axial+=+(v!==owned[(y+1)*w+x]);if(x+1<w&&y+1<h)diagonal+=+(v!==owned[(y+1)*w+x+1]) + +(owned[y*w+x+1]!==owned[(y+1)*w+x]);}
  const coastLength=Math.PI/8*(axial+diagonal/Math.sqrt(2));reports.push({area:cells.length,hullArea:area,concavity:Math.max(0,1-cells.length/area),deepBayFraction:deepBayArea/area,regionalBays:bays.length,elongation,coastLength,hullCoastLength,coastToHull:coastLength/Math.max(1,hullCoastLength)});
 }
 const total=reports.reduce((s,r)=>s+r.area,0),mean=key=>reports.reduce((s,r)=>s+r[key]*r.area,0)/(total||1);
 return{components:components.length,landCells:mask.reduce((a,b)=>a+b,0),concavity:mean('concavity'),deepBayFraction:mean('deepBayFraction'),regionalBays:reports.reduce((s,r)=>s+r.regionalBays,0),elongation:mean('elongation'),coastToHull:mean('coastToHull'),reports};
}
export function coastlineMetrics(mask,{width,height,topology={kind:'square'}}){
 const native=groups(mask,width,height,topology),scales={};for(const factor of [2,4]){const c=coarseMask(mask,width,height,factor,topology);scales[factor]={width:c.width,height:c.height,...scaleMetrics(c.mask,c.width,c.height)};}
 return{nativeComponents:native.length,nativeLandCells:native.reduce((n,c)=>n+c.length,0),smallestComponent:native.at(-1)?.length??0,seaFrame:mask.every((v,i)=>i>=width&&i<mask.length-width&&i%width!==0&&i%width!==width-1||!v),scales};
}
const median=values=>{const a=[...values].sort((x,y)=>x-y),middle=Math.floor(a.length/2);return a.length?a.length%2?a[middle]:(a[middle-1]+a[middle])/2:0;};
// These population gates were agreed from the BEFORE matrix, before inspecting
// the AFTER output. Holdouts use the same gates and are reported separately.
export function coastlineQuality(rows){
 const checks=[];
 for(const factor of [2,4]){
  const eligible=rows.filter(r=>r.size>=100),coasts=eligible.filter(r=>r.structure==='coast').map(r=>r.scales[factor]),continents=eligible.filter(r=>r.structure==='continent').map(r=>r.scales[factor]),islands=eligible.filter(r=>r.structure==='islands').flatMap(r=>r.scales[factor].reports);
  if(!coasts.length||!continents.length||!islands.length)return{passes:false,reason:'Incomplete quality population',checks};
  for(const [name,observed,min]of [['coastMedianRegionalBays',median(coasts.map(r=>r.regionalBays)),2],['continentMedianDeepBayFraction',median(continents.map(r=>r.deepBayFraction)),.04],['continentMedianRegionalBays',median(continents.map(r=>r.regionalBays)),3],['islandComponentsWithRegionalBay',islands.filter(r=>r.regionalBays>=1&&r.deepBayFraction>=.02).length/islands.length,.75]])checks.push({factor,name,observed,min,pass:observed>=min});
 }
 return{passes:checks.every(c=>c.pass),checks};
}

export async function verifyCoastlines(){
 const root=fileURLToPath(new URL('../',import.meta.url)),phase=process.argv.find(a=>a.startsWith('--phase='))?.slice(8)??'before',rescore=process.argv.includes('--rescore');assert.ok(['before','after'].includes(phase));
 const artifact=s=>path.join(root,'evidence','coastlines-'+phase+'-'+s),rows=[],images=[],started=new Date().toISOString();
 let samples=[];
 if(rescore)samples=JSON.parse(gunzipSync(await readFile(artifact('masks.json.gz'))).toString('utf8')).samples;
 else{
  for(const kind of ['square','hex'])for(const size of [50,100,200,300])for(const structure of ['coast','islands','continent'])for(const seed of [7,42,2026,...(phase==='after'&&[100,300].includes(size)?[0,1,29,71]:[])]){
   const r=normalizeAtlasRequest({schema:'vland.atlas.request',schemaVersion:1,width:size,height:size,seed,topology:{kind},layers:{above:0,underground:0},landscape:{structure,baseBiome:'meadow',biomes:[]}}),derivedSeed=atlasSeed(r,'surface','relief'),start=performance.now(),values=Array.from({length:size*size},(_,i)=>landscapeElevation(.35,r,i%size,Math.floor(i/size),derivedSeed)),mask=Uint8Array.from(values,v=>+(v>.36));
   samples.push({kind,size,structure,seed,derivedSeed,holdout:[0,1,29,71].includes(seed),geometryMs:Math.round(performance.now()-start),mask:Buffer.from(mask).toString('base64')});
   console.log(JSON.stringify({phase,captured:samples.length,total:phase==='after'?120:72,kind,size,structure,seed}));
  }
  await writeFile(artifact('masks.json.gz'),gzipSync(JSON.stringify({started,samples})));
 }
 // Preserve the baseline masks before scoring. Subsequent metric refinements
 // use --rescore without re-running or retaining historical production code.
 for(const s of samples){
  const mask=new Uint8Array(Buffer.from(s.mask,'base64')),metrics=coastlineMetrics(mask,{width:s.size,height:s.size,topology:{kind:s.kind}});assert.equal(metrics.nativeComponents,s.structure==='islands'?3:1);assert.ok(metrics.smallestComponent>=3);if(s.structure!=='coast')assert.ok(metrics.seaFrame);assert.ok(s.size*s.size<=98304);
  const fraction=metrics.nativeLandCells/(s.size*s.size),smallestFraction=metrics.smallestComponent/(s.size*s.size);
  if(s.size>=50){
   if(s.structure==='continent')assert.ok(fraction>=.39&&fraction<=.51,'Continent usable area '+fraction);
   if(s.structure==='islands'){assert.ok(fraction>=.08,'Islands total usable area '+fraction);assert.ok(smallestFraction>=.01,'Each island usable area '+smallestFraction);}
   if(s.structure==='coast')assert.ok(fraction>=.30&&fraction<=.75,'Coast usable area '+fraction);
  }
  const {mask:discard,...meta}=s;rows.push({...meta,...metrics});
  if(s.seed===42&&(s.size===50||s.size===300)||s.holdout&&s.size===300){
   const layer={width:s.size,height:s.size,topology:{kind:s.kind},solid:Array(mask.length).fill(0),material:Array.from(mask,v=>v?'grass':'sea'),biome:Array.from(mask,v=>v?'plains':'ocean'),water:Array.from(mask,v=>v?'none':'sea'),traits:Array(mask.length).fill('normal')},name=s.kind+'-'+s.size+'-'+s.structure+(s.holdout?'-seed'+s.seed:'')+'.png';
   await writeFile(artifact(name),encodePNG(rasterizeLayer(layer,{channel:'biome',scale:s.holdout?1:2,transparent:false})));images.push({file:'coastlines-'+phase+'-'+name,...meta});
  }
 }
 const quality=coastlineQuality(rows.filter(r=>!r.holdout)),holdoutQuality=phase==='after'?coastlineQuality(rows.filter(r=>r.holdout)):null;
 const enforcingQuality=phase==='after'||process.argv.includes('--check-quality');
 const result={ok:!enforcingQuality||quality.passes&&(!holdoutQuality||holdoutQuality.passes),phase,started,finished:new Date().toISOString(),matrix:rows.length,geometryOnly:true,actualProviderDerivedSeeds:true,publicSeeds:[7,42,2026],holdoutSeeds:phase==='after'?[0,1,29,71]:[],coarseFactors:[2,4],pixelPerimeterGate:false,physicalAreaGates:{minimumSize:50,continent:[.39,.51],coast:[.30,.75],islandsTotalMinimum:.08,eachIslandMinimum:.01},quality,holdoutQuality,rows,images};
 await writeFile(artifact('metrics.json'),JSON.stringify(result,null,2)+'\n','utf8');
 if(phase==='after'){
  const before=JSON.parse(await readFile(path.join(root,'evidence','coastlines-before-metrics.json'),'utf8')),comparison=[];
  for(const structure of ['coast','islands','continent'])for(const factor of [2,4]){
   const select=data=>data.rows.filter(r=>!r.holdout&&r.size>=100&&r.structure===structure).map(r=>r.scales[factor]);
   const a=select(before),b=select(result),stats=data=>({medianConcavity:median(data.map(r=>r.concavity)),medianDeepBayFraction:median(data.map(r=>r.deepBayFraction)),medianRegionalBays:median(data.map(r=>r.regionalBays)),medianElongation:median(data.map(r=>r.elongation))});
   comparison.push({structure,factor,before:stats(a),after:stats(b)});
  }
  await writeFile(path.join(root,'evidence','coastlines-comparison.json'),JSON.stringify({matchedPublicSeeds:true,beforeMasksRegenerated:false,population:72,holdoutsSeparatelyReported:true,comparison},null,2)+'\n','utf8');
  const pairs=images.filter(i=>!i.holdout).map(i=>'<article><h2>'+i.kind+' '+i.size+' '+i.structure+' · seed'+i.seed+'</h2><div><figure><figcaption>До</figcaption><img src="'+i.file.replace('coastlines-after-','coastlines-before-')+'" alt="До"></figure><figure><figcaption>После</figcaption><img src="'+i.file+'" alt="После"></figure></div></article>');
  const paired='<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Берега: до и после</title><style>body{background:#101a1e;color:#def;font:14px system-ui;margin:18px}main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px;max-width:1600px}article div{display:grid;grid-template-columns:1fr 1fr;gap:10px}figure{margin:0}img{width:100%;image-rendering:pixelated}h2{font-size:16px}@media(max-width:800px){main{grid-template-columns:1fr}}</style><h1>Чистые береговые маски: до и после</h1><p>Одинаковые реальные provider-derived seed; сохранённый baseline до изменения движка. Метрики не заменяют оценку формы.</p><main>'+pairs.join('')+'</main></html>';
  await writeFile(path.join(root,'evidence','coastlines-comparison.html'),paired,'utf8');
 }
 const html='<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Берега '+phase+'</title><style>body{background:#101a1e;color:#def;font:14px system-ui}section{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:15px;max-width:1350px}figure{margin:0}img{width:100%;image-rendering:pixelated}figcaption{padding:8px}</style><h1>Береговая геометрия '+phase+'</h1><p>Чистые маски суши и внешнего моря; без рельефа, биомов и гидрологии. Production-derived surface seeds; контрольные seed0/1/29/71 не участвовали в выборе порогов.</p><section>'+images.map(i=>'<figure><figcaption>'+i.kind+' '+i.size+' '+i.structure+' · seed'+i.seed+(i.holdout?' · holdout':'')+'</figcaption><img src="'+i.file+'" alt="'+i.kind+' '+i.size+' '+i.structure+'"></figure>').join('')+'</section></html>';
 await writeFile(artifact('preview.html'),html,'utf8');console.log(JSON.stringify({ok:result.ok,phase,matrix:rows.length,images:images.length,quality,holdoutQuality}));if(enforcingQuality)assert.ok(quality.passes&&(!holdoutQuality||holdoutQuality.passes),'Independent regional coastline quality gates failed');return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await verifyCoastlines();
