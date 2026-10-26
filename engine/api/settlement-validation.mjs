import {MAX_PIER_SEA_CELLS} from '../core/settlement-streets.mjs';
const ranks=new Set(['primary','secondary','access','alley','pier']);
export function validateStreetPlan(streets,layer,field,seen){
 const {width:w,height:h}=layer.board,f=layer.fields,n=w*h,covered=new Set(),ids=new Set();let budget=n*32;
 const point=p=>Number.isInteger(p?.x)&&Number.isInteger(p?.y)&&p.x>=1&&p.y>=1&&p.x<w-1&&p.y<h-1;
 const same=(a,b)=>a.x===b.x&&a.y===b.y;
 if(!Array.isArray(streets)||streets.length>n*8)throw Error('Неверный список улиц.');
 for(const street of streets){
  const {id,rank,width,path,from,to}=street;
  if(typeof id!=='string'||ids.has(id)||!ranks.has(rank)||!Number.isInteger(width)||width<1||width>4||!Array.isArray(path)||path.length<2||path.length>n||!point(from)||!point(to)||!path.every(point)||!same(from,path[0])||!same(to,path.at(-1)))throw Error('Неверная геометрия улицы: '+id);
  ids.add(id);budget-=path.length*width*width;if(budget<0)throw Error('Превышен бюджет плана улиц.');
  let sea=0,heading;
  for(let k=0;k<path.length;k++){
   const p=path[k];if(k){const a=path[k-1],dx=p.x-a.x,dy=p.y-a.y;if(Math.abs(dx)+Math.abs(dy)!==1)throw Error('Разрыв пути улицы: '+id);if(rank==='pier'){const dir=dx+':'+dy;if(heading&&heading!==dir)throw Error('Пирс должен быть прямым.');heading=dir;}}
   for(let dy=0;dy<width;dy++)for(let dx=0;dx<width;dx++){
    const x=p.x+dx,y=p.y+dy,i=y*w+x,water=f.waterType[i];
    if(x>=w-1||y>=h-1||f.obstacle[i]||f.biome[i]==='cliffs'||!f.support[i]||!f.reserved[i]||!field.passable[i]||!seen[i])throw Error('Улица недоступна или пересекает скалы: '+id);
    if(k&&Math.abs(f.elevation[i]-f.elevation[(path[k-1].y+dy)*w+path[k-1].x+dx])>field.profile.maxStep+1e-6)throw Error('Непроходимый уступ на улице: '+id);
    const label=water==='none'?'trail':water==='river'?'bridge':water==='sea'&&rank==='pier'?'pier':null;
    if(!label||f.road[i]!==label||water!=='none'&&!f.bridge[i])throw Error('Улица пересекает неподходящий водоём: '+id);
    if(water==='sea')sea++;else if(sea)throw Error('Пирс не должен соединять два берега.');covered.add(i);
   }
  }
  if(rank==='pier'&&(width!==1||sea<1||sea>MAX_PIER_SEA_CELLS))throw Error('Пирс: 1–3 морских клетки, ширина1.');
 }
 for(let i=0;i<n;i++)if(f.road[i]&&!covered.has(i))throw Error('Клетка улицы отсутствует в плане.');
}
