import {workingSession} from './shell.mjs';
const key='vland.settings';let current={};try{current=JSON.parse(localStorage.getItem(key)??'{}');}catch{}
for(const id of ['grid','confirmLeave','highContrast'])document.getElementById(id).checked=current[id]??id!=='highContrast';
const values=()=>Object.fromEntries(['grid','confirmLeave','highContrast'].map(id=>[id,document.getElementById(id).checked]));current=values();
document.getElementById('save-settings').onclick=()=>{const value=values();localStorage.setItem(key,JSON.stringify(value));current=value;workingSession.changed();document.getElementById('settings-status').textContent='Настройки сохранены. Они применятся при следующем открытии страницы режима.';};
await workingSession.restore(saved=>{for(const[id,value]of Object.entries(saved.ui.values??{})){const el=document.getElementById(id);if(el?.type==='checkbox')el.checked=Boolean(value);}});
workingSession.register(()=>({recipe:{mode:'settings'},project:null,ui:{values:values()},fileId:null,fileRevision:null,dirty:false,pending:JSON.stringify(values())!==JSON.stringify(current)}));
