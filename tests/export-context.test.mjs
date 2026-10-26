import test from 'node:test';
import assert from 'node:assert/strict';
import {createRecipe,generateBase,execute,exportRuntime,recipeFromProject,materialize,editProject,createSource,API_CONTRACT,importProject} from '../app/index.mjs';
import {hash} from '../content/common.mjs';
import {buildProjectContext} from '../app/project-context.mjs';
import {smallProject} from './helpers.mjs';
async function sample(){const r=await createRecipe('landscape');Object.assign(r.generation,{width:32,height:32,layers:{above:0,underground:1}});let p=await generateBase(r);const layer=(await materialize(p))[0],source=createSource({id:'manual-guards',name:'Ручная зона',category:'fauna',layer,catalogId:'guard'});p=await editProject(p,{type:'source.put',source});return p;}
const fullContext={maxSources:256,maxCatalog:256,maxLinks:256};
const singleKindFields=layers=>layers.map(l=>({...l,...Object.fromEntries(['material','biome','water'].map(k=>[k,Array(l.width*l.height).fill(l[k][0])]))}));
test('explicit exports distinguish editable projects, regeneration recipes, runtime and compact LLM context',async()=>{
 const p=await sample(),before=JSON.stringify(p);
 assert.deepEqual(await execute('export',{project:p,format:'project'}),p);assert.deepEqual(await execute('export',{project:p,format:'recipe'}),recipeFromProject(p));assert.deepEqual(await execute('export',{project:p,format:'runtime'}),await exportRuntime(p));
 const context=await execute('export',{project:p,format:'llm-context'});assert.equal(context.schema,'vland.project.context');assert.equal(context.schemaVersion,4);assert.equal(context.project.checksum,p.checksum);assert.equal(context.project.revision,p.revision);assert.equal(context.layers.length,2);assert.equal(context.sources.entries[0].id,'manual-guards');assert.equal(context.sources.entries[0].area.cells,1024);assert.ok(!JSON.stringify(context).includes('"runs"'));assert.ok(!('source' in context));assert.ok(!('edits' in context));assert.ok(context.budget.bytes<=context.budget.maxBytes);assert.equal(context.budget.bytes,new TextEncoder().encode(JSON.stringify(context)).length);assert.equal(JSON.stringify(p),before);assert.deepEqual(await execute('export',{project:p,format:'llm-context'}),context);
 await assert.rejects(()=>importProject(context));
});
test('context scopes actual layers/sources and rejects unknown selectors or ambiguous export intent',async()=>{
 const p=await sample(),context=await execute('export',{project:p,format:'llm-context',options:{layerIds:['cave-1'],maxSources:0,maxCatalog:0,maxLinks:0}});
 assert.deepEqual(context.layers.map(l=>l.id),['cave-1']);assert.equal(context.sources.total,0);assert.equal(context.catalog.entries.length,0);assert.equal(context.catalog.omittedEntries,p.catalog.length);
 for(const job of [{project:p},{project:p,format:'legacy'},{project:p,format:'project',options:{maxSources:1}},{project:p,format:'llm-context',options:{layerIds:['missing']}},{project:p,format:'llm-context',options:{maxSources:-1}},{project:p,format:'llm-context',options:{unknown:true}}])await assert.rejects(()=>execute('export',job));
});
test('a large map produces a bounded context from current edited fields without copying tile arrays',async()=>{
 const r=await createRecipe('landscape');Object.assign(r.generation,{width:256,height:256,layers:{above:0,underground:0}});const p=await generateBase(r),context=await execute('export',{project:p,format:'llm-context'});
 assert.equal(context.layers[0].cells,65536);assert.ok(context.budget.bytes<32768);assert.ok(JSON.stringify(p).length>context.budget.bytes*100);assert.equal(hash(p.source),context.project.sourceFingerprint);
});
test('machine-readable operation descriptions cover the actual API and explain readonly versus returned edits',()=>{
 assert.deepEqual(Object.keys(API_CONTRACT.operationDetails).sort(),[...API_CONTRACT.operations].sort());assert.ok(API_CONTRACT.operationDetails.export.required.includes('format'));assert.equal(API_CONTRACT.operationDetails.export.path,'/api/export');assert.equal(API_CONTRACT.operationDetails.export.effect,'read-only');assert.equal(API_CONTRACT.operationDetails.edit.effect,'returns-project');assert.ok(API_CONTRACT.exportFormats['llm-context'].schema.endsWith('project-context.schema.json'));
});

test('large author inventories obey the actual download budget and report every omitted entry',async()=>{
 const {seal}=await import('../app/project.mjs'),{serializeDocument}=await import('../app/json-export.mjs');const r=await createRecipe('landscape');Object.assign(r.generation,{width:32,height:32,layers:{above:0,underground:0}});const template=r.catalog.find(c=>c.id==='chest');r.catalog=Array.from({length:256},(_,i)=>({...structuredClone(template),id:'entry-'+i,name:'Описание'.repeat(12)}));let p=await generateBase(r);const layer=(await materialize(p))[0],sources=Array.from({length:64},(_,i)=>{const s=createSource({id:'manual-'+i,name:'Ручная зона '.repeat(8),category:'items',layer,catalogId:'entry-'+i});s.rules[0].entries=Array.from({length:16},(_,j)=>({catalogId:'entry-'+(i+j),weight:1}));return s;});p=seal({...p,sources});
 const context=await execute('export',{project:p,format:'llm-context',options:{maxSources:256,maxCatalog:256}});assert.ok(context.budget.truncated);assert.ok(new TextEncoder().encode(serializeDocument(context)).length<=128*1024);for(const key of ['sources','catalog','links'])assert.equal(context[key].entries.length+context[key].omittedEntries,context[key].total);assert.equal(context.catalog.ids.length+context.catalog.omittedIds,256);assert.equal(context.sources.ids.length+context.sources.omittedIds,64);assert.ok(context.sources.entries.length<context.sources.total||context.catalog.entries.length<context.catalog.total);
});

