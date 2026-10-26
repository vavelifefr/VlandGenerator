export function availableTools({stage,kind,readonly=false}){
 if(stage==='map')return readonly?['inspect']:['inspect','brush','pencil'];
 return kind==='spawner'?['select','pencil','eraser']:['select','brush','eraser','rectangle','polygon','flood'];
}
export function shortcutAction(event,context){
 if(!context.enabled||context.blocked||context.editable||event.defaultPrevented||event.isComposing||event.repeat||event.altKey)return null;
 const code=event.code||'Key'+(event.key??'').toUpperCase();
 if(event.ctrlKey||event.metaKey){
  const action=code==='KeyZ'?(event.shiftKey?'redo':'undo'):code==='KeyY'&&!event.shiftKey?'redo':null;
  return action&&context[action==='undo'?'canUndo':'canRedo']?{type:'history',action}:null;
 }
 if(event.shiftKey)return null;
 const tool={KeyV:context.stage==='map'?'inspect':'select',KeyB:'brush',KeyP:'pencil',KeyE:'eraser',KeyR:'rectangle',KeyL:'polygon',KeyG:'flood'}[code];
 return tool&&availableTools(context).includes(tool)?{type:'tool',tool}:null;
}
