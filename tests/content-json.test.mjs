import test from 'node:test';
import assert from 'node:assert/strict';
import {serializeScene,parseScene} from '../content/index.mjs';
const MAX=24*1024*1024;
function scene(value=0){const n=100000;return{map:{schema:'vland.content.map',schemaVersion:4,layers:[{id:'surface',kind:'surface',z:0,depth:0,width:400,height:250,solid:Array(n).fill(0),material:Array(n).fill('soil'),water:Array(n).fill('none'),metrics:Object.fromEntries(Array.from({length:18},(_,i)=>['field-'+i,Array(n).fill(value)]))}],fixtures:[]},catalog:[],sources:[]};}

test('large standalone content scenes export within their own import budget and roundtrip exactly',()=>{
 const input=scene(),document={schema:'vland.content.scene',schemaVersion:4,...input};assert.ok(Buffer.byteLength(JSON.stringify(document,null,2))>MAX);const output=serializeScene(input);assert.ok(Buffer.byteLength(output)<=MAX);assert.equal(output,JSON.stringify(document));assert.deepEqual(parseScene(output),input);assert.deepEqual(parseScene(document),input);
});

test('standalone scene size is enforced for object import and export as well as text',()=>{
 const input=scene(1234567890123),document={schema:'vland.content.scene',schemaVersion:4,...input},text=JSON.stringify(document);assert.ok(Buffer.byteLength(text)>MAX);
 for(const value of [document,text])assert.throws(()=>parseScene(value),{code:'TOO_LARGE'});assert.throws(()=>serializeScene(input),{code:'TOO_LARGE'});
});

test('small scenes stay readable and imports remain independent',()=>{
 const input={map:{schema:'vland.content.map',schemaVersion:4,layers:[{id:'surface',kind:'surface',z:0,depth:0,width:1,height:1,solid:[0],material:['soil'],water:['none']}],fixtures:[]},catalog:[],sources:[]};const text=serializeScene(input);assert.equal(text,JSON.stringify({schema:'vland.content.scene',schemaVersion:4,...input},null,2));const restored=parseScene(JSON.parse(text));restored.map.layers[0].material[0]='rock';assert.equal(input.map.layers[0].material[0],'soil');
});
