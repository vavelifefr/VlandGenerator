export const $=id=>document.getElementById(id);
export const node=(tag,text='',props={})=>{const e=document.createElement(tag);e.textContent=text;Object.assign(e,props);return e;};
export const option=(value,text)=>node('option',text,{value});
export const field=(label,control)=>{const l=node(control.tagName==='DIV'?'div':'label','',{className:'field'});if(control.tagName!=='DIV')control.setAttribute('aria-label',label);l.append(node('span',label),control);return l;};
export const input=(value,type='text',min,max,step=1)=>{const e=node('input','',{type,value:value??''});if(min!==undefined)e.min=min;if(max!==undefined)e.max=max;if(type==='number')e.step=step===1?'1':'any';return e;};
export const select=(values,value)=>{const s=node('select');for(const[k,v]of Object.entries(values))s.append(option(k,v));s.value=value;return s;};
export const jsonArea=(value,rows=7)=>node('textarea','',{rows,spellcheck:false,value:JSON.stringify(value,null,2)});
export function readJSON(area){try{return JSON.parse(area.value);}catch{throw new Error('JSON не читается. Проверьте синтаксис.');}}
export function validForm(body){for(const e of body.querySelectorAll('input,select,textarea'))if(!e.checkValidity())throw new Error((e.getAttribute('aria-label')??'Поле')+': проверьте значение.');}
let tabSequence=0;
export function formTabs(sections,label){
 const element=node('div','',{className:'form-tabs'}),nav=node('nav','',{className:'form-tablist'}),panels=node('div'),prefix='form-'+(++tabSequence);nav.setAttribute('role','tablist');nav.setAttribute('aria-label',label);const buttons=[];
 function choose(index,focus=false){sections.forEach((s,i)=>{s.body.classList.toggle('hidden',i!==index);buttons[i].setAttribute('aria-selected',String(i===index));buttons[i].tabIndex=i===index?0:-1;});if(focus)buttons[index].focus();}
 sections.forEach((s,i)=>{const b=node('button',s.name,{type:'button',id:prefix+'-tab-'+i});b.setAttribute('role','tab');b.setAttribute('aria-controls',prefix+'-panel-'+i);s.body.id=prefix+'-panel-'+i;s.body.setAttribute('role','tabpanel');s.body.setAttribute('aria-labelledby',b.id);b.onclick=()=>choose(i);buttons.push(b);nav.append(b);panels.append(s.body);});
 nav.onkeydown=e=>{const i=buttons.indexOf(document.activeElement);if(i<0||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();choose(e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length,true);};element.append(nav,panels);choose(0);return{element,show:choose};
}
