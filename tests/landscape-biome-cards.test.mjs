import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {landscapeDefaults} from '../app/modes/natural.mjs';
import {renderControls,syncControlValues} from '../Web/HTML/ui/controls.mjs';
class Element{
 constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.attributes={};this.listeners={};this.value='';this.checked=false;this.disabled=false;this.hidden=false;}
 append(...nodes){this.children.push(...nodes);}
 prepend(...nodes){this.children.unshift(...nodes);}
 replaceChildren(...nodes){this.children=[...nodes];}
 setAttribute(key,value){this.attributes[key]=String(value);}
 getAttribute(key){return this.attributes[key]??null;}
 addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
 dispatchEvent(event){for(const fn of this.listeners[event.type]??[])fn(event);return true;}
 setCustomValidity(value){this.validationMessage=value;}
 matches(selector){if(selector.startsWith('#'))return this.id===selector.slice(1);const match=selector.match(/^\[data-([\w-]+)(?:([\^]?=)"([^"]*)")?\]$/);if(!match)return false;const value=this.dataset[match[1].replace(/-([a-z])/g,(_,c)=>c.toUpperCase())];return value!==undefined&&(!match[2]||(match[2]==='^='?String(value).startsWith(match[3]):String(value)===match[3]));}
 querySelectorAll(selector){return this.children.filter(x=>x instanceof Element).flatMap(x=>[...(x.matches(selector)?[x]:[]),...x.querySelectorAll(selector)]);}
 querySelector(selector){return this.querySelectorAll(selector)[0]??null;}
}


const modes=['landscape','hexlandscape'];
function setup(mode){const container=new Element('div'),actions={generate:new Element('button'),'generate-random':new Element('button')},changed=[],recipe={mode,generation:landscapeDefaults(mode==='landscape'?'square':'hex')};globalThis.document={createElement:tag=>new Element(tag),getElementById:id=>actions[id]??container.querySelector('#'+id)};renderControls(container,recipe,(path,value)=>changed.push({path,value:structuredClone(value)}));return{container,actions,changed,recipe};}
const fire=(element,type='change')=>element.dispatchEvent(new Event(type));
test('repeatable biome rows remain drafts until per-card Add, then retain repeated types and IDs',()=>{const saved=globalThis.document;try{for(const mode of modes){const{container,recipe,changed}=setup(mode);assert.deepEqual(recipe.generation.landscape.biomes,[]);const add=container.querySelector('#add-landscape-biome');for(let i=0;i<10;i++)fire(add,'click');const cards=container.querySelectorAll('[data-biome-card]');assert.equal(cards.length,10);assert.equal(cards.filter(x=>x.open).length,1);assert.equal(cards.at(-1).open,true);assert.equal(recipe.generation.landscape.biomes.length,0);assert.equal(container.querySelector('#landscape-biome-budget').textContent,'Основной биом, %: 100');for(const confirm of container.querySelectorAll('[data-biome-confirm]'))fire(confirm,'click');assert.equal(new Set(recipe.generation.landscape.biomes.map(x=>x.id)).size,10);assert.ok(recipe.generation.landscape.biomes.every(x=>x.type==='forest'));assert.ok(changed.some(x=>x.path==='$biomeDrafts'));assert.ok(changed.some(x=>x.path==='landscape.biomes'));assert.equal(container.querySelector('#landscape-additional-summary'),null);assert.equal(container.querySelector('#landscape-biome-budget').textContent,'Основной биом, %: 0');}}finally{globalThis.document=saved;}});
test('per-card Add caps the shared budget while invalid drafts do not block Create',()=>{
 const saved=globalThis.document;
 try{for(const mode of modes){
  const {container,recipe,actions}=setup(mode),add=container.querySelector('#add-landscape-biome');fire(add,'click');fire(add,'click');
  const confirms=container.querySelectorAll('[data-biome-confirm]'),inputs=container.querySelectorAll('[data-biome-percent]'),stable=confirms[1].dataset.biomeConfirm,type=container.querySelector('[data-biome-type]');
  assert.deepEqual(inputs.map(input=>Number(input.value)),[25,25]);type.value='meadow';fire(type);inputs[0].value='95';fire(inputs[0]);
  assert.equal(Number(inputs[0].value),75,'other visible drafts reserve their25percent share');fire(confirms[0],'click');
  assert.deepEqual(recipe.generation.landscape.biomes.map(card=>card.percent),[75]);
  inputs[1].value='';fire(inputs[1]);const before=structuredClone(recipe.generation.landscape.biomes);fire(confirms[1],'click');
  assert.deepEqual(recipe.generation.landscape.biomes,before,'an invalid unconfirmed draft cannot replace the confirmed recipe');assert.equal(actions.generate.disabled,false);
  inputs[1].value='25';fire(inputs[1]);fire(confirms[1],'click');assert.equal(recipe.generation.landscape.biomes.reduce((sum,card)=>sum+card.percent,0),100);
  inputs[0].value='12.5';fire(inputs[0],'input');assert.equal(recipe.generation.landscape.biomes[0].percent,75,'typing remains a draft');fire(inputs[0]);
  assert.equal(recipe.generation.landscape.biomes[0].percent,12.5,'committing an active share does not require Add');assert.equal(recipe.generation.landscape.biomes[0].type,'meadow');assert.equal(confirms[0].disabled,true);
  fire(container.querySelector('[data-biome-remove]'),'click');assert.deepEqual(recipe.generation.landscape.biomes,[{id:stable,type:'forest',percent:25}]);assert.equal(container.querySelectorAll('[data-biome-card]').length,1);
 }}finally{globalThis.document=saved;}
});

test('request and context schemas expose repeatable percentage cards with bounded IDs',async()=>{for(const file of ['engine/schemas/atlas-request.schema.json','schemas/generation-landscape.schema.json','schemas/generation-hexlandscape.schema.json','schemas/project-context.schema.json']){const s=JSON.parse(await readFile(new URL('../'+file,import.meta.url),'utf8')),p=file.includes('context')?s.properties.project.properties.landscape:s.properties.landscape,c=p.properties.biomes;assert.ok(c,file);assert.equal(p.properties.additionalBiomes,undefined);assert.equal(c.maxItems,64);assert.deepEqual(c.items.required,['id','type','percent']);assert.equal(c.items.properties.id.minLength,1);assert.equal(c.items.properties.id.maxLength,64);assert.equal(c.items.properties.percent.minimum,0);assert.equal(c.items.properties.percent.maximum,100);assert.equal(c.items.properties.percent.multipleOf,.1);assert.equal(c.uniqueItems,undefined);assert.equal(c.items.properties.type.enum.length,8);}});

test('landscape rebuild request requires both source project and full recipe',async()=>{const s=JSON.parse(await readFile(new URL('../schemas/landscape-rebuild-request.schema.json',import.meta.url),'utf8'));assert.equal(s.additionalProperties,false);assert.deepEqual(s.required,['project','recipe']);assert.equal(s.properties.project.$ref,'project.schema.json');assert.equal(s.properties.recipe.$ref,'recipe.schema.json');});

test('restoring ten independent UI fields preserves cards and commits only changed active shares',()=>{
 const saved=globalThis.document;
 try{for(const mode of modes){
  const {container,recipe,changed}=setup(mode);recipe.generation.landscape.biomes=Array.from({length:10},(_,i)=>({id:'saved-'+i,type:['forest','desert','meadow'][i%3],percent:i+.5}));
  renderControls(container,recipe,(path,value)=>changed.push({path,value:structuredClone(value)}));const before=structuredClone(recipe.generation.landscape.biomes);
  const fields=container.querySelectorAll('[data-path]').filter(el=>el.dataset.path.startsWith('$biomeDrafts')),snapshot=fields.map(el=>({path:el.dataset.path,value:el.value}));assert.equal(fields.length,20);assert.equal(new Set(snapshot.map(field=>field.path)).size,20);
  fields.forEach(el=>el.value='');for(const field of snapshot)fields.find(el=>el.dataset.path===field.path).value=field.value;
  changed.length=0;syncControlValues(container);assert.equal(changed.length,0);assert.deepEqual(recipe.generation.landscape.biomes,before);
  const first=container.querySelector('[data-biome-percent]');first.value='3.5';syncControlValues(container);assert.equal(recipe.generation.landscape.biomes[0].percent,3.5);assert.equal(changed.at(-1).path,'landscape.biomes');assert.equal(container.querySelector('[data-biome-confirm]').disabled,true);
  assert.deepEqual(recipe.generation.landscape.biomes.slice(1),before.slice(1));assert.equal(recipe.generation.landscape.biomes[0].type,before[0].type);
  const type=container.querySelector('[data-biome-type]');type.value='mountains';syncControlValues(container);assert.equal(recipe.generation.landscape.biomes[0].type,before[0].type,'a pending type still requires Add');assert.equal(changed.at(-1).path,'$biomeDrafts');
  fire(container.querySelector('[data-biome-confirm]'),'click');assert.deepEqual(recipe.generation.landscape.biomes[0],{id:'saved-0',type:'mountains',percent:3.5});assert.equal(recipe.generation.landscape.biomes.length,10);assert.equal(changed.at(-1).path,'landscape.biomes');
 }}finally{globalThis.document=saved;}
});

test('compact biome settings retain add action and cards without explanatory paragraphs',()=>{const saved=globalThis.document;try{for(const mode of modes){const{container}=setup(mode),add=container.querySelector('#add-landscape-biome'),cards=container.querySelector('#landscape-biome-cards');const owner=node=>node.children.includes(add)?node:node.children.map(owner).find(Boolean);const body=owner(container);assert.ok(body);const base=container.querySelector('[data-path="landscape.baseBiome"]'),baseLabel=body.children.find(node=>node.children.includes(base));assert.ok(baseLabel,'Base biome remains in the same settings block');assert.equal(body.children[body.children.indexOf(baseLabel)+1],cards,'Biome cards follow the base-biome field');assert.ok(body.children.indexOf(cards)<body.children.indexOf(add),'Add follows the growing card stack');assert.equal(body.children.at(-1),add,'Add is the final action under the biome cards');for(let i=0;i<3;i++)fire(add,'click');assert.equal(container.querySelectorAll('[data-biome-card]').length,3);assert.equal(body.children.at(-1),add,'Several draft cards leave Add at the bottom');for(const id of ['landscape-profile-description','landscape-context-description','landscape-water-description','landscape-additional-summary'])assert.equal(container.querySelector('#'+id),null,id+' belongs to the guide, not settings');assert.equal(container.querySelector('#landscape-biome-budget').textContent,'Основной биом, %: 100');}}finally{globalThis.document=saved;}});
