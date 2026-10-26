import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createRecipe,generateBase,validateProject,exportRuntime,materialize,editProject,execute} from '../app/index.mjs';
import {MODES} from '../app/contracts.mjs';
import {exportAtlasTiles} from '../engine/api/atlas.mjs';
import {hash} from '../content/common.mjs';
const rows=[],samples=[],saved=new Set(),started=Date.now();await mkdir(new URL('../evidence/',import.meta.url),{recursive:true});
async function check(mode,name,mutate,seed=71){
 const r=await createRecipe(mode);r.seed=seed;
 if(mode==='dungeon'){r.generation.rooms.count=5;r.generation.search.candidates=1;}
 if(mode==='tiers')for(const l of r.generation.layers)l.request.rooms={count:3};
 if(mode==='sideview')r.generation.rooms=6;
 if(['caves','landscape','hexlandscape'].includes(mode)){r.generation.width=40;r.generation.height=36;r.generation.layers={above:0,underground:1};r.generation.autoTransports.minRegionArea=24;}
 if(mode==='settlements'){r.generation.width=48;r.generation.height=40;}if(mode==='relief')r.generation.width=r.generation.height=32;
 mutate?.(r);const begin=Date.now(),p=await generateBase(r),validation=await validateProject(p);assert.ok(validation.ok,name+': '+validation.errors.join('; '));const runtime=await exportRuntime(p);assert.ok(runtime.validation.ok);assert.deepEqual(p.sources,[]);assert.deepEqual(runtime.initialState.entities,[]);
 const layers=await materialize(p),natural=p.source.atlas??(['caves','landscape','hexlandscape','relief'].includes(mode)?p.source:null);
 if(natural&&!r.generation.landscape){assert.equal(natural.request.landscape,undefined);if(r.generation.landforms)assert.equal(natural.request.landforms.pattern,r.generation.landforms.pattern);}
 if(natural){assert.ok(natural.layers.every(l=>!l.sites.length&&!l.deposits.length&&!l.fields.vegetation.some(Boolean)));assert.ok(natural.links.every(t=>Number.isInteger(t.from.x)&&t.from.layerId));}
 if(mode==='dungeon')assert.ok(p.source.level.connections.every(c=>c.cells.length>=p.source.level.options.corridors.minLength&&c.cells.length<=p.source.level.options.corridors.maxLength));
 const raster=await execute('raster-export',{project:p,options:{scope:'all',scale:1}});assert.equal(raster.files.length,layers.length);assert.ok(raster.files.every(f=>Buffer.from(f.data,'base64').subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))));
 rows.push({mode,name,seed,layers:layers.length,automaticLinks:runtime.links.filter(t=>t.automatic).length,topology:layers[0].topology?.kind??'square',valid:true,elapsedMs:Date.now()-begin});
 if(!saved.has(mode)){saved.add(mode);const i=layers[0].solid.findIndex((v,i)=>!v&&!layers[0].reserved[i]),edited=await editProject(p,{type:'terrain.stroke',layerId:layers[0].id,field:'biome',value:'plains',cells:[{x:i%layers[0].width,y:Math.floor(i/layers[0].width)}]});assert.equal(hash(edited.source),hash(p.source));samples.push({mode,recipe:r,project:edited,runtime:await exportRuntime(edited),raster,native:natural??p.source,...(mode==='settlements'?{settlement:p.source}:{}),nativeSchema:natural?'atlas':mode==='dungeon'?'bundle':mode==='tiers'?'world':'platformer',...(natural?{tiles:exportAtlasTiles(natural)}:{})});}
 if(natural?.request.topology.kind==='hex'&&!samples.some(s=>s.hex)){samples.push({hex:true,mode,recipe:r,project:p,runtime,raster,native:natural,nativeSchema:'atlas',tiles:exportAtlasTiles(natural)});}
 console.log(mode+' '+name+' OK');
}
try{
 for(const mode of Object.keys(MODES))await check(mode,'base');
 for(const architecture of ['organic','compact','gallery','clustered','ring'])for(const seed of [7,91])await check('dungeon',architecture,r=>{r.generation.layout.architecture=architecture;r.generation.layout.corridors={minLength:4,maxLength:9,preferredLength:6,openWidth:seed===7?1:3};},seed);
 await check('dungeon','long-24',r=>r.generation.layout.corridors={minLength:24,maxLength:24,preferredLength:24,openWidth:3});
 await check('tiers','wide-layer-corridors',r=>{for(const l of r.generation.layers)l.request.layout={...l.request.layout,corridors:{minLength:4,maxLength:7,preferredLength:5,openWidth:2}};});
 for(const pattern of ['natural','island','archipelago','ridge','plateau','basin'])for(const topology of ['square','hex'])await check(topology==='hex'?'hexlandscape':'landscape',pattern+' '+topology,r=>{delete r.generation.landscape;r.generation.landforms={...r.generation.landforms,pattern,strength:.85};r.generation.topology={kind:topology};},53);
 for(const style of ['mixed','chambers','tunnels','karst','fractured','lava-tubes','shafts','water-carved'])for(const topology of ['square','hex'])await check('caves',style+' '+topology,r=>{r.generation.caves={...r.generation.caves,style,connectivity:.25,tunnelRadius:1.5,branching:.7};r.generation.topology={kind:topology};},91);
 for(const type of ['town','village'])for(const pattern of ['organic','grid','radial','ribbon'])await check('settlements',type+' '+pattern,r=>Object.assign(r.generation,{type,pattern,buildingDensity:.8}));
 const result={ok:true,maps:rows.length,modes:Object.keys(MODES).length,automaticLinks:rows.reduce((s,r)=>s+r.automaticLinks,0),elapsedMs:Date.now()-started,rows};await writeFile(new URL('../evidence/evolution-verification.json',import.meta.url),JSON.stringify(result,null,2)+'\n');await writeFile(new URL('../evidence/evolution-contract-data.json',import.meta.url),JSON.stringify({samples})+'\n');console.log(JSON.stringify({...result,rows:undefined}));
}catch(error){await writeFile(new URL('../evidence/evolution-verification.json',import.meta.url),JSON.stringify({ok:false,error:error.message,rows},null,2));throw error;}
