// Stable visual QA input: raw surface fields, without projects or session I/O.
import {writeFile,mkdir} from 'node:fs/promises';
import {normalizeAtlasRequest} from '../engine/api/atlas-catalog.mjs';
import {surfaceFields} from '../engine/core/atlas-landforms.mjs';
const cards=[],structures=['islands','continent','land','coast'];
for(const structure of structures)for(const seed of [7,42,2026]){
 const r=normalizeAtlasRequest({schema:'vland.atlas.request',schemaVersion:1,width:64,height:64,seed,landscape:{structure,baseBiome:'meadow'}}),{fields:f}=surfaceFields(r);
 const type=i=>f.elevation[i]<=.36?'sea':f.waterType[i]==='river'?'river':f.waterType[i]==='lake'?'lake':'land';let paths='';
 for(let y=0;y<64;y++){let x=0;while(x<64){const value=type(y*64+x),start=x;while(x<64&&type(y*64+x)===value)x++;paths+='<path fill="'+({land:'#729462',sea:'#193a50',river:'#65bdd0',lake:'#377a99'}[value])+'" d="M'+start+' '+y+'h'+(x-start)+'v1H'+start+'z"/>';}}
 cards.push('<figure><figcaption>'+structure+' · seed '+seed+'</figcaption><svg viewBox="0 0 64 64" role="img" aria-label="'+structure+' seed '+seed+'">'+paths+'</svg></figure>');
}
const html='<!doctype html><html lang="ru"><meta charset="utf-8"><title>Ландшафт: новые формы</title><style>body{background:#101a1e;color:#def;font:16px system-ui;margin:24px}a{color:#9cdcc8}section{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;max-width:840px}figure{margin:0}svg{width:100%;image-rendering:pixelated}figcaption{padding:6px}@media(max-width:600px){section{grid-template-columns:1fr}}</style><h1>Поверхность после улучшений</h1><p>64×64, квадратная сетка, луга. До навигационных ремонтов. <a href="landscape-quality-before.html">Исходная выборка</a></p><section>'+cards.join('')+'</section></html>';
await mkdir(new URL('../evidence/',import.meta.url),{recursive:true});await writeFile(new URL('../evidence/landscape-quality-after.html',import.meta.url),html,'utf8');console.log(JSON.stringify({ok:true,maps:cards.length,path:'evidence/landscape-quality-after.html',rawSurface:true}));
