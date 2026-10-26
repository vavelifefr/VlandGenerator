import test from 'node:test';
import assert from 'node:assert/strict';
import {captureBiomeCardDisclosure,restoreBiomeCardDisclosure} from '../Web/HTML/ui/biome-card-disclosure.mjs';
import {renderControls} from '../Web/HTML/ui/controls.mjs';
import {landscapeDefaults} from '../app/modes/natural.mjs';

const card=(id,open=false)=>({dataset:{biomeCard:id},open});
const group=cards=>({cards,querySelectorAll(){return this.cards;}});

class Element{
 constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.attributes={};this.listeners={};this.value='';this.checked=false;}
 append(...nodes){this.children.push(...nodes);}
 prepend(...nodes){this.children.unshift(...nodes);}
 replaceChildren(...nodes){this.children=[...nodes];}
 setAttribute(key,value){this.attributes[key]=String(value);}
 getAttribute(key){return this.attributes[key]??null;}
 addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
 dispatchEvent(event){for(const fn of this.listeners[event.type]??[])fn(event);return true;}
 setCustomValidity(value){this.validationMessage=value;}
 matches(selector){if(selector.startsWith('#'))return this.id===selector.slice(1);const m=selector.match(/^\[data-([\w-]+)(?:([\^]?=)"([^"]*)")?\]$/);if(!m)return false;const v=this.dataset[m[1].replace(/-([a-z])/g,(_,c)=>c.toUpperCase())];return v!==undefined&&(!m[2]||(m[2]==='^='?String(v).startsWith(m[3]):String(v)===m[3]));}
 querySelectorAll(selector){return this.children.filter(x=>x instanceof Element).flatMap(x=>[...(x.matches(selector)?[x]:[]),...x.querySelectorAll(selector)]);}
 querySelector(selector){return this.querySelectorAll(selector)[0]??null;}
}

test('newly added biome remains expanded after the recalculation rebuilds its controls',()=>{
 const controls=group([card('biome-1'),card('biome-2',true)]),saved=captureBiomeCardDisclosure(controls);
 // renderControls builds a new set of details elements, initially all closed.
 controls.cards=[card('biome-1'),card('biome-2')];restoreBiomeCardDisclosure(controls,saved);
 assert.deepEqual(captureBiomeCardDisclosure(controls),[{id:'biome-1',open:false},{id:'biome-2',open:true}]);
});

test('manual mixed disclosure survives reordering and excludes removed or newly introduced IDs',()=>{
 const controls=group([card('woods-1',true),card('woods-2'),card('mountain-1',true)]),saved=captureBiomeCardDisclosure(controls);
 controls.cards=[card('woods-2',true),card('woods-1'),card('new-region')];restoreBiomeCardDisclosure(controls,saved);
 assert.deepEqual(captureBiomeCardDisclosure(controls),[{id:'woods-2',open:false},{id:'woods-1',open:true},{id:'new-region',open:false}]);
});

test('all manually collapsed cards remain collapsed and an absent session preference leaves defaults',()=>{
 const controls=group([card('biome-1')]),saved=captureBiomeCardDisclosure(controls);controls.cards=[card('biome-1',true)];restoreBiomeCardDisclosure(controls,saved);assert.equal(controls.cards[0].open,false);
 controls.cards=[card('biome-1',true)];restoreBiomeCardDisclosure(controls,undefined);assert.equal(controls.cards[0].open,true);
});

test('both real control renderers preserve the newly added card through a recipe refresh',()=>{
 const previous=globalThis.document;
 try{for(const mode of ['landscape','hexlandscape']){
  const container=new Element('div'),actions={generate:new Element('button'),'generate-random':new Element('button')};
  globalThis.document={createElement:tag=>new Element(tag),getElementById:id=>actions[id]??container.querySelector('#'+id)};
  const drafts=[];let recipe={mode,generation:landscapeDefaults(mode==='landscape'?'square':'hex')};renderControls(container,recipe,()=>{},{biomeDrafts:drafts});
  container.querySelector('#add-landscape-biome').dispatchEvent(new Event('click'));
  const saved=captureBiomeCardDisclosure(container);assert.equal(saved.length,1);assert.equal(saved[0].open,true);
  recipe=structuredClone(recipe);renderControls(container,recipe,()=>{},{biomeDrafts:drafts});
  assert.equal(container.querySelector('[data-biome-card]').open,false,'the control renderer recreates closed details');
  restoreBiomeCardDisclosure(container,saved);assert.equal(container.querySelector('[data-biome-card]').open,true);
 }}finally{globalThis.document=previous;}
});
