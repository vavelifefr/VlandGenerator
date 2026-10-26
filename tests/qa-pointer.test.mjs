import test from 'node:test';
import assert from 'node:assert/strict';
import {pointerCoordinates} from '../Web/HTML/ui/qa-pointer.mjs';

test('QA pointer target keeps document coordinates stable when the outer page scrolls',()=>{
  const visible=pointerCoordinates({frame:{left:10,top:41},canvas:{left:302,top:130},offset:{x:385,y:288},scroll:{x:0,y:0}});
  const scrolled=pointerCoordinates({frame:{left:10,top:0},canvas:{left:302,top:130},offset:{x:385,y:288},scroll:{x:0,y:41}});
  assert.deepEqual(visible.screen,[697,459]);
  assert.deepEqual(scrolled.screen,visible.screen);
  assert.deepEqual(scrolled.viewport,[697,418]);
});

test('QA pointer target accounts for iframe borders and horizontal scrolling',()=>{
  const result=pointerCoordinates({frame:{left:5,top:20},canvas:{left:100,top:-40},offset:{x:50.5,y:300.25},scroll:{x:25,y:100},border:{x:2,y:3}});
  assert.deepEqual(result.viewport,[157.5,283.25]);
  assert.deepEqual(result.screen,[182.5,383.25]);
});
