import {createRecipe,generateBase,validateProject} from '../app/index.mjs';
import {writeFile,readFile,mkdtemp,mkdir,readdir,cp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),rows=[];
if(process.argv.includes('--serve')){
 const parent=await mkdtemp(path.join(tmpdir(),'Vland large map QA ')),copy=path.join(parent,'VlandGenerator');await mkdir(copy);
 for(const entry of await readdir(root))if(!['.run','evidence','projects','.git'].includes(entry))await cp(path.join(root,entry),path.join(copy,entry),{recursive:true});
 await writeFile(path.join(copy,'qa-large-run.mjs'),await readFile(path.join(root,'tools/qa-large-maps.mjs')));
 await writeFile(path.join(copy,'qa-large.html'),'<!doctype html><html lang="ru"><meta charset="utf-8"><title>QA больших карт</title><style>body{margin:0;background:#101a1e;color:#cef;font:12px system-ui}iframe{border:0}pre{white-space:pre-wrap}</style><iframe width="1100" height="1000"></iframe><pre>Проверка…</pre><script type="module" src="/qa-large-run.mjs"></script></html>','utf8');
 await writeFile(path.join(copy,'qa-export-run.mjs'),await readFile(path.join(root,'tools/qa-json-export.mjs')));
 await writeFile(path.join(copy,'qa-export.html'),(await readFile(path.join(copy,'qa-large.html'),'utf8')).replace('qa-large-run.mjs','qa-export-run.mjs'));
 await writeFile(path.join(copy,'qa-editor-layout-run.mjs'),await readFile(path.join(root,'tools/qa-editor-layout.mjs')));
 await writeFile(path.join(copy,'qa-editor-layout.html'),(await readFile(path.join(copy,'qa-large.html'),'utf8')).replace('qa-large-run.mjs','qa-editor-layout-run.mjs'));
 await writeFile(path.join(copy,'qa-stack-run.mjs'),await readFile(path.join(root,'tools/qa-landscape-stack.mjs')));
 await writeFile(path.join(copy,'qa-stack.html'),(await readFile(path.join(copy,'qa-large.html'),'utf8')).replace('qa-large-run.mjs','qa-stack-run.mjs'));
 await writeFile(path.join(copy,'qa-streets-run.mjs'),await readFile(path.join(root,'tools/qa-settlement-streets.mjs')));
 await writeFile(path.join(copy,'qa-streets.html'),(await readFile(path.join(copy,'qa-large.html'),'utf8')).replace('qa-large-run.mjs','qa-streets-run.mjs'));
 await writeFile(path.join(copy,'qa-districts-run.mjs'),await readFile(path.join(root,'tools/qa-settlement-districts.mjs')));
 await writeFile(path.join(copy,'qa-districts.html'),(await readFile(path.join(copy,'qa-large.html'),'utf8')).replace('qa-large-run.mjs','qa-districts-run.mjs'));
 await writeFile(path.join(copy,'qa-context-run.mjs'),await readFile(path.join(root,'tools/qa-export-context.mjs')));
 await writeFile(path.join(copy,'qa-context.html'),(await readFile(path.join(copy,'qa-large.html'),'utf8')).replace('qa-large-run.mjs','qa-context-run.mjs'));
 await writeFile(path.join(copy,'qa-profile-run.mjs'),await readFile(path.join(root,'tools/qa-landscape-profiles.mjs')));
 await writeFile(path.join(copy,'qa-profile.html'),(await readFile(path.join(copy,'qa-large.html'),'utf8')).replace('qa-large-run.mjs','qa-profile-run.mjs'));
 await writeFile(path.join(copy,'qa-quality-run.mjs'),await readFile(path.join(root,'tools/qa-landscape-quality.mjs')));
 await writeFile(path.join(copy,'qa-quality.html'),(await readFile(path.join(copy,'qa-large.html'),'utf8')).replace('qa-large-run.mjs','qa-quality-run.mjs'));
 await writeFile(path.join(copy,'qa-surface-run.mjs'),await readFile(path.join(root,'tools/qa-landscape-surface.mjs')));
 await writeFile(path.join(copy,'qa-surface.html'),(await readFile(path.join(copy,'qa-large.html'),'utf8')).replace('qa-large-run.mjs','qa-surface-run.mjs'));
 const port=Number(process.env.VLAND_QA_PORT??11502);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid QA port');
 const {pathToFileURL}=await import('node:url'),copied=await import(pathToFileURL(path.join(copy,'server.mjs'))),server=copied.createVlandServer({root:copy});server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({copy,parent,pid:process.pid,url:'http://127.0.0.1:'+port+'/qa-large.html'})));
 process.on('SIGINT',async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));if(!path.resolve(parent).startsWith(path.resolve(tmpdir())+path.sep)||!path.basename(parent).startsWith('Vland large map QA '))throw Error('Unexpected QA cleanup');await rm(parent,{recursive:true,force:true});console.log('Large map QA copy removed');process.exit(0);});
}else{
 for(const[mode,size,topology,layers]of [['landscape',256,'square',{above:0,underground:0}],['hexlandscape',256,'hex',{above:0,underground:0}],['landscape',128,'square',{above:1,underground:2}],['caves',128,'square',{above:0,underground:2}]]){
  const recipe=await createRecipe(mode);Object.assign(recipe.generation,{width:size,height:size,topology:{kind:topology},layers});const start=performance.now(),project=await generateBase(recipe),generateMs=Math.round(performance.now()-start),checked=await validateProject(project);if(!checked.ok)throw Error(JSON.stringify(checked));
  rows.push({mode,size,topology,layers:project.source.layers.length,generateMs,validated:true,checksum:project.checksum,bytes:JSON.stringify(project).length});console.log(rows.at(-1));
 }
 await writeFile(path.join(root,'evidence/large-maps.json'),JSON.stringify({status:'in_progress',ok:true,rows},null,2)+'\n','utf8');
}
