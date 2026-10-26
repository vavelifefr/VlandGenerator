import {MODES} from '../app/contracts.mjs';
// Run only in a root-owned isolated QA copy with an iframe and pre wrapper.
// Synthetic DOM/pointer input; PNG file handles are stubs, never native dialogs.
import {hash} from '../content/common.mjs';
import {materialize} from '../app/index.mjs';
import {BIOME_COLORS} from '../app/views.mjs';
import {hexExtent,hexPosition} from '../Web/HTML/ui/hex-render.mjs';

const frame=document.querySelector('iframe'),out=document.querySelector('pre'),results=[],errors=[],paletteKey='vland.legend-colors';
let doc,step='initialization',currentCase=null;
const assert=(value,message)=>{if(!value)throw Error(message);};
const publish=(complete=false)=>{out.textContent=JSON.stringify({ok:!errors.length,complete,results,errors},null,2);out.dataset.ready=String(complete);};
const until=async(fn,label)=>{step=label;for(let i=0;i<2400;i++){if(fn())return;await new Promise(r=>setTimeout(r,25));}throw Error('Timeout '+label+': '+doc?.getElementById('status')?.textContent);};
const settled=()=>!doc.getElementById('sidebar').inert&&doc.getElementById('session-status').textContent==='Сессия сохранена';
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
const action=label=>{const button=[...doc.querySelectorAll('#dialog-actions button')].find(b=>b.textContent===label);assert(button,'Missing dialog action '+label);button.click();};
const change=(element,value,type='change')=>{assert(element,'Missing control');element.value=value;element.dispatchEvent(new doc.defaultView.Event(type,{bubbles:true}));};
function dialogFits(){const box=doc.getElementById('dialog').getBoundingClientRect();assert(box.left>=-1&&box.top>=-1&&box.right<=doc.documentElement.clientWidth+1&&box.bottom<=doc.defaultView.innerHeight+1,'Dialog fits viewport');}
async function request(operation,input){const response=await fetch('/api/'+operation,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}),value=await response.json();assert(response.ok,'API '+operation+': '+JSON.stringify(value.error??value));return value;}

async function importProject(project,label){
 const w=doc.defaultView,transfer=new w.DataTransfer(),input=doc.getElementById('file');transfer.items.add(new w.File([JSON.stringify(project)],label+'.json',{type:'application/json'}));input.files=transfer.files;input.dispatchEvent(new w.Event('change',{bubbles:true}));
 await until(()=>input.value===''&&doc.getElementById('status').textContent==='Проект импортирован.'&&settled(),'import '+label);
}
async function documentExport(label){
 let value,failure;const w=doc.defaultView,proto=w.HTMLAnchorElement.prototype,click=proto.click,create=w.URL.createObjectURL,blobs=new Map();
 w.URL.createObjectURL=function(blob){const url=create.call(this,blob);blobs.set(url,blob);return url;};
 proto.click=function(){if(this.download?.endsWith('.json')){const blob=blobs.get(this.href);assert(blob,'JSON download blob');blob.text().then(s=>{try{value=JSON.parse(s);}catch(e){failure=e;}});return;}return click.call(this);};
 try{doc.getElementById('export').click();dialogFits();action(label);await until(()=>value||failure,'export '+label);if(failure)throw failure;if(doc.getElementById('dialog').open)doc.getElementById('dialog-close').click();return value;}
 finally{proto.click=click;w.URL.createObjectURL=create;}
}
async function paletteColor(id,color,{reset=false}={}){
 doc.getElementById('edit-legend-colors').click();dialogFits();if(reset)action('Вернуть стандартные цвета');
 const button=doc.querySelector('[data-legend-color="biome:'+id+'"]');assert(button,'Legend biome '+id);button.click();change(doc.getElementById('legend-hex'),color,'input');assert(doc.getElementById('legend-hex').checkValidity(),'Valid HEX');
 action('Применить и сохранить');await until(()=>!doc.getElementById('dialog').open&&doc.getElementById('status').textContent==='Цвета легенды сохранены в настройках браузера для всех режимов.','save legend '+id);
 const palette=JSON.parse(doc.defaultView.localStorage.getItem(paletteKey)??'{}');assert(palette.biome?.[id]===color,'Legend color saved');return palette;
}
const base64=bytes=>{let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text);};
async function pngExport(project){
 let bytes;const w=doc.defaultView,picker=w.showSaveFilePicker;
 w.showSaveFilePicker=async()=>({createWritable:async()=>({write:async blob=>{bytes=new Uint8Array(await blob.arrayBuffer());},close:async()=>{}})});
 try{doc.getElementById('export-png').click();dialogFits();doc.getElementById('png-scale').value='4';doc.getElementById('png-transparent').checked=false;action('Сохранить PNG…');await until(()=>bytes&&!doc.getElementById('dialog').open,'PNG file handle stub');}
 finally{w.showSaveFilePicker=picker;}
 const palette=JSON.parse(w.localStorage.getItem(paletteKey)??'{}'),expected=await request('raster-export',{project,options:{scope:'current',layerId:doc.getElementById('layer').value,channel:doc.getElementById('channel').value,scale:4,transparent:false,palette}});
 assert(base64(bytes)===expected.files[0].data,'UI/HTTP PNG bytes identical');return bytes;
}
async function pngPixel(bytes,layer,cell){
 const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'})),canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;const context=canvas.getContext('2d');context.drawImage(bitmap,0,0);bitmap.close();
 const point=layer.topology.kind==='hex'?{x:(cell.x+.5+(cell.y%2)*.5)*Math.sqrt(3)*4,y:cell.y*6+4}:{x:(cell.x+.5)*4,y:(cell.y+.5)*4};return [...context.getImageData(Math.floor(point.x),Math.floor(point.y),1,1).data];
}
async function clickCell(layer,cell){
 const canvas=doc.getElementById('map');canvas.focus();canvas.scrollIntoView({block:'center'});doc.getElementById('fit').click();await new Promise(r=>doc.defaultView.requestAnimationFrame(r));
 const box=canvas.getBoundingClientRect(),shell=canvas.parentElement.getBoundingClientRect(),hex=layer.topology.kind==='hex',extent=hex?hexExtent(layer):layer,scale=Math.max(hex?.3:.4,Math.min(16,(shell.width-30)/extent.width,(shell.height-30)/extent.height)),position=hex?hexPosition(cell):{x:cell.x+.5,y:cell.y+.5},capture=canvas.setPointerCapture;
 const point={clientX:box.left+(shell.width-extent.width*scale)/2+position.x*scale,clientY:box.top+(shell.height-extent.height*scale)/2+position.y*scale};
 canvas.setPointerCapture=()=>{};
 try{for(const type of ['pointerdown','pointerup'])canvas.dispatchEvent(new doc.defaultView.PointerEvent(type,{...point,bubbles:true,button:0,buttons:type==='pointerdown'?1:0,pointerId:1,pointerType:'mouse',isPrimary:true}));}
 finally{canvas.setPointerCapture=capture;}
}
function band(runtime,layerId,index){const layer=runtime.scene.map.layers.find(l=>l.id===layerId);assert(layer,'Runtime physical layer');return{primary:layer.biome[index],secondary:layer.secondaryBiome[index],strength:layer.metrics.transitionStrength[index]};}

