// Stateless main activation verification. Does not use session, named-project or file-write APIs.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createRecipe,generateBase,execute} from '../app/index.mjs';
const base='http://127.0.0.1:9670',report={ok:false,stateless:true,restart:false,files:[],cases:[]};
try{
 const health=await fetch(base+'/api/health',{signal:AbortSignal.timeout(5000)});assert.equal(health.status,200);assert.equal((await health.json()).ok,true);report.health=200;
 for(const file of ['Web/HTML/landscape.html','Web/HTML/hexlandscape.html','Web/HTML/ui/controls.mjs','Web/HTML/ui/biome-card-drafts.mjs','Web/HTML/ui/workbench.mjs','Web/HTML/ui/map-settings-validation.mjs','app/display-colors.mjs','app/raster.mjs','engine/api/atlas-catalog.mjs','engine/core/atlas-biomes.mjs','engine/core/landscape-profile.mjs','engine/core/landscape-regions.mjs']){
  const response=await fetch(base+'/'+file,{signal:AbortSignal.timeout(5000)});assert.equal(response.status,200);assert.equal(await response.text(),await readFile(new URL('../'+file,import.meta.url),'utf8'),file+' current');report.files.push({file,status:200,current:true});
 }
 const post=async(operation,value)=>{const r=await fetch(base+'/api/'+operation,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value),signal:AbortSignal.timeout(60000)});assert.equal(r.status,200);return r.json();};
 for(const mode of ['landscape','hexlandscape']){
  const recipe=await createRecipe(mode);Object.assign(recipe.generation,{width:50,height:50,landscape:{structure:'coast',baseBiome:'meadow',landPercent:75,uniformity:50,biomes:['forest','swamp','desert','mountains','snow','volcanic'].map((type,i)=>({id:'accepted-'+i,type,percent:10}))}});
  const local=await generateBase(recipe),remote=await post('generate-base',{recipe});assert.deepEqual(remote,local,'current main generation '+mode);
  const request={project:local,options:{scope:'all',scale:1,transparent:false}},localRaster=await execute('raster-export',request),remoteRaster=await post('raster-export',request);assert.deepEqual(remoteRaster,localRaster,'current named palette PNG '+mode);
  report.cases.push({mode,size:50,generationExact:true,rasterExact:true,checksum:local.checksum,confirmedCards:recipe.generation.landscape.biomes.length});
 }
 report.ok=true;
}catch(error){report.error=error.message;}finally{await writeFile(new URL('../evidence/biome-confirmation-main.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
if(!report.ok)process.exitCode=1;
