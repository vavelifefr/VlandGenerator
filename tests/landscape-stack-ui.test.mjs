import test from 'node:test';
import assert from 'node:assert/strict';
import {MODES} from '../app/contracts.mjs';
import {landscapeStack} from '../Web/HTML/ui/landscape-stack.mjs';

class Element{
 constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.attributes={};this.listeners={};this.value='';this.disabled=false;this.open=false;this.className='';this.classList={add:name=>{this.className+=' '+name;},toggle:(name,on)=>{const names=new Set(this.className.split(' ').filter(Boolean));if(on)names.add(name);else names.delete(name);this.className=[...names].join(' ');},contains:name=>this.className.split(' ').includes(name)};}
 append(...nodes){for(const node of nodes){node.remove?.();node.parentElement=this;this.children.push(node);}}
 prepend(...nodes){for(const node of nodes.reverse()){node.remove?.();node.parentElement=this;this.children.unshift(node);}}
 before(node){const parent=this.parentElement,index=parent.children.indexOf(this);node.remove?.();node.parentElement=parent;parent.children.splice(index,0,node);}
 after(node){const parent=this.parentElement,index=parent.children.indexOf(this);node.remove?.();node.parentElement=parent;parent.children.splice(index+1,0,node);}
 remove(){if(this.parentElement){const siblings=this.parentElement.children,index=siblings.indexOf(this);if(index>=0)siblings.splice(index,1);this.parentElement=null;}}
 setAttribute(key,value){this.attributes[key]=String(value);}
 getAttribute(key){return this.attributes[key]??null;}
 addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
 dispatchEvent(event){this['on'+event.type]?.(event);for(const fn of this.listeners[event.type]??[])fn(event);return true;}
 matches(selector){if(selector.startsWith('#'))return this.id===selector.slice(1);if(selector.startsWith('.'))return this.classList.contains(selector.slice(1));if(selector.startsWith('[data-')){const match=selector.match(/^\[data-([\w-]+)(?:="([^"]*)")?\]$/);if(!match)return false;const value=this.dataset[match[1].replace(/-([a-z])/g,(_,c)=>c.toUpperCase())];return value!==undefined&&(match[2]===undefined||value===match[2]);}return this.tagName.toLowerCase()===selector;}
 querySelectorAll(selector){return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]);}
 querySelector(selector){return this.querySelectorAll(selector)[0]??null;}
 closest(selector){for(let element=this;element;element=element.parentElement)if(element.matches(selector))return element;return null;}
 getContext(){return{setTransform(){},fillRect(){}};}
 getBoundingClientRect(){return{width:600,height:400};}
 checkValidity(){return true;}
}
function setup(mode,imported=false){
 const documentRoot=new Element('main'),panel=new Element('section'),shell=new Element('div'),canvas=new Element('canvas'),footer=new Element('footer'),popup=new Element('div'),channel=new Element('select'),empty=new Element('div'),controls=new Element('div');panel.className='canvas-panel';footer.className='canvas-footer';canvas.id='map';popup.id='cell-popup';channel.id='channel';empty.id='empty';controls.id='generation-controls';shell.append(canvas,empty);panel.append(shell,footer);documentRoot.append(panel,popup,channel,controls);
 globalThis.document={createElement:tag=>new Element(tag),getElementById:id=>documentRoot.querySelector('#'+id),querySelector:selector=>documentRoot.querySelector(selector),querySelectorAll:selector=>documentRoot.querySelectorAll(selector)};
 const recipe={mode,generation:{layers:{above:imported?1:0,underground:imported?1:0,depthStep:24},layerSettings:imported?{'cave-1':{depth:32,caves:{style:'karst'}}}:{}}},state={layers:imported?[{id:'surface'},{id:'high-1'},{id:'cave-1'}]:[],layerId:'surface'},before=structuredClone({recipe,state}),stack=landscapeStack({element:canvas,state,handlers:{},onActivate:()=>{},onChange:()=>{}});stack.configure(recipe);return{documentRoot,recipe,state,before,stack};
}
test('chunk display identity and page remain distinct from its stable caves mode id',()=>{assert.equal(MODES.caves.name,'Чанк');assert.equal(MODES.caves.page,'chunk.html');});
test('landscape stacks expose only surface creation and preserve imported physical layers without underground editors',()=>{
 const saved={document:globalThis.document,ResizeObserver:globalThis.ResizeObserver,devicePixelRatio:globalThis.devicePixelRatio};globalThis.ResizeObserver=class{observe(){}disconnect(){}};globalThis.devicePixelRatio=1;
 try{for(const mode of ['landscape','hexlandscape'])for(const imported of [false,true]){const{documentRoot,recipe,state,before,stack}=setup(mode,imported);assert.ok(!documentRoot.querySelector('#landscape-add-layer'),mode+' no underground creation');assert.equal(documentRoot.querySelectorAll('[data-layer-setting]').length,0,mode+' no underground generation settings');assert.deepEqual(documentRoot.querySelectorAll('[data-layer-id]').map(e=>e.dataset.layerId),imported?['surface','high-1','cave-1']:['surface']);assert.deepEqual({recipe,state},before,'Viewing imports preserves data');assert.equal(documentRoot.querySelectorAll('p').filter(e=>e.textContent).length,0,'No static stack prose');stack.setBusy(true);stack.setBusy(false);stack.canvas.destroy();}}
 finally{Object.assign(globalThis,saved);}
});
test('chunk stack retains underground creation and per-layer cave settings',()=>{
 const saved={document:globalThis.document,ResizeObserver:globalThis.ResizeObserver,devicePixelRatio:globalThis.devicePixelRatio};globalThis.ResizeObserver=class{observe(){}disconnect(){}};globalThis.devicePixelRatio=1;
 try{const{documentRoot,stack}=setup('caves',true);assert.ok(documentRoot.querySelector('#landscape-add-layer'));assert.ok(documentRoot.querySelectorAll('[data-layer-setting]').length>=8);assert.equal(documentRoot.querySelectorAll('p').filter(e=>e.textContent).length,0,'No static stack prose');stack.canvas.destroy();}finally{Object.assign(globalThis,saved);}
});
test('restored landscape drafts do not create ungenerated underground cards or rewrite saved layer settings',()=>{
 const saved={document:globalThis.document,ResizeObserver:globalThis.ResizeObserver,devicePixelRatio:globalThis.devicePixelRatio};globalThis.ResizeObserver=class{observe(){}disconnect(){}};globalThis.devicePixelRatio=1;
 try{for(const mode of ['landscape','hexlandscape']){const{documentRoot,recipe,stack}=setup(mode);recipe.generation.layers={above:1,underground:2,depthStep:24};recipe.generation.layerSettings={'cave-1':{depth:32,caves:{style:'karst'}},'cave-2':{depth:64,caves:{style:'tunnels'}}};const before=structuredClone(recipe);stack.configure(recipe);assert.deepEqual(documentRoot.querySelectorAll('[data-layer-id]').map(e=>e.dataset.layerId),['surface']);assert.deepEqual(recipe,before,'Showing the draft does not delete imported/saved metadata');stack.canvas.destroy();}}
 finally{Object.assign(globalThis,saved);}
});
