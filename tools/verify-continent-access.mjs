// Bounded natural access QA for the current coastline/settings request: actual 100 x 100 maps only.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createRecipe,generateBase,validateProject,exportRuntime,importProject} from '../app/index.mjs';
import {analyzeAtlasAccess} from '../engine/api/atlas-transports.mjs';
const report={ok:false,maps:[],negative:[],errors:[]},out=new URL('../evidence/continent-access.json',import.meta.url);
async function base(mode,grid){const r=await createRecipe(mode);r.seed=42;Object.assign(r.generation,{width:100,height:100});if(mode==='caves')Object.assign(r.generation,{topology:{kind:grid},layers:{above:0,underground:2},caves:{...r.generation.caves,connectivity:0,openness:.3}});return r;}
async function check(mode,grid,name,options,extra={}){
 const r=await base(mode,grid);Object.assign(r.generation,extra);Object.assign(r.generation.autoTransports,options);const p=await generateBase(r),a=p.source;
 assert.deepEqual(a.request.autoTransports,a.automaticTransports.settings);assert.deepEqual(a.request.autoTransports,p.recipe.generation.autoTransports);assert.ok((await validateProject(p)).ok);assert.ok(analyzeAtlasAccess(a).ok);assert.deepEqual(await importProject(p),p);
 const runtime=await exportRuntime(p);assert.ok(runtime.links.every(t=>t.from.layerId&&t.to.layerId));const automatic=a.links.filter(t=>t.automatic);
 assert.ok(automatic.every(t=>t.bidirectional&&t.travelCost===a.request.autoTransports.travelCost&&t.footprint.width>=a.request.autoTransports.landingSize&&t.footprint.height>=a.request.autoTransports.landingSize));
 assert.ok(a.links.every(t=>t.kind!=='teleport'||t.from.layerId===t.to.layerId),'Teleport crossed a physical layer');assert.ok(a.links.every(t=>!['stairs','lift','climb'].includes(t.kind)||t.from.layerId!==t.to.layerId));
 if(options.enabled===false)assert.equal(automatic.length,0);if(options.connectRegions===false)assert.ok(automatic.every(t=>t.reason!=='isolated-region'));if(options.crossLayerRegions===false)assert.ok(automatic.filter(t=>t.reason==='isolated-region').every(t=>t.from.layerId===t.to.layerId));
 if(options.types?.stairs===1&&options.types?.lift===0&&options.types?.teleport===0)assert.ok(automatic.every(t=>t.kind==='stairs'));if(options.types?.lift===1&&options.types?.stairs===0&&options.types?.teleport===0)assert.ok(automatic.every(t=>t.kind==='lift'));
 const row={mode,grid,size:100,name,links:a.links.length,isolated:automatic.filter(t=>t.reason==='isolated-region').length,types:[...new Set(a.links.map(t=>t.kind))],settings:a.automaticTransports.settings,access:a.access,validation:true,roundtrip:true,runtime:true};report.maps.push(row);console.log(JSON.stringify({name,grid,links:row.links,isolated:row.isolated}));return row;
}
try{
 for(const grid of ['square','hex']){
  const stairs={enabled:true,connectRegions:true,crossLayerRegions:true,minRegionArea:32,maxLinks:128,landingSize:2,travelCost:7,types:{stairs:1,lift:0,teleport:0}};
  const connected=await check('caves',grid,'stairs-regions',stairs);assert.ok(connected.isolated>0);
  await check('caves',grid,'lift-regions',{...stairs,types:{stairs:0,lift:1,teleport:0}});
  const off=await check('caves',grid,'disabled',{...stairs,enabled:false});assert.equal(off.links,2);
  const chain=await check('caves',grid,'no-region-links',{...stairs,connectRegions:false});assert.equal(chain.links,2);
  const large=await check('caves',grid,'large-minimum',{...stairs,minRegionArea:4096});assert.ok(large.isolated<connected.isolated);
  await check('caves',grid,'local-region-teleports',{...stairs,crossLayerRegions:false,types:{teleport:1,stairs:1,lift:0}});
  for(const mode of ['landscape','hexlandscape'].filter(mode=>(mode==='landscape')===(grid==='square')))await check(mode,grid,'surface-only',{enabled:true,connectRegions:true,crossLayerRegions:true,minRegionArea:32,maxLinks:128,landingSize:1,travelCost:9,types:{teleport:1,stairs:1,lift:1}});
  for(const[name,options]of [['too-few-links',{...stairs,maxLinks:2}],['no-local-type',{...stairs,crossLayerRegions:false}],['multi-layer-teleport-only',{...stairs,types:{teleport:1,stairs:0,lift:0}}]]){
   const r=await base('caves',grid);r.generation.autoTransports=options;await assert.rejects(generateBase(r),undefined,name);report.negative.push({name,grid,rejected:true});
  }
 }
 report.ok=true;
}catch(error){report.errors.push({message:error.message,stack:error.stack});throw error;}
finally{await writeFile(out,JSON.stringify(report,null,2)+'\n');}
