// Fresh real documents; optional Python QA environment, no app dependencies.
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {smallRecipe} from '../tests/helpers.mjs';
import {generateBase,execute,MODES} from '../app/index.mjs';
import {exportAtlasTiles} from '../engine/api/atlas.mjs';
import {createSessionStore} from './session-store.mjs';
import {linkedExample} from '../examples/linked-transports.mjs';
import {automaticExample} from '../examples/automatic-transports.mjs';
import {createDistributionRequest} from '../content/index.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),documents=[],modes=Object.keys(MODES);
const add=(label,schema,value)=>documents.push({label,schema,value});
for(const mode of modes){
 const recipe=await smallRecipe(mode),project=await generateBase(recipe);
 add(mode+' recipe','schemas/recipe.schema.json',recipe);
 add(mode+' project','schemas/project.schema.json',project);
 add(mode+' raster','schemas/raster.schema.json',await execute('raster-export',{project,options:{scope:'all',scale:1}}));
 add(mode+' context','schemas/project-context.schema.json',await execute('export',{project,format:'llm-context',options:{maxSources:256,maxCatalog:256,maxLinks:256}}));
 for(const format of ['project','recipe','runtime','llm-context'])add(mode+' export request '+format,'schemas/export-request.schema.json',{project,format});
 const natural=project.source.atlas??(['landscape','hexlandscape','caves','relief'].includes(mode)?project.source:null),native=natural??project.source,name=natural?'atlas':mode==='dungeon'?'bundle':mode==='tiers'?'world':'platformer';
 add(mode+' native','engine/schemas/'+name+'.schema.json',native);
 if(natural)add(mode+' tiles','engine/schemas/atlas-tiles.schema.json',exportAtlasTiles(natural));
 if(mode==='settlements')add(mode+' settlement','engine/schemas/settlement.schema.json',project.source);
 for(const[key,schema]of [['project','project'],['runtime','runtime'],['state','spawn-state'],['plan','spawn-plan'],['distribution-preview','distribution-preview'],['scene','content-scene']])documents.push({label:mode+' authored '+key,schema:'schemas/'+schema+'.schema.json',file:'evidence/content-'+mode+'-'+key+'-schema-data.json'});
 const authored=JSON.parse(await readFile(path.join(root,'evidence/content-'+mode+'-project-schema-data.json'),'utf8'));
 add(mode+' authored context','schemas/project-context.schema.json',await execute('export',{project:authored,format:'llm-context',options:{maxSources:256,maxCatalog:256,maxLinks:256}}));
 const source=authored.sources[0];
 add(mode+' source preview','schemas/source-preview.schema.json',await execute('source-preview',{project:authored,sourceId:source.id}));
 add(mode+' distribution request','schemas/distribution-request.schema.json',createDistributionRequest(source));
 for(const s of authored.sources){add(mode+' source '+s.id,'schemas/source.schema.json',s);for(const rule of s.rules)add(mode+' rule '+s.id+'/'+rule.id,'schemas/source-rule.schema.json',rule);}
}
for(const[name,sample]of [['paired',await linkedExample()],['automatic',await automaticExample()]]){
 add(name+' project','schemas/project.schema.json',sample.project);add(name+' runtime','schemas/runtime.schema.json',sample.runtime);
 if(sample.state)add(name+' state','schemas/spawn-state.schema.json',sample.state);
 for(const transition of sample.project.transitions)add(name+' transition','schemas/transition.schema.json',transition);
}
const folder=await mkdtemp(path.join(tmpdir(),'Vland schema session QA '));
try{
 const store=createSessionStore(folder),opened=await store.open({clientId:'schema-tab',pageId:'schema-page',mode:'landscape',sessionId:null,resume:false});
 for(const mode of modes)await store.save({clientId:opened.clientId,pageId:'schema-page',sessionId:opened.id,mode,sequence:1,workspace:{recipe:await smallRecipe(mode),project:null,ui:{stage:'map'},fileId:null,fileRevision:null,dirty:false,pending:true}});
 add('isolated working session','schemas/working-session.schema.json',JSON.parse(await readFile(store.file,'utf8')));
}finally{const target=path.resolve(folder);if(!target.startsWith(path.resolve(tmpdir())+path.sep)||!path.basename(target).startsWith('Vland schema session QA '))throw Error('Unexpected schema QA cleanup');await rm(target,{recursive:true,force:true});}
const data=path.join(root,'evidence/schema-instance-data.json'),report=path.join(root,'evidence/schema-instances.json');await writeFile(data,JSON.stringify({modes,documents})+'\n','utf8');
const result=spawnSync(process.env.VLAND_SCHEMA_PYTHON??'python',[path.join(root,'tools/verify-evolution-schemas.py'),'--data',data,'--report',report],{encoding:'utf8',maxBuffer:4*1024*1024,env:{...process.env,PYTHONUTF8:'1'}});if(result.error)throw result.error;process.stdout.write(result.stdout);process.stderr.write(result.stderr);process.exitCode=result.status??1;
