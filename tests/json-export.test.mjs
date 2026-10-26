import test from 'node:test';
import assert from 'node:assert/strict';
import {serializeDocument} from '../app/json-export.mjs';
test('small exports stay readable and preserve Unicode and the document exactly',()=>{
 const value={name:'Карта',schemaVersion:4,sources:[{id:'manual',text:'Дёрн'}]};
 assert.equal(serializeDocument(value),JSON.stringify(value,null,2)+'\n');assert.deepEqual(JSON.parse(serializeDocument(value)),value);
});
test('large exports fit their own import budget without changing data',()=>{
 const value={schema:'vland.project',schemaVersion:4,cells:Array(4000000).fill(0),meta:{sourceId:'manual-1'}};
 assert.ok(Buffer.byteLength(JSON.stringify(value,null,2))>24*1024*1024);
 const text=serializeDocument(value);assert.ok(Buffer.byteLength(text)<24*1024*1024);assert.equal(text,JSON.stringify(value)+'\n');
 const restored=JSON.parse(text);assert.equal(restored.cells.length,value.cells.length);assert.ok(restored.cells.every(v=>v===0));assert.deepEqual(restored.meta,value.meta);assert.equal(restored.schema,value.schema);
});
test('formatting threshold is based on UTF-8 bytes, not character count',()=>{
 const value={text:'я'.repeat(700000)};assert.equal(serializeDocument(value),JSON.stringify(value)+'\n');assert.throws(()=>serializeDocument(undefined));
});

test('LLM context downloads stay compact even below the general pretty-print threshold',()=>{
 const value={schema:'vland.project.context',schemaVersion:4,layers:[{id:'surface',cells:65536}]};assert.equal(serializeDocument(value),JSON.stringify(value)+'\n');
});

test('a recipe near 1MiB stays importable when whitespace would exceed its budget',async()=>{
 const {createRecipe,normalizeRecipe}=await import('../app/index.mjs'),recipe=await createRecipe('relief'),template=recipe.catalog.find(c=>c.id==='chest');recipe.catalog=Array.from({length:138},(_,i)=>({...structuredClone(template),id:'entry-'+i,properties:{description:'я'.repeat(3600)}}));assert.ok(Buffer.byteLength(JSON.stringify(recipe))<1024*1024);assert.ok(Buffer.byteLength(JSON.stringify(recipe,null,2))>1024*1024);assert.deepEqual(normalizeRecipe(serializeDocument(recipe)),recipe);
});

test('formatting never pushes a document beyond its declared byte budget at the exact boundary',async()=>{
 const {parseJSON}=await import('../app/contracts.mjs'),limit=24*1024*1024,value={schema:'vland.project',schemaVersion:4,text:''},overhead=Buffer.byteLength(JSON.stringify(value));value.text='x'.repeat(limit-overhead);const output=serializeDocument(value);assert.equal(Buffer.byteLength(output),limit);assert.deepEqual(parseJSON(output),value);
});
