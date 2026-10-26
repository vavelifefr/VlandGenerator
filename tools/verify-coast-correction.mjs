// Coast-only regression after user rejected repetitive thin parallel horns.
// No fixture/project/session inputs. Before masks were captured by engine QA.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {gzipSync} from 'node:zlib';
import {normalizeAtlasRequest} from '../engine/api/atlas-catalog.mjs';
import {atlasSeed} from '../engine/core/atlas-landforms.mjs';
import {landscapeElevation} from '../engine/core/landscape-profile.mjs';
import {gridNeighbors} from '../engine/core/topology.mjs';
import {rasterizeLayer,encodePNG} from '../app/raster.mjs';
import {coastlineMetrics} from './verify-coastlines.mjs';
import {shoreReversals} from '../tests/helpers/coast-rhythm.mjs';

const publicSeeds=[7,42,2026],holdouts=[0,1,29,71],userSeeds=[870414469,4018650511,742339477,1501711120];
const root=fileURLToPath(new URL('../',import.meta.url)),artifact=name=>path.join(root,'evidence','coast-correction-'+name);
const specs=[...userSeeds.map(seed=>({width:80,height:64,seed,userCase:true})),...[100,128].map(size=>({width:size,height:size,seed:3275713831,userCase:true})),...[50,100,128,200,300].flatMap(size=>[...publicSeeds,...holdouts].map(seed=>({width:size,height:size,seed,holdout:holdouts.includes(seed)})))];
function seaComponents(mask,width,height,topology){
 const seen=new Uint8Array(mask.length);let components=0;
 for(let i=0;i<mask.length;i++)if(!mask[i]&&!seen[i]){components++;const queue=[i];seen[i]=1;for(let at=0;at<queue.length;at++)for(const j of gridNeighbors(queue[at],width,height,topology))if(!mask[j]&&!seen[j]){seen[j]=1;queue.push(j);}}
 return components;
}

