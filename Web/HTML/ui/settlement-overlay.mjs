export function settlementLabels(layer,scale,measure){
 if(scale<4)return[];const groups=new Map();for(const[q,quarter]of layer.quarters.entries())for(const id of quarter.neighborhoodIds)groups.set(id,q);
 const labels=[];for(const n of layer.neighborhoods){
  const cells=new Set(n.cells),b=n.bounds,cx=b.x+b.width/2,cy=b.y+b.height/2,distance=i=>(i%layer.width+.5-cx)**2+(Math.floor(i/layer.width)+.5-cy)**2,anchors=[...n.cells].sort((a,b)=>distance(a)-distance(b)||a-b).slice(0,64),short=n.id.replace('neighborhood-','М'),full=short+(groups.has(n.id)?' / К'+(groups.get(n.id)+1):'');let found;
  for(const text of [...new Set([full,short])]){const width=measure(text)+4,height=12;if(width>b.width*scale||height>b.height*scale)continue;
   for(const i of anchors){const x=(i%layer.width+.5)*scale-width/2,y=(Math.floor(i/layer.width)+.5)*scale-height/2;if(x<0||y<0||x+width>layer.width*scale||y+height>layer.height*scale)continue;
    let fits=true;for(let yy=Math.floor(y/scale);yy<Math.ceil((y+height)/scale)&&fits;yy++)for(let xx=Math.floor(x/scale);xx<Math.ceil((x+width)/scale);xx++)if(!cells.has(yy*layer.width+xx)){fits=false;break;}
    if(!fits||labels.some(l=>x<l.x+l.width+2&&l.x<x+width+2&&y<l.y+l.height+2&&l.y<y+height+2))continue;
    found={id:n.id,text,x,y,width,height,quarter:groups.get(n.id)??null};break;
   }if(found)break;
  }if(found)labels.push(found);
 }return labels;
}
export function drawSettlementDistricts(map){
 const {layer:l,ctx,scale:s,offset:{x,y}}=map;if(!l.neighborhoods||map.showDistricts===false)return;
 const groups=new Map();for(const[q,quarter]of l.quarters.entries())for(const id of quarter.neighborhoodIds)groups.set(id,q);
 ctx.save();ctx.lineWidth=1;ctx.font='10px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
 for(const neighborhood of l.neighborhoods){
  const cells=new Set(neighborhood.cells),color=groups.has(neighborhood.id)?'hsl('+((groups.get(neighborhood.id)*137+37)%360)+' 60% 72%)':'#bdc6ba';ctx.strokeStyle=color;ctx.beginPath();
  for(const i of cells){const xx=i%l.width,yy=Math.floor(i/l.width),px=x+xx*s,py=y+yy*s;
   for(const[dx,dy,a,b,c,d]of [[0,-1,0,0,1,0],[0,1,0,1,1,1],[-1,0,0,0,0,1],[1,0,1,0,1,1]])if(xx+dx<0||xx+dx>=l.width||!cells.has((yy+dy)*l.width+xx+dx)){ctx.moveTo(px+a*s,py+b*s);ctx.lineTo(px+c*s,py+d*s);}
  }ctx.stroke();

 }
 for(const label of settlementLabels(l,s,text=>ctx.measureText(text).width)){ctx.fillStyle='#0b1318cc';ctx.fillRect(x+label.x,y+label.y,label.width,label.height);ctx.fillStyle=label.quarter===null?'#bdc6ba':'hsl('+((label.quarter*137+37)%360)+' 60% 72%)';ctx.fillText(label.text,x+label.x+label.width/2,y+label.y+label.height/2);}
 ctx.restore();
}
export function renderSettlementReport(layer,host){
 let report=host.querySelector('#settlement-plan');if(!layer?.planning){report?.remove();return;}
 if(!report){report=document.createElement('details');report.id='settlement-plan';report.className='view-options';report.append(document.createElement('summary'),document.createElement('div'));host.append(report);}
 report.querySelector('summary').textContent='План основы · микрорайоны '+layer.neighborhoods.length+' · кварталы '+layer.quarters.length;
 const body=report.lastElementChild;body.className='details-body';body.replaceChildren();const p=document.createElement('p');p.className='help-text';p.textContent='Площадь — клетки суши без дорог. М — микрорайон, К — квартал; одинаковый цвет объединяет микрорайоны квартала. Это исходный план: ручные правки геометрии не пересчитывают его.';body.append(p);
 const missing=document.createElement('p'),unassigned=layer.planning.unassigned;missing.id='settlement-shortfall';missing.textContent='За пределами заданной площади: '+unassigned.length+' участков / '+unassigned.reduce((n,r)=>n+r.area,0)+' клеток. Без квартала: '+layer.planning.ungroupedNeighborhoodIds.length+' микрорайонов.';body.append(missing);
 const list=document.createElement('ul');for(const quarter of layer.quarters){const li=document.createElement('li');li.textContent=quarter.id.replace('quarter-','К')+' · '+quarter.area+' клеток · '+quarter.neighborhoodIds.map(id=>id.replace('neighborhood-','М')).join(', ');list.append(li);}body.append(list);
}