let originalPalette;
try{
 assert(frame&&out,'Requires own isolated iframe/pre wrapper');assert(location.port!=='9670','Do not run browser QA against the live server');originalPalette=localStorage.getItem(paletteKey);
 for(const mode of ['landscape','hexlandscape'])for(const width of [1100,360]){
  currentCase={mode,width};step='prepare';const recipe=await(await fetch('/api/defaults?mode='+mode)).json();Object.assign(recipe.generation,{width:32,height:32,layers:{above:0,underground:0},landscape:{structure:'coast',baseBiome:'forest'}});recipe.generation.hydrology.rivers=0;recipe.generation.hydrology.lakes=0;
  const initial=await request('generate-base',{recipe}),initialHash=hash(initial),sourceHash=hash(initial.source),layer=(await materialize(initial))[0],fields=layer.sourceFields;
  const index=fields.secondaryBiome.findIndex((v,i)=>v&&v!==layer.biome[i]&&fields.transitionStrength[i]>0&&!layer.reserved[i]&&!layer.solid[i]&&i%layer.width>0&&i%layer.width<layer.width-1&&i>=layer.width&&i<layer.width*(layer.height-1));assert(index>=0,'Prepared real transition cell');
  const cell={x:index%layer.width,y:Math.floor(index/layer.width)},primary=layer.biome[index],secondary=fields.secondaryBiome[index],strength=fields.transitionStrength[index];
  frame.width=width;const previous=frame.contentDocument;frame.src='/Web/HTML/'+MODES[mode].page+'?qa=quality'+width;
  await until(()=>frame.contentDocument!==previous&&frame.contentDocument?.getElementById('landscape-stack')&&frame.contentDocument.readyState==='complete'&&!frame.contentDocument.querySelector('main').inert,'editor load');doc=frame.contentDocument;await until(settled,'session restore');await importProject(initial,'quality-'+mode);
  assert(hash(await documentExport('Проект JSON'))===initialHash,'Exact imported project');doc.getElementById('tab-map').click();change(doc.querySelector('[data-layer-channel="surface"]'),'biome');assert(doc.getElementById('channel').value==='biome','Actual biome channel');
  const secondaryColor='#ff00ff';await paletteColor(secondary,secondaryColor,{reset:true});assert(hash(await documentExport('Проект JSON'))===initialHash,'Palette leaves project unchanged');
  const secondaryRgb=await pngPixel(await pngExport(initial),layer,cell),expectedBlend=rgb(BIOME_COLORS[primary]).map((v,k)=>Math.round(v*(1-strength)+rgb(secondaryColor)[k]*strength));assert(JSON.stringify(secondaryRgb)===JSON.stringify([...expectedBlend,255]),'Secondary custom color blended into PNG: '+JSON.stringify({actual:secondaryRgb,expected:[...expectedBlend,255]}));
  const primaryColor='#123456';await paletteColor(primary,primaryColor);const primaryRgb=await pngPixel(await pngExport(initial),layer,cell);assert(JSON.stringify(primaryRgb)===JSON.stringify([...rgb(primaryColor),255]),'Primary custom RGB remains exact');
  const swatch=doc.querySelector('#terrain-palette [data-palette="'+primary+'"] .palette-swatch');assert(swatch&&doc.defaultView.getComputedStyle(swatch).backgroundColor.replaceAll(' ','')==='rgb(18,52,86)','Primary palette button uses saved color');assert(hash(await documentExport('Проект JSON'))===initialHash,'Both color changes leave project unchanged');
  doc.querySelector('[data-terrain-tool="pencil"]').click();doc.querySelector('#terrain-palette [data-palette="'+secondary+'"]').click();await clickCell(layer,cell);await until(()=>doc.getElementById('status').textContent.startsWith('Геометрия изменена.')&&settled(),'manual biome stroke');
  const painted=await documentExport('Проект JSON'),paintedHash=hash(painted);assert(painted.edits.length===1&&painted.edits[0].layerId===layer.id&&painted.edits[0].field==='biome'&&painted.edits[0].x===cell.x&&painted.edits[0].y===cell.y&&painted.edits[0].value===secondary,'One exact pencil override');assert(hash(painted.source)===sourceHash,'Stroke preserves immutable source');
  const runtime=await documentExport('Для приложения'),paintedBand=band(runtime,layer.id,index);assert(paintedBand.primary===secondary&&paintedBand.secondary===''&&paintedBand.strength===0,'UI runtime export has no stale biome band');assert(hash(runtime)===hash(await request('runtime',{project:painted})),'UI/HTTP runtime identical');await pngExport(painted);
  doc.getElementById('undo').click();await until(()=>doc.getElementById('status').textContent==='Изменение отменено.'&&settled(),'undo');assert(hash(await documentExport('Проект JSON'))===initialHash,'Undo exact project');const undoBand=band(await documentExport('Для приложения'),layer.id,index);assert(undoBand.primary===primary&&undoBand.secondary===secondary&&undoBand.strength===strength,'Undo restores source band');
  doc.getElementById('redo').click();await until(()=>doc.getElementById('status').textContent==='Изменение возвращено.'&&settled(),'redo');assert(hash(await documentExport('Проект JSON'))===paintedHash,'Redo exact project');assert(band(await documentExport('Для приложения'),layer.id,index).strength===0,'Redo restores cleared band');
  doc.getElementById('reset-map-settings').click();await until(()=>doc.getElementById('status').textContent.startsWith('Настройки карты сброшены')&&settled(),'settings reset');assert(hash(await documentExport('Проект JSON'))===paintedHash,'Settings reset preserves current edited project');
  const reset=await request('edit',{project:painted,operation:{type:'reset-edits'}});assert(hash(reset.source)===sourceHash,'Explicit API reset preserves source');await importProject(reset,'quality-reset');const resetBand=band(await documentExport('Для приложения'),layer.id,index);assert(resetBand.primary===primary&&resetBand.secondary===secondary&&resetBand.strength===strength,'API reset/import restores source band');
  assert(doc.documentElement.scrollWidth<=doc.documentElement.clientWidth+1,'No document overflow');results.push({mode,width,cell,primary,secondary,strength,secondaryRgb,expectedBlend,primaryRgb,legendDialogFits:true,secondaryCustomBlend:true,primaryCustomExact:true,paletteProjectUnchanged:true,pngUiHttpExact:true,pencilBandCleared:true,runtimeUiHttpExact:true,sourceImmutable:true,undoRedo:true,settingsResetPreservesProject:true,editResetApiRoundtrip:true,noOverflow:true,input:'synthetic DOM/file/pointer; stub PNG handles; no native dialogs'});publish();
 }
}catch(error){errors.push({...currentCase,step,message:error.message,stack:error.stack});}
finally{
 if(originalPalette!==undefined){if(originalPalette===null)localStorage.removeItem(paletteKey);else localStorage.setItem(paletteKey,originalPalette);const w=doc?.defaultView;if(w)w.dispatchEvent(new w.StorageEvent('storage',{key:paletteKey,newValue:originalPalette,url:location.href}));}
 if(out)publish(true);
}
