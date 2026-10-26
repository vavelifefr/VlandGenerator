import test from 'node:test';
import assert from 'node:assert/strict';
import {restoreSourceSelection} from '../Web/HTML/ui/source-selection.mjs';
const zone={id:'zone',category:'items',kind:'zone',layerId:'surface'};
const scope={stage:'items',kind:'zone',layerId:'surface',sourceId:null};
test('redoing a newly drawn zone selects it so the next stroke edits the same source',()=>{
 assert.equal(restoreSourceSelection([], [zone],scope),'zone');
 assert.equal(restoreSourceSelection([zone],[],{...scope,sourceId:'zone'}),null);
});
test('history keeps valid selection and selects only a restored source in the current scope',()=>{
 const other={...zone,id:'other'};
 assert.equal(restoreSourceSelection([zone],[zone,other],{...scope,sourceId:'zone'}),'zone');
 for(const changed of [{category:'flora'},{kind:'spawner'},{layerId:'cave'}])assert.equal(restoreSourceSelection([],[{...zone,...changed}],scope),null);
 assert.equal(restoreSourceSelection([zone],[zone],scope),null);
});
