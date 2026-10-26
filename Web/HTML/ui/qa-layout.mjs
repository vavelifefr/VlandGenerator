const report=document.createElement('pre');report.id='layout-report';report.textContent='Waiting for frames';document.body.prepend(report);
const timer=setInterval(()=>{
 const frames=[...document.querySelectorAll('iframe')];
 if(frames.some(f=>!f.contentDocument?.body||f.contentDocument.getElementById('status')?.textContent==='Загрузка инструментов…'))return;
 const result=frames.map(f=>{const d=f.contentDocument;return{name:f.title,width:d.documentElement.clientWidth,scrollWidth:d.documentElement.scrollWidth,overflow:d.documentElement.scrollWidth>d.documentElement.clientWidth,invalid:[...d.querySelectorAll('input')].filter(e=>!e.validity.valid).map(e=>e.dataset.path),tabs:[...d.querySelectorAll('[role=tab]')].map(e=>e.textContent),selected:d.querySelector('[role=tab][aria-selected=true]')?.textContent,status:d.getElementById('status')?.textContent};});report.textContent=JSON.stringify(result,null,2);report.dataset.ready="true";clearInterval(timer);
},200);
