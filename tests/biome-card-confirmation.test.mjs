import test from 'node:test';
import assert from 'node:assert/strict';
import {renderControls} from '../Web/HTML/ui/controls.mjs';
import {landscapeDefaults} from '../app/modes/natural.mjs';
import {restoreBiomeDrafts,confirmBiomeDraft,confirmedBiomeDraft} from '../Web/HTML/ui/biome-card-drafts.mjs';
import {generationDraftChanged} from '../Web/HTML/ui/generation-draft.mjs';
import {LANDSCAPE_BIOMES} from '../engine/core/landscape-profile.mjs';
class Element{constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.listeners={};this.value='';this.attributes={};}append(...v){this.children.push(...v);}replaceChildren(...v){this.children=v;}setAttribute(k,v){this.attributes[k]=v;}getAttribute(k){return this.attributes[k];}setCustomValidity(v){this.validationMessage=v;}addEventListener(k,f){(this.listeners[k]??=[]).push(f);}dispatchEvent(e){for(const f of this.listeners[e.type]??[])f(e);}matches(s){if(s.startsWith('#'))return this.id===s.slice(1);const m=s.match(/^\[data-([\w-]+)(?:="([^"]*)")?\]$/);if(!m)return false;const v=this.dataset[m[1].replace(/-([a-z])/g,(_,c)=>c.toUpperCase())];return v!==undefined&&(m[2]===undefined||v===m[2]);}querySelectorAll(s){return this.children.flatMap(v=>v instanceof Element?[...(v.matches(s)?[v]:[]),...v.querySelectorAll(s)]:[]);}querySelector(s){return this.querySelectorAll(s)[0];}}
const fire=(e,type='click')=>e.dispatchEvent(new Event(type));

test('committing an added biome share regenerates once on both grids; typing and invalid input do not',()=>{
 const saved=globalThis.document;
 try{for(const mode of ['landscape','hexlandscape'])for(const structure of ['land','coast','islands','continent']){
  const box=new Element('div'),recipe={mode,generation:landscapeDefaults(mode==='landscape'?'square':'hex')},drafts=[],builds=[];
  Object.assign(recipe.generation.landscape,{structure,biomes:[{id:'active',type:'forest',percent:25},{id:'other',type:'swamp',percent:25}]});
  globalThis.document={createElement:t=>new Element(t),getElementById:id=>box.querySelector('#'+id)};
  renderControls(box,recipe,(path,value,action)=>generationDraftChanged(path,{...action,pending:()=>{},status:()=>{},generate:()=>builds.push(structuredClone(recipe.generation.landscape.biomes))}),{biomeDrafts:drafts});
  const input=box.querySelector('[data-biome-percent]');input.value='35';fire(input,'input');assert.equal(recipe.generation.landscape.biomes[0].percent,25);assert.equal(builds.length,0);
  fire(input,'change');assert.equal(recipe.generation.landscape.biomes[0].percent,35,mode+'/'+structure+' share must be applied without Add');assert.equal(builds.length,1);assert.equal(box.querySelector('[data-biome-confirm]').disabled,true);
  fire(input,'change');assert.equal(builds.length,1,'a repeated commit of the same value must not generate twice');
  input.value='37.5';fire(input,'input');const enter=new Event('keydown');Object.defineProperty(enter,'key',{value:'Enter'});input.dispatchEvent(enter);assert.equal(recipe.generation.landscape.biomes[0].percent,37.5);assert.equal(builds.length,2,'Enter commits the field immediately');
  input.value='';fire(input,'input');fire(input,'change');assert.equal(recipe.generation.landscape.biomes[0].percent,37.5);assert.equal(builds.length,2,'empty input retains the previous applied share');
  input.value='999';fire(input,'input');fire(input,'change');assert.equal(recipe.generation.landscape.biomes[0].percent,75);assert.equal(builds.length,3);assert.equal(recipe.generation.landscape.biomes.reduce((s,c)=>s+c.percent,0),100);
  input.value='0';fire(input,'change');assert.equal(recipe.generation.landscape.biomes[0].percent,0);assert.equal(builds.length,4);assert.equal(box.querySelector('#landscape-biome-budget').textContent,'Основной биом, %: 75');
 }}finally{globalThis.document=saved;}
});

test('an added share commits independently of pending type edits and respects other pending card budgets',()=>{
 const saved=globalThis.document;
 try{for(const mode of ['landscape','hexlandscape']){
  const box=new Element('div'),recipe={mode,generation:landscapeDefaults(mode==='landscape'?'square':'hex')},drafts=[{id:'active',type:'mountains',percent:'25'},{id:'pending',type:'swamp',percent:'12.5'}],actions=[];
  recipe.generation.landscape.biomes=[{id:'active',type:'forest',percent:25}];globalThis.document={createElement:t=>new Element(t),getElementById:id=>box.querySelector('#'+id)};
  renderControls(box,recipe,(path,value,action)=>actions.push(action),{biomeDrafts:drafts});const inputs=box.querySelectorAll('[data-biome-percent]');
  inputs[1].value='20';fire(inputs[1],'change');assert.equal(recipe.generation.landscape.biomes.length,1);assert.equal(actions.filter(a=>a?.regenerate).length,0,'unconfirmed cards still require Add');
  inputs[0].value='999';fire(inputs[0],'input');fire(inputs[0],'change');assert.deepEqual(recipe.generation.landscape.biomes,[{id:'active',type:'forest',percent:80}]);assert.equal(drafts[0].type,'mountains','the type draft is retained without applying it');assert.equal(box.querySelector('[data-biome-confirm]').disabled,false);assert.equal(actions.filter(a=>a?.regenerate).length,1);
  fire(box.querySelector('[data-biome-confirm]'));assert.deepEqual(recipe.generation.landscape.biomes,[{id:'active',type:'mountains',percent:80}]);assert.equal(actions.filter(a=>a?.regenerate).length,2,'the explicit Add still confirms a pending type');
 }}finally{globalThis.document=saved;}
});

test('every base biome selection reaches generation on both grids without dropping confirmed or pending cards',()=>{
 const saved=globalThis.document;
 try{for(const mode of ['landscape','hexlandscape'])for(const structure of ['land','coast','islands','continent'])for(const type of Object.keys(LANDSCAPE_BIOMES)){
  const box=new Element('div'),recipe={mode,generation:landscapeDefaults(mode==='landscape'?'square':'hex')},builds=[];
  Object.assign(recipe.generation.landscape,{structure,baseBiome:type==='meadow'?'forest':'meadow',biomes:[{id:'saved',type:'forest',percent:25}]});
  const drafts=[{id:'saved',type:'forest',percent:'25'},{id:'pending',type:'swamp',percent:'12.5'}],before=structuredClone(drafts);
  globalThis.document={createElement:t=>new Element(t),getElementById:id=>box.querySelector('#'+id)};
  renderControls(box,recipe,(path,value,action)=>generationDraftChanged(path,{...action,pending:()=>{},status:()=>{},generate:()=>builds.push(structuredClone(recipe))}),{biomeDrafts:drafts});
  const field=box.querySelector('[data-path="landscape.baseBiome"]');field.value=type;fire(field,'change');
  assert.equal(builds.length,1,mode+'/'+structure+'/'+type+' must generate immediately');assert.equal(builds[0].generation.landscape.baseBiome,type);
  assert.deepEqual(builds[0].generation.landscape.biomes,[{id:'saved',type:'forest',percent:25}]);assert.deepEqual(drafts,before,'pending cards remain UI-only and are preserved');
  const width=box.querySelector('[data-path="width"]');width.value='100';fire(width,'change');assert.equal(builds.length,1,'ordinary geometry edits still remain pending');
 }}finally{globalThis.document=saved;}
});

test('removing an active biome regenerates on both grids, including pending edits and the last card; UI-only drafts do not',()=>{
 const saved=globalThis.document;
 try{for(const mode of ['landscape','hexlandscape'])for(const structure of ['land','coast','islands','continent']){
  const box=new Element('div'),recipe={mode,generation:landscapeDefaults(mode==='landscape'?'square':'hex')},drafts=[],actions=[];
  recipe.generation.landscape.structure=structure;recipe.generation.landscape.biomes=[{id:'first',type:'forest',percent:25},{id:'second',type:'swamp',percent:25}];
  globalThis.document={createElement:t=>new Element(t),getElementById:id=>box.querySelector('#'+id)};
  renderControls(box,recipe,(path,value,action)=>actions.push({path,cards:structuredClone(recipe.generation.landscape.biomes),action}),{biomeDrafts:drafts});
  fire(box.querySelector('#add-landscape-biome'));fire(box.querySelectorAll('[data-biome-remove]')[2]);
  assert.equal(actions.filter(a=>a.action?.regenerate).length,0,'removing an unconfirmed draft leaves the map intact');
  const percent=box.querySelector('[data-biome-percent]');percent.value='40';fire(percent,'input');
  fire(box.querySelector('[data-biome-remove]'));
  const removed=actions.at(-1);assert.equal(removed.path,'landscape.biomes');assert.equal(removed.action?.regenerate,true,mode+'/'+structure+' deletion must request immediate generation');
  assert.deepEqual(removed.cards,[{id:'second',type:'swamp',percent:25}],'the generator receives the recipe after deletion');
  assert.equal(box.querySelector('#landscape-biome-budget').textContent,'Основной биом, %: 75');
  fire(box.querySelector('[data-biome-remove]'));assert.deepEqual(actions.at(-1).cards,[]);assert.equal(actions.at(-1).action?.regenerate,true,'the last confirmed card also regenerates');
  assert.equal(box.querySelector('#landscape-biome-budget').textContent,'Основной биом, %: 100');assert.equal(actions.filter(a=>a.action?.regenerate).length,2);
 }}finally{globalThis.document=saved;}
});

test('both biome editors default to25percent and cap several drafts and confirmed edits at the remaining budget',()=>{
 const saved=globalThis.document;
 try{for(const mode of ['landscape','hexlandscape']){
  const box=new Element('div'),recipe={mode,generation:landscapeDefaults(mode==='landscape'?'square':'hex')},drafts=[],actions=[];
  globalThis.document={createElement:t=>new Element(t),getElementById:id=>box.querySelector('#'+id)};
  renderControls(box,recipe,(path,value,action)=>actions.push({path,action}),{biomeDrafts:drafts});
  for(let i=0;i<4;i++){fire(box.querySelector('#add-landscape-biome'));assert.equal(drafts.at(-1).percent,'25',mode+' defaults25');}
  fire(box.querySelector('#add-landscape-biome'));assert.equal(drafts.at(-1).percent,'0','pending rows also reserve the visible budget');
  const inputs=box.querySelectorAll('[data-biome-percent]'),buttons=box.querySelectorAll('[data-biome-confirm]');
  inputs[0].value='90';fire(inputs[0],'change');assert.equal(Number(inputs[0].value),25,'edited draft cannot overbook other drafts');
  for(const b of buttons.slice(0,4))fire(b);
  assert.equal(recipe.generation.landscape.biomes.reduce((s,b)=>s+b.percent,0),100);
  assert.equal(actions.filter(a=>a.action?.regenerate).length,4,'only successful inner Add requests generation');
  inputs[0].value='10.5';fire(inputs[0],'change');assert.equal(buttons[0].disabled,true);assert.equal(actions.filter(a=>a.action?.regenerate).length,5);
  inputs[4].value='90';fire(inputs[4],'input');fire(buttons[4]);
  assert.equal(recipe.generation.landscape.biomes.at(-1).percent,14.5,'confirm also clamps a still-typing value to the exact remainder');
  assert.equal(recipe.generation.landscape.biomes.reduce((s,b)=>s+b.percent,0),100);
  assert.equal(actions.filter(a=>a.action?.regenerate).length,6);
 }}finally{globalThis.document=saved;}
});

test('a new biome uses the remainder below25percent and excludes its own confirmed share when edited',()=>{
 const saved=globalThis.document;
 try{const box=new Element('div'),recipe={mode:'landscape',generation:landscapeDefaults('square')},drafts=[];
  recipe.generation.landscape.biomes=[{id:'fixed',type:'forest',percent:87.5}];
  globalThis.document={createElement:t=>new Element(t),getElementById:id=>box.querySelector('#'+id)};
  renderControls(box,recipe,()=>{},{biomeDrafts:drafts});fire(box.querySelector('#add-landscape-biome'));
  assert.equal(drafts.at(-1).percent,'12.5');const input=box.querySelectorAll('[data-biome-percent]')[0];
  input.value='5';fire(input,'change');assert.equal(recipe.generation.landscape.biomes[0].percent,5);
  input.value='500';fire(input,'change');assert.equal(Number(input.value),87.5,'own share is replaceable without double-counting');
 }finally{globalThis.document=saved;}
});
test('new cards stay UI-only until their own Add, and edits preserve the previously confirmed quota',()=>{
 const saved=globalThis.document;try{const box=new Element('div'),recipe={mode:'landscape',generation:landscapeDefaults('square')},drafts=[],changed=[];globalThis.document={createElement:t=>new Element(t),getElementById:id=>box.querySelector('#'+id)};renderControls(box,recipe,(p,v)=>changed.push(p),{biomeDrafts:drafts});
 fire(box.querySelector('#add-landscape-biome'));assert.equal(recipe.generation.landscape.biomes.length,0);assert.equal(box.querySelector('#landscape-biome-budget').textContent,'Основной биом, %: 100');
 const add=box.querySelector('[data-biome-confirm]');assert.ok(add,'per-card Add');const percent=box.querySelector('[data-biome-percent]');percent.value='35';fire(percent,'change');fire(add);assert.equal(recipe.generation.landscape.biomes[0].percent,35);assert.equal(add.disabled,true);
 percent.value='40';fire(percent,'input');assert.equal(recipe.generation.landscape.biomes[0].percent,35);assert.equal(add.disabled,false);fire(add);assert.equal(recipe.generation.landscape.biomes[0].percent,40);
 assert.ok(changed.includes('landscape.biomes'));assert.ok(changed.includes('$biomeDrafts'));
 const owner=box.querySelector('[data-biome-card]').children[1];assert.ok(owner.children.indexOf(add)<owner.children.findIndex(e=>e.dataset.biomeRemove));
 }finally{globalThis.document=saved;}
});
test('UI draft restore preserves unconfirmed rows and confirmed edits without changing canonical cards',()=>{
 const profile={biomes:[{id:'a',type:'forest',percent:20}]},saved=[{id:'a',type:'forest',percent:'40'},{id:'b',type:'meadow',percent:'81'}],before=structuredClone(profile),rows=restoreBiomeDrafts(profile,saved);assert.deepEqual(profile,before);assert.deepEqual(rows,saved);assert.equal(confirmedBiomeDraft(profile,rows[0]),false);assert.throws(()=>confirmBiomeDraft(profile,rows[1],['forest','meadow']));assert.deepEqual(profile,before);confirmBiomeDraft(profile,rows[0],['forest','meadow']);assert.equal(profile.biomes[0].percent,40);
});
test('bounded restore never lets pending UI rows hide existing confirmed cards',()=>{
 const profile={biomes:Array.from({length:64},(_,i)=>({id:'saved-'+i,type:'forest',percent:0}))},before=structuredClone(profile),saved=Array.from({length:64},(_,i)=>({id:'draft-'+i,type:'forest',percent:'invalid'})),rows=restoreBiomeDrafts(profile,saved);assert.equal(rows.length,64);assert.deepEqual(new Set(rows.map(r=>r.id)),new Set(profile.biomes.map(r=>r.id)));assert.deepEqual(profile,before);
});
