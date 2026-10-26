// Fresh synthetic 300x300 documents only; never reads named projects or live sessions.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,realpath} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRecipe,generateBase,validateProject,execute} from '../app/index.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const reportPath=path.join(root,'evidence/biome-confirmation-large-schema.json');
const python=process.env.VLAND_SCHEMA_PYTHON;
if(!python)throw Error('Set VLAND_SCHEMA_PYTHON to the existing optional JSON Schema QA interpreter.');
const folder=await mkdtemp(path.join(tmpdir(),'Vland-Biome-Large-Schema-'));
const documents=[],maps=[],modes=['landscape','hexlandscape'];
try{
 const add=async(label,schema,value)=>{const file=path.join(folder,documents.length+'.json');await writeFile(file,JSON.stringify(value)+'\n','utf8');documents.push({label,schema,file});};
 for(const mode of modes){
  const recipe=await createRecipe(mode);recipe.seed=42;
  Object.assign(recipe.generation,{width:300,height:300,layers:{above:0,underground:0},landscape:{structure:'coast',baseBiome:'meadow',landPercent:75,uniformity:50,biomes:['forest','mountains','swamp','desert','snow','volcanic'].map((type,i)=>({id:'confirmed-'+(i+1),type,percent:10}))}});
  const project=await generateBase(recipe),validation=await validateProject(project);assert.ok(validation.ok,JSON.stringify(validation.errors));assert.ok(project.source.navigation.ok&&project.source.access.ok);
  const fields=project.source.layers[0].fields,sea=fields.waterType.filter(v=>v==='sea').length;assert.equal(sea,22500);
  await add(mode+' 300 all-seven recipe','schemas/recipe.schema.json',project.recipe);
  await add(mode+' 300 all-seven project','schemas/project.schema.json',project);
  await add(mode+' 300 all-seven native','engine/schemas/atlas.schema.json',project.source);
  await add(mode+' 300 all-seven context','schemas/project-context.schema.json',await execute('export',{project,format:'llm-context',options:{maxSources:256,maxCatalog:256,maxLinks:256}}));
  await add(mode+' 300 all-seven raster','schemas/raster.schema.json',await execute('raster-export',{project,options:{scope:'all',scale:1,transparent:false}}));
  const counts={};for(const id of fields.biome)counts[id]=(counts[id]??0)+1;
  maps.push({mode,width:300,height:300,seed:42,baseBiome:'meadow',confirmedCards:recipe.generation.landscape.biomes,landPercent:75,seaCells:sea,landmassCells:90000-sea,checksum:project.checksum,visibleBiomes:counts,navigation:true,access:true,projectValidation:true});
  console.log(JSON.stringify({generated:mode,size:300,documents:documents.length,checksum:project.checksum}));
 }
 const manifest=path.join(folder,'manifest.json');await writeFile(manifest,JSON.stringify({modes,documents})+'\n','utf8');
 const status=await new Promise((resolve,reject)=>{const child=spawn(python,[path.join(root,'tools/verify-evolution-schemas.py'),'--data',manifest,'--report',reportPath],{cwd:root,env:{...process.env,PYTHONUTF8:'1'},stdio:['ignore','pipe','pipe']});child.stdout.pipe(process.stdout);child.stderr.pipe(process.stderr);child.once('error',reject);child.once('exit',resolve);});
 assert.equal(status,0,'Full offline JSON Schema validation failed; see report.');
 const report=JSON.parse(await readFile(reportPath,'utf8'));assert.ok(report.ok);assert.equal(report.documents,10);assert.equal(report.negativeControls,10);assert.equal(report.schemas,60);report.actualMaps=maps;report.syntheticOnly=true;report.manifestOutsideProject=true;await writeFile(reportPath,JSON.stringify(report,null,2)+'\n','utf8');
 console.log(JSON.stringify({ok:true,schemas:report.schemas,documents:report.documents,negativeControls:report.negativeControls,actualMaps:maps.length}));
}finally{
 const target=await realpath(folder);assert.equal(path.dirname(target),await realpath(tmpdir()));assert.ok(path.basename(target).startsWith('Vland-Biome-Large-Schema-'));await rm(target,{recursive:true,force:true});
}
