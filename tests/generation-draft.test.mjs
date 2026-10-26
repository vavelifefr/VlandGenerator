import test from 'node:test';
import assert from 'node:assert/strict';
import {generationDraftChanged} from '../Web/HTML/ui/generation-draft.mjs';

test('explicit confirmed biome actions start generation; drafts and other edits remain pending',()=>{
 let pending=0,builds=0;const messages=[],context={project:{checksum:'shown-map'},pending:()=>pending++,status:message=>messages.push(message),generate:()=>++builds};
 // Only committed card actions supply regenerate; input and pending types do not.
 for(const path of ['landscape.biomes','landscape.biomes','landscape.biomes','landscape.biomes'])generationDraftChanged(path,context);
 assert.equal(pending,4);assert.equal(builds,0,'draft edits leave the displayed map untouched');assert.ok(messages.every(message=>message==='Настройки биомов изменены.'));
 generationDraftChanged('landscape.biomes',{...context,regenerate:true});assert.equal(builds,1,'inner Add regenerates immediately');assert.equal(pending,5);
});

test('base biome selection immediately generates with and without an existing map',()=>{
 for(const project of [null,{checksum:'shown-map'}]){
  const calls=[];generationDraftChanged('landscape.baseBiome',{project,pending:()=>calls.push('pending'),generate:()=>calls.push('generate'),status:()=>calls.push('status')});
  assert.deepEqual(calls,['pending','generate'],'selection starts generation directly and preserves its status message');
 }
});

test('ordinary geometry edits remain pending without a background generation',()=>{
 let pending=false,builds=0;generationDraftChanged('width',{pending:()=>pending=true,status:()=>{},project:{},recalculation:{schedule:()=>builds++}});assert.equal(pending,true);assert.equal(builds,0);
});
