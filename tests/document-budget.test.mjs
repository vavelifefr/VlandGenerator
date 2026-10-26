import test from 'node:test';
import assert from 'node:assert/strict';
import {parseJSON} from '../app/contracts.mjs';
import {createRecipe,normalizeRecipe,generateBase} from '../app/index.mjs';

test('JSON byte limits apply equally to parsed objects and text, including UTF-8 boundaries',()=>{
 const value={text:'Дёрн🌲'},text=JSON.stringify(value),bytes=Buffer.byteLength(text);
 assert.ok(bytes>text.length);
 for(const input of [value,text]){assert.deepEqual(parseJSON(input,bytes),value);assert.throws(()=>parseJSON(input,bytes-1),{code:'TOO_LARGE'});}
 const restored=parseJSON(value,bytes);restored.text='Changed';assert.equal(value.text,'Дёрн🌲');
});

test('recipe byte budget cannot be bypassed with individually valid catalog entries in object form',async()=>{
 const recipe=await createRecipe('dungeon'),template=recipe.catalog.find(c=>c.id==='chest');recipe.catalog=Array.from({length:160},(_,i)=>({...structuredClone(template),id:'entry-'+i,properties:{description:'я'.repeat(3600)}}));assert.ok(Buffer.byteLength(JSON.stringify(recipe))>1024*1024);
 for(const input of [recipe,JSON.stringify(recipe)]){assert.throws(()=>normalizeRecipe(input),{code:'TOO_LARGE'});await assert.rejects(()=>generateBase(input),{code:'TOO_LARGE'});}
});

test('documents that cannot be measured as JSON report a readable JSON error',()=>{
 const cyclic={};cyclic.self=cyclic;
 for(const input of [cyclic,{value:1n},'{broken'])assert.throws(()=>parseJSON(input),{code:'INVALID_JSON'});
});
