import test from 'node:test';
import assert from 'node:assert/strict';
import {availableTools,shortcutAction} from '../Web/HTML/ui/quick-edit-keys.mjs';
const context={enabled:true,stage:'map',kind:'zone',canUndo:true,canRedo:true};
const key=(code,extra={})=>({code,key:'',...extra});
test('shortcuts choose the existing tool for geometry, zones and spawners without changing source kind',()=>{
 assert.deepEqual(shortcutAction(key('KeyB'),context),{type:'tool',tool:'brush'});
 assert.deepEqual(shortcutAction(key('KeyV'),context),{type:'tool',tool:'inspect'});
 assert.deepEqual(shortcutAction(key('KeyV'),{...context,stage:'items'}),{type:'tool',tool:'select'});
 assert.equal(shortcutAction(key('KeyP'),{...context,stage:'items'}),null);
 assert.deepEqual(shortcutAction(key('KeyP'),{...context,stage:'items',kind:'spawner'}),{type:'tool',tool:'pencil'});
 assert.equal(shortcutAction(key('KeyB'),{...context,stage:'items',kind:'spawner'}),null);
 for(const[code,tool]of [['KeyE','eraser'],['KeyR','rectangle'],['KeyL','polygon'],['KeyG','flood']])assert.deepEqual(shortcutAction(key(code),{...context,stage:'items'}),{type:'tool',tool});
 assert.deepEqual(availableTools({...context,readonly:true}),['inspect']);
 assert.equal(shortcutAction(key('KeyB'),{...context,readonly:true}),null);
});
test('history uses Ctrl/Cmd Z, Shift Z and Y, including physical keys on a Russian layout',()=>{
 for(const modifier of ['ctrlKey','metaKey']){
  assert.deepEqual(shortcutAction(key('KeyZ',{[modifier]:true,key:'я'}),context),{type:'history',action:'undo'});
  assert.deepEqual(shortcutAction(key('KeyZ',{[modifier]:true,shiftKey:true}),context),{type:'history',action:'redo'});
  assert.deepEqual(shortcutAction(key('KeyY',{[modifier]:true}),context),{type:'history',action:'redo'});
 }
 assert.equal(shortcutAction(key('KeyZ',{ctrlKey:true}),{...context,canUndo:false}),null);
 assert.equal(shortcutAction(key('KeyY',{ctrlKey:true}),{...context,canRedo:false}),null);
 assert.equal(shortcutAction(key('KeyB',{ctrlKey:true}),context),null);
 assert.equal(shortcutAction(key('KeyZ'),context),null);
});
test('text inputs, modal dialogs, restoration, workers and active pointer strokes retain their own keyboard handling',()=>{
 for(const patch of [{enabled:false},{editable:true},{blocked:true}])for(const event of [key('KeyB'),key('KeyZ',{ctrlKey:true})])assert.equal(shortcutAction(event,{...context,...patch}),null);
 for(const patch of [{defaultPrevented:true},{isComposing:true},{repeat:true},{altKey:true},{shiftKey:true}])assert.equal(shortcutAction(key('KeyB',patch),context),null);
 assert.deepEqual(shortcutAction({key:'b'},context),{type:'tool',tool:'brush'});
});
