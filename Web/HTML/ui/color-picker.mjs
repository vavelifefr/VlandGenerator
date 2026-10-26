import {node,field,input} from './dom.mjs';
export function hsvToHex(h,s,v){
 h=((h%360)+360)%360;const c=v*s,x=c*(1-Math.abs(h/60%2-1)),m=v-c;
 const rgb=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];
 return '#'+rgb.map(n=>Math.round((n+m)*255).toString(16).padStart(2,'0')).join('');
}
export function hexToHsv(hex){
 const [r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255),v=Math.max(r,g,b),min=Math.min(r,g,b),d=v-min;
 const h=d?(v===r?(g-b)/d%6:v===g?(b-r)/d+2:(r-g)/d+4)*60:0;
 return{h:(h+360)%360,s:v?d/v:0,v};
}
export function colorPicker(onChange){
 const root=node('div','',{className:'color-picker'}),name=node('h3',''),plane=node('div','',{className:'color-plane'}),marker=node('span','',{className:'color-marker'}),hue=input(0,'range',0,360),sat=input(0,'range',0,100),brightness=input(0,'range',0,100),hex=input('#808080'),preview=node('div','',{className:'color-preview'});
 hue.id='legend-hue';hue.className='color-hue';sat.id='legend-saturation';brightness.id='legend-brightness';hex.id='legend-hex';hex.pattern='#[0-9a-fA-F]{6}';hex.maxLength=7;hex.spellcheck=false;let hsv={h:0,s:0,v:.5},color='#808080';
 plane.append(marker);root.append(name,plane,field('Цветовой тон',hue),field('Насыщенность',sat),field('Яркость',brightness),field('HEX · #RRGGBB',hex),preview,node('p','Поле: слева белый, справа выбранный тон; внизу чёрный. Можно ввести точный HEX или использовать ползунки.',{className:'help-text'}));
 function render(){hue.value=hsv.h;sat.value=hsv.s*100;brightness.value=hsv.v*100;hex.value=color;preview.style.background=color;plane.style.background='linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,'+hsvToHex(hsv.h,1,1)+')';marker.style.left=hsv.s*100+'%';marker.style.top=(1-hsv.v)*100+'%';}
 function emit(){color=hsvToHex(hsv.h,hsv.s,hsv.v);render();onChange(color);}
 hue.oninput=()=>{hsv.h=Number(hue.value);emit();};sat.oninput=()=>{hsv.s=Number(sat.value)/100;emit();};brightness.oninput=()=>{hsv.v=Number(brightness.value)/100;emit();};
 hex.oninput=()=>{if(hex.checkValidity()){color=hex.value.toLowerCase();hsv=hexToHsv(color);render();onChange(color);}};
 function point(e){const r=plane.getBoundingClientRect();hsv.s=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));hsv.v=1-Math.max(0,Math.min(1,(e.clientY-r.top)/r.height));emit();}
 plane.onpointerdown=e=>{if(e.button!==0)return;plane.setPointerCapture(e.pointerId);point(e);};plane.onpointermove=e=>{if(plane.hasPointerCapture(e.pointerId))point(e);};
 render();return{root,set(label,value){name.textContent=label;color=value;hsv=hexToHsv(value);render();},valid:()=>hex.reportValidity()};
}
