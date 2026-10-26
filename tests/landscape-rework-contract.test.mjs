import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRecipe,normalizeRecipe,generateBase,execute,validateProject} from '../app/index.mjs';
import {normalizeAtlasRequest,ATLAS_MAX_CELLS} from '../engine/api/atlas-catalog.mjs';
import {normalizeLandscapeProfile,LANDSCAPE_BIOMES} from '../engine/core/landscape-profile.mjs';
import {generationSettingsErrors} from '../app/generation-settings.mjs';
import {atlasSizeBudget} from '../app/generation-budget.mjs';
import {FIELDS,renderControls} from '../Web/HTML/ui/controls.mjs';

const modes=['landscape','hexlandscape'],ids=Object.keys(LANDSCAPE_BIOMES);
const profile={structure:'land',baseBiome:'meadow',landPercent:75,uniformity:50,coastErosion:50},load=async file=>JSON.parse(await readFile(new URL('../'+file,import.meta.url),'utf8'));
const request=(size=32,extra={})=>({schema:'vland.atlas.request',schemaVersion:1,width:size,height:size,layers:{above:0,underground:0},...extra});

test('landscape recipes default to independent empty biome-card arrays',async()=>{
 for(const mode of modes){const a=await createRecipe(mode);assert.deepEqual(a.generation.landscape,{...profile,biomes:[]});a.generation.landscape.biomes.push({id:'forest-1',type:'forest',percent:10});assert.deepEqual((await createRecipe(mode)).generation.landscape.biomes,[]);}
});

test('repeatable biome cards normalize without mutating order, IDs or area shares',async()=>{
 assert.deepEqual(normalizeLandscapeProfile(profile),{...profile,biomes:[]});
 const input={...profile,biomes:[{id:'forest-2',type:'forest',percent:12.5},{id:'forest-1',type:'forest',percent:10},{id:'main-extra',type:'meadow',percent:0}]},before=structuredClone(input);assert.deepEqual(normalizeLandscapeProfile(input),input);assert.deepEqual(input,before);assert.deepEqual(normalizeLandscapeProfile(normalizeLandscapeProfile(input)),input);
 for(const bad of [null,'forest',{},['forest'],[{id:'x',type:'jungle',percent:1}],[{id:'x',type:'forest',percent:101}],[{id:'x',type:'forest',percent:-1}],[{id:'x',type:'forest',percent:.01}],[{id:'x',type:'forest',percent:60},{id:'y',type:'swamp',percent:41}],[{id:'x',type:'forest',percent:1},{id:'x',type:'forest',percent:2}]])assert.throws(()=>normalizeLandscapeProfile({...profile,biomes:bad}),JSON.stringify(bad));
 for(const mode of modes){const r=await createRecipe(mode);r.generation.landscape=input;const original=structuredClone(r);assert.deepEqual(normalizeRecipe(r).generation.landscape,input);assert.deepEqual(r,original);}
});

test('atlas sides 50,100,200,300 are accepted while side 301 and oversized physical stacks are rejected',()=>{
 for(const size of [50,100,200,300])for(const kind of ['square','hex']){const r=normalizeAtlasRequest(request(size,{topology:{kind}}));assert.equal(r.width,size);assert.equal(r.height,size);assert.equal(atlasSizeBudget('landscape',r).ok,true);}
 for(const side of ['width','height'])assert.throws(()=>normalizeAtlasRequest({...request(32),[side]:301}),{code:'INVALID_ATLAS'});
 assert.throws(()=>normalizeAtlasRequest(request(300,{layers:{above:0,underground:1}})),{code:'ATLAS_TOO_LARGE'});assert.equal(atlasSizeBudget('landscape',request(300,{layers:{above:0,underground:1}})).ok,false);assert.equal(ATLAS_MAX_CELLS,98304);
 for(const mode of ['landscape','hexlandscape','caves','relief'])for(const name of ['width','height'])assert.equal(FIELDS[mode].flatMap(x=>x[1]).find(x=>x.path===name).max,300);
});

test('published request/context schemas describe percentage cards and repeated types',async()=>{
 for(const file of ['engine/schemas/atlas-request.schema.json','schemas/generation-landscape.schema.json','schemas/generation-hexlandscape.schema.json','schemas/project-context.schema.json']){const s=await load(file),p=file.includes('context')?s.properties.project.properties.landscape:s.properties.landscape,a=p.properties.biomes;assert.ok(a,file);assert.equal(a.type,'array');assert.equal(a.maxItems,64);assert.equal(a.uniqueItems,undefined);assert.deepEqual(a.items.properties.type.enum,[...ids,'gravel']);assert.deepEqual(a.items.required,['id','type','percent']);assert.equal(a.items.properties.percent.multipleOf,.1);assert.equal(p.properties.additionalBiomes,undefined);}
 for(const file of ['engine/schemas/atlas-request.schema.json',...['landscape','hexlandscape','caves','relief'].map(mode=>'schemas/generation-'+mode+'.schema.json')]){const s=await load(file);for(const k of ['width','height'])assert.equal(s.properties[k].maximum,300,file);}
});

