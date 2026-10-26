import {$} from './dom.mjs';
import {availableTools,shortcutAction} from './quick-edit-keys.mjs';

const keys={inspect:'V',select:'V',brush:'B',pencil:'P',eraser:'E',rectangle:'R',polygon:'L',flood:'G'};
// Keyboard routes use the single editor below the map; no duplicate controls.
export function quickEditor({state,canvas,isRestoring,isLinking}){
 const terrainButton=name=>document.querySelector('[data-terrain-tool="'+name+'"]');
 const sourceButton=name=>document.querySelector('[data-draw-tool="'+name+'"]');
 const context=()=>({enabled:!!state.project&&!document.querySelector('main').inert,blocked:canvas.disabled||!!canvas.drag||isRestoring()||isLinking()||$('dialog').open,stage:state.stage,kind:state.kind,readonly:terrainButton('brush')?.disabled??true,canUndo:!$('undo').disabled,canRedo:!$('redo').disabled});
 function refresh(){
  for(const attribute of ['terrainTool','drawTool'])for(const button of document.querySelectorAll(attribute==='terrainTool'?'[data-terrain-tool]':'[data-draw-tool]')){
   const key=keys[button.dataset[attribute]];if(key){button.setAttribute('aria-keyshortcuts',key);button.title=button.textContent+' · '+key;}
  }
  $('undo').setAttribute('aria-keyshortcuts','Control+z Meta+z');$('redo').setAttribute('aria-keyshortcuts','Control+Shift+z Meta+Shift+z Control+y Meta+y');
 }
 window.addEventListener('keydown',event=>{
  const editable=event.composedPath().some(el=>el?.nodeType===1&&(el.isContentEditable||el.matches('input,textarea,select,[role="textbox"],[role="searchbox"],[role="combobox"],[contenteditable]:not([contenteditable="false"])')));
  const c=context(),action=shortcutAction(event,{...c,editable});if(!action)return;
  event.preventDefault();
  if(action.type==='history')$(action.action).click();
  else if(availableTools(c).includes(action.tool)){
   if(c.stage==='map')terrainButton(action.tool)?.click();
   else{if(state.placement!=='draw')$('draw-tab').click();sourceButton(action.tool)?.click();}
  }
 });
 refresh();return{refresh};
}