export function coastCoreWidth(mask,width,height,topology={kind:'square'}){
 // Independent distance-transform implementation of erosion/reconstruction.
 // Dry map borders are not sea; graph adjacency is square or physical odd-r.
 const n=mask.length,distance=new Int32Array(n).fill(n),queue=[];
 for(let i=0;i<n;i++)if(!mask[i]){distance[i]=0;queue.push(i);}
 for(let at=0;at<queue.length;at++)for(const j of gridNeighbors(queue[at],width,height,topology))if(distance[j]>distance[queue[at]]+1){distance[j]=distance[queue[at]]+1;queue.push(j);}
 const land=mask.reduce((a,b)=>a+b,0),scales=[];
 for(const proportion of [.0235,.047,.07]){
  const radius=Math.max(2,Math.round(Math.min(width,height)*proportion)),fromCore=new Int32Array(n).fill(n),front=[];let core=0;
  for(let i=0;i<n;i++)if(mask[i]&&distance[i]>radius){fromCore[i]=0;front.push(i);core++;}
  for(let at=0;at<front.length;at++){const i=front[at];if(fromCore[i]>=radius)continue;for(const j of gridNeighbors(i,width,height,topology))if(mask[j]&&fromCore[j]>fromCore[i]+1){fromCore[j]=fromCore[i]+1;front.push(j);}}
  let lost=0;for(let i=0;i<n;i++)if(mask[i]&&fromCore[i]>radius)lost++;
  scales.push({proportion,radius,coreFraction:core/(land||1),lostFraction:lost/(land||1)});
 }
 return{landCells:land,scales,primary:scales[1]};
}
async function imageFile(sample,mask,before=false){
 const {kind,width,height,seed}=sample,n=width*height,layer={width,height,topology:{kind},solid:Array(n).fill(0),material:Array.from(mask,v=>v?'grass':'sea'),biome:Array.from(mask,v=>v?'plains':'ocean'),water:Array.from(mask,v=>v?'none':'sea'),traits:Array(n).fill('normal')},name=(before?'before80-':'shapes-')+kind+'-'+width+'x'+height+'-seed'+seed+'.png';
 await writeFile(artifact(name),encodePNG(rasterizeLayer(layer,{channel:'biome',scale:width===80?3:1,transparent:false})));return'coast-correction-'+name;
}
export async function verifyCoastCorrection({baselineOnly=false}={}){
 const started=new Date().toISOString(),before=JSON.parse(await readFile(path.join(root,'evidence','coast-natural-shore-before-masks.json'),'utf8')),beforeRows=[];
 for(const sample of before.rows){const mask=new Uint8Array(Buffer.from(sample.mask,'base64')),core=coastCoreWidth(mask,sample.width,sample.height,{kind:sample.kind});beforeRows.push({kind:sample.kind,width:sample.width,height:sample.height,seed:sample.seed,derivedSeed:sample.derivedSeed,...core,pass:core.primary.lostFraction<=.04,image:await imageFile(sample,mask,true)});}
 if(baselineOnly){const result={ok:beforeRows.every(r=>r.pass),geometryRegenerated:false,threshold:.04,rows:beforeRows};await writeFile(artifact('width-before.json'),JSON.stringify(result,null,2)+'\n','utf8');console.log(JSON.stringify(result));assert.ok(result.ok,'Stored rejected coast masks lose more than4% land at the agreed opening radius');return result;}
 const rows=[],samples=[],images=[];
 for(const kind of ['square','hex'])for(const spec of specs){
  const{width,height,seed}=spec,r=normalizeAtlasRequest({schema:'vland.atlas.request',schemaVersion:1,width,height,seed,topology:{kind},layers:{above:0,underground:0},landscape:{structure:'coast',baseBiome:'meadow',biomes:[]}}),derivedSeed=atlasSeed(r,'surface','relief'),start=performance.now(),mask=Uint8Array.from({length:width*height},(_,i)=>+(landscapeElevation(.35,r,i%width,Math.floor(i/width),derivedSeed)>.36)),geometryMs=Math.round(performance.now()-start),physical=coastlineMetrics(mask,{width,height,topology:r.topology}),core=coastCoreWidth(mask,width,height,r.topology),area=physical.nativeLandCells/(width*height);
  assert.equal(physical.nativeComponents,1,'Connected coast');assert.ok(area>=.30&&area<=.75,'Usable coast area');
  const edges=[Array.from(mask.subarray(0,width)),Array.from(mask.subarray(mask.length-width)),Array.from(mask).filter((_,i)=>i%width===0),Array.from(mask).filter((_,i)=>i%width===width-1)],dry=edge=>edge.every(Boolean),sea=edge=>edge.every(v=>!v);assert.ok(dry(edges[0])&&sea(edges[1])||sea(edges[0])&&dry(edges[1])||dry(edges[2])&&sea(edges[3])||sea(edges[2])&&dry(edges[3]),'Opposing dry and sea edges');
  const seaGroups=seaComponents(mask,width,height,r.topology),rhythm=shoreReversals(mask,width,height);assert.equal(seaGroups,1,'Connected external sea');
  const changed=structuredClone(r);changed.landscape.biomes=[{id:'forest-west',type:'forest',percent:25},{id:'forest-east',type:'forest',percent:15},{id:'mountains',type:'mountains',percent:20}];
  const repeat=normalizeAtlasRequest(changed),cardMask=Uint8Array.from({length:width*height},(_,i)=>+(landscapeElevation(.35,repeat,i%width,Math.floor(i/width),derivedSeed)>.36));assert.deepEqual(cardMask,mask,'Coast geometry independent from additional biome cards');
  const row={kind,...spec,derivedSeed,geometryMs,area,...physical,core,seaComponents:seaGroups,shoreTurns:rhythm.turns,shoreRange:rhythm.range,cardsIndependent:true,thinnessPass:core.primary.lostFraction<=.04,rhythmPass:rhythm.turns<=2};rows.push(row);samples.push({kind,...spec,derivedSeed,mask:Buffer.from(mask).toString('base64')});
  if(spec.userCase||seed===42||seed===29){row.image=await imageFile(row,mask);images.push(row.image);}
  console.log(JSON.stringify({kind,width,height,seed,done:rows.length,total:specs.length*2,thinLoss:core.primary.lostFraction,shoreTurns:rhythm.turns}));
 }
 const quality=[];for(const kind of ['square','hex'])for(const group of ['public','holdout','user']){const selected=rows.filter(r=>r.kind===kind&&(group==='user'?r.userCase:!r.userCase&&!!r.holdout===(group==='holdout')));quality.push({kind,group,cases:selected.length,maxShoreTurns:Math.max(...selected.map(r=>r.shoreTurns)),maxThinLoss:Math.max(...selected.map(r=>r.core.primary.lostFraction)),pass:selected.every(r=>r.thinnessPass&&r.rhythmPass)});}
 const result={ok:rows.every(r=>r.thinnessPass&&r.rhythmPass)&&quality.every(r=>r.pass),started,finished:new Date().toISOString(),geometryCases:rows.length,actualProviderDerivedSeeds:true,openingGate:{proportion:.047,maxLostFraction:.04,agreedBeforeCandidate:true},rhythmGate:{maxDominantTurns:2,prominence:.085,requestedByLatestUserCorrection:true},otherWidthScalesInformational:[.0235,.07],oldBayGatePreserved:false,oldBayGateReason:'Superseded by the explicit requirement for rare bays/capes rather than a repeated comb.',beforeRows,rows,quality,images};
 await writeFile(artifact('shape-masks.json.gz'),gzipSync(JSON.stringify({samples})));await writeFile(artifact('shapes.json'),JSON.stringify(result,null,2)+'\n','utf8');
 const pairs=beforeRows.map(b=>{const a=rows.find(r=>r.kind===b.kind&&r.width===b.width&&r.height===b.height&&r.seed===b.seed);return'<article><h2>'+b.kind+' 80×64 · seed'+b.seed+'</h2><div><figure><figcaption>До · потери тонкой суши '+(b.primary.lostFraction*100).toFixed(2)+'%</figcaption><img src="'+b.image+'" alt="До"></figure><figure><figcaption>После · '+(a.core.primary.lostFraction*100).toFixed(2)+'%</figcaption><img src="'+a.image+'" alt="После"></figure></div></article>';});
 await writeFile(artifact('shape-comparison.html'),'<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Берег: исправление одинаковых пальцев</title><style>body{background:#101a1e;color:#def;font:14px system-ui;margin:18px}main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px;max-width:1500px}article div{display:grid;grid-template-columns:1fr 1fr;gap:10px}figure{margin:0}img{width:100%;image-rendering:pixelated}h2{font-size:16px}@media(max-width:800px){main{grid-template-columns:1fr}}</style><h1>Отказанный берег 80×64: до и после</h1><p>Те же4 пользовательских seed, обе сетки. BEFORE-маски сохранены до изменения движка; они не генерировались повторно. Метрика ширины дополняет визуальную оценку, а не заменяет её.</p><main>'+pairs.join('')+'</main></html>','utf8');
 console.log(JSON.stringify({ok:result.ok,geometryCases:rows.length,thinFailures:rows.filter(r=>!r.thinnessPass).map(r=>({kind:r.kind,width:r.width,height:r.height,seed:r.seed,lost:r.core.primary.lostFraction})),quality}));assert.ok(result.ok,'Coast-only width/quality gates failed');return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await verifyCoastCorrection({baselineOnly:process.argv.includes('--baseline-only')});
