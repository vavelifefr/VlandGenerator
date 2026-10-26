import test from 'node:test';
import assert from 'node:assert/strict';
import {quickEditor} from '../Web/HTML/ui/quick-edit.mjs';
import {createRecipe,generateBase} from '../app/index.mjs';
import {atlasSizeBudget} from '../app/generation-budget.mjs';

test('editor shortcuts use existing controls without creating a second map toolbar',()=>{
 const saved={document:globalThis.document,window:globalThis.window},listeners=new Map(),clicked=[];
 const buttons=new Map(),button=id=>{if(!buttons.has(id))buttons.set(id,{disabled:false,dataset:{},click(){clicked.push(id);},setAttribute(){}});return buttons.get(id);};
 const state={project:{},stage:'map',kind:'zone',placement:'draw'},canvas={disabled:false,drag:null};
 let modal=false,restoring=false,linking=false;
 globalThis.document={createElement(){throw Error('No duplicate controls may be created');},getElementById(id){if(id==='dialog')return{open:modal};return button(id);},querySelector(selector){if(selector==='main')return{inert:false};if(selector==='.header')return{getBoundingClientRect:()=>({height:70})};return button(selector);},querySelectorAll(){return[];},addEventListener(){}};
 globalThis.window={addEventListener(name,fn){listeners.set(name,fn);}};
 try{
  assert.doesNotThrow(()=>quickEditor({state,canvas,isRestoring:()=>restoring,isLinking:()=>linking}));
  const key=(code,patch={})=>{const e={code,key:'',composedPath:()=>[],preventDefault(){this.prevented=true;},...patch};listeners.get('keydown')(e);return e;};
  assert.equal(key('KeyB').prevented,true);assert.equal(clicked.pop(),'[data-terrain-tool="brush"]');
  key('KeyZ',{ctrlKey:true});assert.equal(clicked.pop(),'undo');key('KeyY',{ctrlKey:true});assert.equal(clicked.pop(),'redo');
  for(const reason of ['modal','restoring','linking','stroke','worker']){
   modal=reason==='modal';restoring=reason==='restoring';linking=reason==='linking';canvas.drag=reason==='stroke'?{}:null;canvas.disabled=reason==='worker';
   assert.equal(key('KeyB').prevented,undefined,reason);assert.equal(clicked.length,0,reason);
  }
  modal=restoring=linking=canvas.disabled=false;canvas.drag=null;
  assert.equal(key('KeyB',{composedPath:()=>[{nodeType:1,matches:()=>true}]}).prevented,undefined);
  state.stage='items';state.kind='spawner';key('KeyP');assert.equal(clicked.pop(),'[data-draw-tool="pencil"]');
 }finally{for(const[k,v]of Object.entries(saved))if(v===undefined)delete globalThis[k];else globalThis[k]=v;}
});

test('new landscape recipes start with one surface and allow 256 square cells per side',async()=>{
 const recipe=await createRecipe('landscape');assert.deepEqual(recipe.generation.layers,{above:0,underground:0});
 const budget=atlasSizeBudget('landscape',{...recipe.generation,width:256,height:256});assert.equal(budget.ok,true);
 Object.assign(recipe.generation,{width:32,height:32});const project=await generateBase(recipe);
 assert.equal(project.source.layers.length,1);assert.equal(project.source.layers[0].kind,'surface');
});
