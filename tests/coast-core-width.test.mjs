import test from 'node:test';
import assert from 'node:assert/strict';
import {coastCoreWidth} from '../tools/verify-coast-correction.mjs';

const w=128,h=128,mask=fn=>Uint8Array.from({length:w*h},(_,i)=>+fn(i%w,Math.floor(i/w)));
test('coast core width distinguishes repeated thin parallel horns from broad capes',()=>{
 const fingers=mask((x,y)=>x<44||x<112&&[22,64,105].some(center=>Math.abs(y-center)<3)),broad=mask((x,y)=>x<44||((x-40)/53)**2+((y-64)/38)**2<1);
 for(const kind of ['square','hex']){const a=coastCoreWidth(fingers,w,h,{kind}),b=coastCoreWidth(broad,w,h,{kind});assert.ok(a.primary.lostFraction>.10,'Rejected parallel horns lose substantial area');assert.ok(b.primary.lostFraction<.04,'Broad cape has a usable core');assert.equal(a.scales.length,3);}
});
test('coast opening preserves a straight shore against a dry map border',()=>{
 for(const kind of ['square','hex'])for(const row of coastCoreWidth(mask((x,y)=>x<64),w,h,{kind}).scales)assert.equal(row.lostFraction,0,'Dry map edges are not false sea');
});