test('native output schemas cover a 300-square cell index and the no-sea distance sentinel',async()=>{
 for(const file of ['engine/schemas/atlas.schema.json','engine/schemas/atlas-tiles.schema.json']){const layer=(await load(file)).properties.layers.items.properties,f=layer.fields.properties;if(layer.routeCells)assert.ok(layer.routeCells.items.maximum>=89999,file+' routeCells');if(layer.deposits)assert.ok(layer.deposits.items.properties.cells.maxItems>=90000,file+' deposit cells');for(const [key,value] of Object.entries(f))assert.ok(value.maxItems>=90000,file+' '+key);for(const key of ['flowTo','flowRank','basin'])assert.ok(f[key].items.maximum>=89999,file+' '+key);assert.ok(f.drainage.items.maximum>=90000);assert.ok(f.coastDistance.items.maximum>=600);}
});

test('recipe/native/context preserve repeated card identities and percentages; changed shares are stale',async()=>{
 for(const mode of modes){const r=await createRecipe(mode);Object.assign(r.generation,{width:32,height:32,landscape:{structure:'land',baseBiome:'meadow',biomes:[{id:'swamp-1',type:'swamp',percent:10},{id:'forest-1',type:'forest',percent:20},{id:'forest-2',type:'forest',percent:5}]}});const before=structuredClone(r),p=await generateBase(r);assert.deepEqual(r,before);assert.deepEqual(p.recipe.generation.landscape.biomes,r.generation.landscape.biomes);assert.deepEqual(p.source.request.landscape,p.recipe.generation.landscape);assert.equal((await validateProject(p)).ok,true);assert.deepEqual((await execute('export',{project:p,format:'llm-context'})).project.landscape,p.recipe.generation.landscape);const changed=structuredClone(p);assert.deepEqual(generationSettingsErrors(changed),[]);changed.recipe.generation.landscape.biomes[0].percent=12;assert.ok(generationSettingsErrors(changed).length>0);}
});

// Only the DOM methods used by renderControls, without browser packages.
class Element{
 constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.attributes={};this.listeners={};this.value='';this.checked=false;this.disabled=false;this.hidden=false;}
 append(...nodes){this.children.push(...nodes);}
 prepend(...nodes){this.children.unshift(...nodes);}
 replaceChildren(...nodes){this.children=[...nodes];}
 setAttribute(key,value){this.attributes[key]=String(value);}
 getAttribute(key){return this.attributes[key]??null;}
 addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
 dispatchEvent(event){for(const fn of this.listeners[event.type]??[])fn(event);return true;}
 setCustomValidity(){}
 matches(selector){if(selector.startsWith('#'))return this.id===selector.slice(1);const match=selector.match(/^\[data-([\w-]+)(?:([\^]?=)"([^"]*)")?\]$/);if(!match)return false;const value=this.dataset[match[1].replace(/-([a-z])/g,(_,c)=>c.toUpperCase())];return value!==undefined&&(!match[2]||(match[2]==='^='?String(value).startsWith(match[3]):String(value)===match[3]));}
 querySelectorAll(selector){return this.children.filter(x=>x instanceof Element).flatMap(x=>[...(x.matches(selector)?[x]:[]),...x.querySelectorAll(selector)]);}
 querySelector(selector){return this.querySelectorAll(selector)[0]??null;}
}

test('changing the main biome retains repeatable cards and zero-percent drafts',async()=>{
 const saved=globalThis.document;try{for(const mode of modes){const container=new Element('div'),changed=[],r=await createRecipe(mode);globalThis.document={createElement:tag=>new Element(tag),getElementById:id=>container.querySelector('#'+id)};renderControls(container,r,(path,value)=>changed.push({path,value}));const button=container.querySelector('#add-landscape-biome');button.dispatchEvent(new Event('click'));const percent=container.querySelector('[data-biome-percent]');percent.value='0';percent.dispatchEvent(new Event('change'));container.querySelector('[data-biome-confirm]').dispatchEvent(new Event('click'));const cards=structuredClone(r.generation.landscape.biomes),main=container.querySelector('[data-path="landscape.baseBiome"]');main.value='forest';main.dispatchEvent(new Event('change'));assert.deepEqual(r.generation.landscape.biomes,cards);assert.ok(changed.some(x=>x.path==='landscape.biomes'));assert.match(container.querySelector('#landscape-biome-budget').textContent,/100/);}}finally{globalThis.document=saved;}
});