test('context histograms describe edits while their original source fingerprint stays fixed',async()=>{
 let p=await sample();const before=await execute('export',{project:p,format:'llm-context'}),l=(await materialize(p))[0],i=l.biome.findIndex((v,i)=>v!=='plains'&&!l.reserved[i]);assert.ok(i>=0);const previous=before.layers[0].fields.biome.counts.find(c=>c.value==='plains')?.count??0;
 p=await editProject(p,{type:'terrain.stroke',layerId:l.id,field:'biome',value:'plains',cells:[{x:i%l.width,y:Math.floor(i/l.width)}]});const after=await execute('export',{project:p,format:'llm-context'});assert.equal(after.layers[0].fields.biome.counts.find(c=>c.value==='plains').count,previous+1);assert.equal(after.project.sourceFingerprint,before.project.sourceFingerprint);assert.notEqual(after.project.checksum,before.project.checksum);
});

test('export rejects non-string format values instead of silently choosing another document',async()=>{
 const p=await sample();
 for(const format of [['project'],['recipe'],['runtime'],['llm-context'],{},null,42,true])await assert.rejects(()=>execute('export',{project:p,format}),{code:'INVALID_EXPORT'});
});

test('context marks omitted catalog references inside a fully included source',async()=>{
 const r=await createRecipe('landscape');Object.assign(r.generation,{width:32,height:32,layers:{above:0,underground:0}});const template=r.catalog.find(c=>c.id==='chest');r.catalog=Array.from({length:17},(_,i)=>({...structuredClone(template),id:'entry-'+i}));let p=await generateBase(r);const layer=(await materialize(p))[0],s=createSource({id:'many-choices',category:'items',layer,catalogId:'entry-0'});
 s.rules[0].entries=Array.from({length:16},(_,i)=>({catalogId:'entry-'+i,weight:1}));s.rules.push({...structuredClone(s.rules[0]),id:'second',entries:[{catalogId:'entry-16',weight:1}]});p=await editProject(p,{type:'source.put',source:s});const context=await execute('export',{project:p,format:'llm-context'});
 assert.equal(context.sources.omittedEntries,0);assert.equal(context.catalog.omittedEntries,0);assert.equal(context.sources.entries[0].catalogIds.length,16);assert.equal(context.sources.entries[0].omittedCatalogIds,1);
 const isolated=buildProjectContext(p,singleKindFields([layer]),[],{ok:true,errors:[],warnings:[]},fullContext);assert.equal(isolated.budget.truncated,true);
});

test('context reports omitted and shortened validation messages as truncated data',async()=>{
 const p=await sample(),layers=singleKindFields(await materialize(p)),clean={ok:true,errors:[],warnings:[]};
 assert.equal(buildProjectContext(p,layers,[],clean,fullContext).budget.truncated,false);
 for(const key of ['errors','warnings']){
  const omitted=buildProjectContext(p,layers,[],{...clean,[key]:Array(11).fill('Message')},fullContext);assert.equal(omitted.validation[key==='errors'?'omittedErrors':'omittedWarnings'],1);assert.equal(omitted.budget.truncated,true);
  const shortened=buildProjectContext(p,layers,[],{...clean,[key]:['Д'.repeat(300)]},fullContext);assert.equal(shortened.validation[key][0].length,256);assert.equal(shortened.validation[key==='errors'?'shortenedErrors':'shortenedWarnings'],1);assert.equal(shortened.budget.truncated,true);assert.equal(shortened.budget.bytes,Buffer.byteLength(JSON.stringify(shortened)));
 }
});

test('PNG and diagnostics reject corrupt project identity instead of bypassing import checks',async()=>{
 const p=await smallProject();for(const operation of ['raster-export','diagnose'])await assert.rejects(()=>execute(operation,{project:{...p,checksum:'00000000'},...(operation==='raster-export'?{options:{scale:1}}:{})}),{code:'CHECKSUM_MISMATCH'});
});

test('PNG and diagnostics remain available for an intact project with invalid edited navigation',async()=>{
 const {seal,validateProject}=await import('../app/project.mjs');let p=await smallProject();const l=(await materialize(p))[0],edits=[{layerId:l.id,x:l.spawn.x,y:l.spawn.y,surface:'wall',trait:'normal'}];p=seal({...p,edits,revision:p.revision+1});assert.equal((await validateProject(p)).ok,false);
 const before=hash(p);assert.equal((await execute('raster-export',{project:p,options:{scale:1}})).files.length,1);assert.ok(await execute('diagnose',{project:p}));assert.equal(hash(p),before);
});

test('recipe export rejects a current catalog that cannot fit its recipe import budget',async()=>{
 const {seal}=await import('../app/project.mjs'),{normalizeRecipe}=await import('../app/index.mjs');let p=await smallProject('relief');const template=p.catalog.find(c=>c.id==='chest');p=seal({...p,catalog:Array.from({length:160},(_,i)=>({...structuredClone(template),id:'budget-'+i,properties:{description:'я'.repeat(3600)}})),revision:p.revision+1});assert.throws(()=>normalizeRecipe(recipeFromProject(p)),{code:'TOO_LARGE'});await assert.rejects(()=>execute('export',{project:p,format:'recipe'}),{code:'TOO_LARGE'});assert.deepEqual(await execute('export',{project:p,format:'project'}),p);
});
