import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

const root=new URL('../',import.meta.url);
const script=`
import {normalizeAtlasRequest} from './engine/api/atlas-catalog.mjs';
import {surfaceFields} from './engine/core/atlas-landforms.mjs';
import {createHash} from 'node:crypto';
const request=normalizeAtlasRequest({schema:'vland.atlas.request',schemaVersion:1,width:300,height:300,layers:{above:0,underground:0},landscape:{structure:'land',baseBiome:'meadow',biomes:[{id:'woods',type:'forest',percent:25}]}});
const fields=surfaceFields(request).fields;
console.log(createHash('sha256').update(JSON.stringify(fields)).digest('hex'));
`;

test('300 Surface generation stays identical on small worker-like JavaScript stacks',()=>{
 const run=stack=>execFileSync(process.execPath,[...(stack?['--stack-size='+stack]:[]),'--input-type=module','-e',script],{cwd:root,encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']}).trim();
 const baseline=run();assert.equal(baseline,'f43858c865075c46ea5c0ef4206903e92f6d10fc3483697809dfb9ec35675531','fields match reviewed Surface with two green cores and discrete geographic bands');
 for(const stack of [256,512])assert.equal(run(stack),baseline,'same fields on '+stack+' KiB stack');
});
