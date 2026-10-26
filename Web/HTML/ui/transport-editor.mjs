import {node,field,input,select} from './dom.mjs';
export function createTransportEditor(value){
 const section=node('section'),t=value??{},kind=select({'':'Не является переходом',teleport:'Телепорт',stairs:'Лестница',lift:'Лифт'},t.kind??''),fields=node('div','',{className:'settings-grid'}),cost=input(t.travelCost??1,'number',0,100000,.1),both=input('','checkbox');both.checked=t.bidirectional??true;cost.required=true;
 for(const [label,control]of [['Базовая стоимость перехода',cost],['По умолчанию в обе стороны',both]])fields.append(field(label,control));
 const update=()=>{fields.classList.toggle('hidden',!kind.value);for(const c of fields.querySelectorAll('input'))c.disabled=!kind.value;};kind.onchange=update;update();
 section.append(node('h3','Вид перехода'),field('Вид перехода',kind),fields,node('p','Это параметры типа объекта. Конкретные пары связываются кликами по карте в панели «Переходы»; ID вводить не нужно.',{className:'help-text'}));
 return{element:section,read(properties){const result={...properties};if(!kind.value){delete result.transport;return result;}result.transport={kind:kind.value,bidirectional:both.checked,travelCost:Number(cost.value)};return result;}};
}
