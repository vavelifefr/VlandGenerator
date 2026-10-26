import test from 'node:test';
import assert from 'node:assert/strict';
import {execute,API_CONTRACT} from '../app/index.mjs';
import {smallRecipe,smallProject} from './helpers.mjs';

test('operation job fields agree with the published contract instead of silently ignoring typos',async()=>{
 for(const operation of API_CONTRACT.operations)await assert.rejects(()=>execute(operation,{unexpected:true}),{code:'UNKNOWN_FIELD'});
});

test('missing required job fields produce a named input error before running an operation',async()=>{
 for(const operation of API_CONTRACT.operations.filter(name=>name!=='export'&&API_CONTRACT.operationDetails[name].required.length))await assert.rejects(()=>execute(operation,{}),e=>e.code==='INVALID_INPUT'&&e.message.includes(API_CONTRACT.operationDetails[operation].required[0]));
});

test('documented raw recipe/project inputs still work alongside canonical job envelopes',async()=>{
 const recipe=await smallRecipe(),p=await smallProject();assert.deepEqual(await execute('generate-base',recipe),await execute('generate-base',{recipe}));assert.deepEqual(await execute('generate-base',JSON.stringify(recipe)),p);assert.deepEqual(await execute('import',JSON.stringify(p)),p);assert.deepEqual(await execute('import',p),p);assert.equal((await execute('validate',p)).ok,true);assert.equal((await execute('defaults',{})).mode,'dungeon');
});
