import test from 'node:test';
import assert from 'node:assert/strict';
import {createRecipe} from '../app/index.mjs';
import {updateTierDraft} from '../Web/HTML/ui/tier-drafts.mjs';
test('changing tier counts, common room count or headroom preserves layer IDs, corridor policies and distinct floor drafts',async()=>{
 const r=await createRecipe('tiers'),g=r.generation,ids=g.layers.map(l=>l.id);g.layers[0].request.layout={...g.layers[0].request.layout,corridors:{minLength:4,maxLength:8,preferredLength:5,openWidth:2},allowDisconnected:true};g.layers[1].request.layout={...g.layers[1].request.layout,architecture:'ring'};
 const options={count:3,rooms:5,headroom:3,kind:'stairs',changed:'$layerCount'};assert.equal(updateTierDraft(g,options),true);assert.deepEqual(g.layers.slice(0,2).map(l=>l.id),ids);assert.equal(g.layers[0].request.layout.corridors.minLength,4);assert.equal(g.layers[1].request.layout.architecture,'ring');assert.equal(g.links.length,2);
 updateTierDraft(g,{...options,rooms:9,changed:'$roomCount'});assert.ok(g.layers.every(l=>l.request.rooms.count===9));assert.equal(g.layers[0].request.layout.corridors.maxLength,8);
 updateTierDraft(g,{...options,headroom:7,changed:'$headroom'});assert.deepEqual(g.layers.map(l=>l.elevation),[0,8,16]);assert.equal(g.layers[0].request.layout.allowDisconnected,true);
 const before=structuredClone(g);assert.equal(updateTierDraft(g,{...options,count:undefined}),false);assert.deepEqual(g,before);
});
