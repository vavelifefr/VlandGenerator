import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,cp,readFile,readdir,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('schema component builders are repeatable without accumulating duplicate mode constraints',async()=>{
 const folder=await mkdtemp(path.join(tmpdir(),'Vland schema build QA '));
 try{
  for(const dir of ['schemas','engine','content'])await cp(path.join(root,dir),path.join(folder,dir),{recursive:true});
  await mkdir(path.join(folder,'tools'));
  for(const name of ['build-schemas','build-transport-schemas','build-evolution-schemas','build-export-schemas'])await cp(path.join(root,'tools',name+'.mjs'),path.join(folder,'tools',name+'.mjs'));
  const run=name=>execFileSync(process.execPath,['tools/'+name+'.mjs'],{cwd:folder,stdio:'pipe'});
  run('build-schemas');
  const files=(await Promise.all(['schemas','engine/schemas'].map(async dir=>(await readdir(path.join(folder,dir))).filter(f=>f.endsWith('.json')).map(f=>dir+'/'+f)))).flat(),before=new Map(await Promise.all(files.map(async f=>[f,await readFile(path.join(folder,f),'utf8')])));
  for(let i=0;i<2;i++){
   for(const builder of ['build-transport-schemas','build-evolution-schemas','build-export-schemas'])run(builder);
   const recipe=JSON.parse(await readFile(path.join(folder,'schemas/recipe.schema.json'),'utf8'));
   for(const mode of recipe.properties.mode.enum)assert.equal(recipe.allOf.filter(v=>v.if?.properties?.mode?.const===mode).length,1,'One generation constraint for '+mode);
   for(const file of files)assert.equal(await readFile(path.join(folder,file),'utf8'),before.get(file),'Repeatable schema '+file);
  }
 }finally{const target=path.resolve(folder);if(!target.startsWith(path.resolve(tmpdir())+path.sep)||!path.basename(target).startsWith('Vland schema build QA '))throw Error('Unexpected builder QA cleanup');await rm(target,{recursive:true,force:true});}
});
