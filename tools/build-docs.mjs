import {rewriteWebLinks} from '../Web/HTML/ui/paths.mjs';
import {readFile,writeFile} from 'node:fs/promises';
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const inline=s=>escape(s).replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\[([^\]]+)\]\(([^)]+)\)/g,(_,label,href)=>`<a href="${href.startsWith('../')?href.slice(3):/^[A-Z_]+\.md$/.test(href)?'docs/'+href:href}">${label}</a>`);
const anchors={'Рельеф':'relief','Данж':'dungeon','Уровни и ярусы':'tiers','Вид сбоку':'sideview','Чанк':'caves','Ландшафт':'landscape','Гексагональный ландшафт':'hexlandscape','Города и деревни':'settlements'};
function render(text){let result='',code=false,list=false,table=false;const close=()=>{if(list){result+='</ul>';list=false;}if(table){result+='</table>';table=false;}};
 for(const line of text.split(/\r?\n/)){
  if(line.startsWith('```')){close();result+=code?'</code></pre>':'<pre><code>';code=!code;continue;}
  if(code){result+=escape(line)+'\n';continue;}if(!line.trim()){close();continue;}
  if(line.startsWith('|')){if(/^\|[\s:|\-]+\|$/.test(line))continue;if(!table){close();result+='<table>';table=true;}result+='<tr>'+line.replace(/^\||\|$/g,'').split('|').map(v=>'<td>'+inline(v.trim())+'</td>').join('')+'</tr>';continue;}
  const heading=line.match(/^(#{1,3}) (.+)/);if(heading){close();const n=heading[1].length,title=heading[2];result+=`<h${n}${anchors[title]?` id="${anchors[title]}"`:''}>${inline(title)}</h${n}>`;continue;}
  if(/^(\d+\. |\- )/.test(line)){if(!list){close();result+='<ul>';list=true;}result+='<li>'+inline(line.replace(/^(\d+\. |\- )/,''))+'</li>';continue;}close();result+='<p>'+inline(line)+'</p>';
 }close();return result;}
for(const[name,title,files]of[['guide.html','Руководство',['USER_GUIDE.md']],['llm.html','LLM и API',['LLM_GUIDE.md','API.md']]]){
 const text=(await Promise.all(files.map(f=>readFile(new URL('../docs/'+f,import.meta.url),'utf8')))).join('\n\n');
 const html=rewriteWebLinks(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · VlandGenerator</title><link rel="stylesheet" href="ui/style.css"><script type="module" src="ui/shell.mjs"></script></head><body><header class="header" data-header></header><main class="container docs"><p class="eyebrow">Документация / v4</p><p><a href="docs/USER_GUIDE.md">Markdown для пользователя</a> · <a href="docs/LLM_GUIDE.md">Markdown для LLM</a> · <a href="docs/API.md">Контракт API</a></p>${render(text)}</main><footer class="footer"><span>VlandGenerator / автономная утилита карт</span><a href="index.html">Главная</a><a href="guide.html">Руководство</a><a href="llm.html">API и LLM</a></footer></body></html>`);
 await writeFile(new URL('../Web/HTML/'+name,import.meta.url),html);
}
