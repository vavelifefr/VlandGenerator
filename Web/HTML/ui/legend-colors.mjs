import {normalizePalette,paletteEntries} from '../../../app/display-colors.mjs';
import {cellColor} from '../../../app/raster.mjs';
import {SURFACES} from '../../../app/catalog.mjs';
import {node} from './dom.mjs';
import {colorPicker} from './color-picker.mjs';
const key='vland.legend-colors';
export function loadLegendColors(){try{return normalizePalette(JSON.parse(localStorage.getItem(key)??'{}'));}catch{return{};}}
export function paletteColor(entry,palette){return '#'+cellColor({material:[entry.channel==='material'?entry.id:'floor'],biome:[entry.id],water:[entry.id],solid:[entry.channel==='material'?(SURFACES[entry.id]?.solid??0):0]},0,entry.channel,palette).map(n=>n.toString(16).padStart(2,'0')).join('');}
export function legendColors({canvas,refresh,openDialog,back,button,status}){
 canvas.palette=loadLegendColors();
 function update(palette){canvas.palette=palette;canvas.cache=null;canvas.draw();refresh();}
 window.addEventListener('storage',e=>{if(e.key===key||e.key===null)update(loadLegendColors());});
 function open(){
  let draft=structuredClone(canvas.palette),selected;const root=node('div','',{className:'legend-editor'}),list=node('div','',{className:'legend-color-list'}),editor=node('div','',{className:'legend-color-controls'}),entries=paletteEntries(),buttons=new Map();
  const picker=colorPicker(color=>{draft[selected.channel]??={};draft[selected.channel][selected.id]=color;paint();});
  const paint=()=>{for(const e of entries){const b=buttons.get(e.channel+':'+e.id);b.querySelector('.palette-swatch').style.background=paletteColor(e,draft);b.setAttribute('aria-pressed',String(e===selected));}};
  function select(entry){selected=entry;picker.set(entry.name,paletteColor(entry,draft));paint();}
  for(const[channel,label]of [['material','Материалы и поверхности'],['biome','Биомы'],['water','Вода']]){list.append(node('h3',label));for(const e of entries.filter(e=>e.channel===channel)){const b=node('button',e.name,{type:'button'});b.dataset.legendColor=channel+':'+e.id;b.prepend(node('span','',{className:'palette-swatch'}));b.onclick=()=>select(e);list.append(b);buttons.set(channel+':'+e.id,b);}}
  const resetOne=node('button','Стандартный цвет элемента',{type:'button'});resetOne.onclick=()=>{delete draft[selected.channel]?.[selected.id];select(selected);};editor.append(picker.root,resetOne);root.append(node('p','Общая схема этого браузера для всех режимов. Изменения вступят в силу после сохранения; данные и свойства клеток не меняются.',{className:'help-text'}),list,editor);select(entries[0]);
  openDialog('Редактировать цвета легенды',root,[button('Вернуть стандартные цвета',()=>{draft={};select(selected);}),button('Отмена',back),button('Применить и сохранить',()=>{if(!picker.valid())return;const value=normalizePalette(draft);try{localStorage.setItem(key,JSON.stringify(value));}catch{throw new Error('Браузер не смог сохранить цвета. Предыдущая схема сохранена.');}update(value);back();status('Цвета легенды сохранены в настройках браузера для всех режимов.');},'primary')]);
 }
 return{open};
}
