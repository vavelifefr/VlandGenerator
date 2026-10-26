export function drawMapTransitions(view){
 if(view.showTransitions===false)return;
 const {ctx,layer:l,scale:s,offset:{x,y}}=view,links=view.transportLinks??[],points=view.transportPoints??[],at=p=>({x:x+(p.x+.5)*s,y:y+(p.y+.5)*s});
 const arrow=(a,b,color)=>{const angle=Math.atan2(b.y-a.y,b.x-a.x),size=Math.max(4,Math.min(9,s*.55));ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(b.x-Math.cos(angle-.5)*size,b.y-Math.sin(angle-.5)*size);ctx.lineTo(b.x-Math.cos(angle+.5)*size,b.y-Math.sin(angle+.5)*size);ctx.closePath();ctx.fill();};
 const labels=[],occupied=[],bounds=view.canvas.getBoundingClientRect();
 const label=(text,p,color,selected)=>{if(s>=3)labels.push({text,p,color,selected});};
 for(const [i,t]of links.entries()){
  const a=t.from.layerId===l.id,b=t.to.layerId===l.id;if(!a&&!b)continue;const selected=view.linkSelection===t.id,color=view.transitionErrors?.has(t.id)?'#f0a090':selected?'#f0ddb0':t.origin==='base'?'#9cb8bd':'#78ddd3',pa=at(t.from),pb=at(t.to);
  ctx.strokeStyle=color;ctx.globalAlpha=selected?1:.75;ctx.lineWidth=selected?2.5:1.5;ctx.setLineDash(t.origin==='base'?[4,4]:[]);
  if(a&&b){ctx.beginPath();ctx.moveTo(pa.x,pa.y);ctx.lineTo(pb.x,pb.y);ctx.stroke();arrow(pa,pb,color);if(t.bidirectional)arrow(pb,pa,color);label('Т'+(i+1),{x:(pa.x+pb.x)/2+5,y:(pa.y+pb.y)/2-7},color,selected);}else{
   const p=a?pa:pb,stub={x:p.x+Math.max(20,s*2),y:p.y-Math.max(16,s*1.5)},destination=a?t.to:t.from;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(stub.x,stub.y);ctx.stroke();if(a||t.bidirectional)arrow(p,stub,color);else arrow(stub,p,color);label('Т'+(i+1)+' '+(t.bidirectional?'↔':a?'→':'←')+' '+destination.layerId,{x:stub.x+5,y:stub.y},color,selected);
  }
  ctx.setLineDash([]);ctx.globalAlpha=1;for(const p of [a?pa:null,b?pb:null].filter(Boolean)){ctx.strokeStyle=color;ctx.lineWidth=selected?2.5:1.5;ctx.beginPath();ctx.arc(p.x,p.y,Math.max(4,s*.43),0,Math.PI*2);ctx.stroke();}
 }
 ctx.font='11px system-ui';ctx.textAlign='left';ctx.textBaseline='middle';
 for(const {text,p,color}of labels.sort((a,b)=>Number(b.selected)-Number(a.selected))){
  if(p.x<0||p.y<0||p.x>bounds.width+60||p.y>bounds.height+20)continue;
  const w=ctx.measureText(text).width+6,x=Math.max(4,Math.min(bounds.width-w-4,p.x-3));let y=Math.max(4,Math.min(bounds.height-20,p.y-8));
  for(const offset of [0,18,-18,36,-36,54,-54,72,-72,90,-90]){const next=Math.max(4,Math.min(bounds.height-20,p.y-8+offset));if(!occupied.some(r=>x<r.x+r.w+3&&x+w+3>r.x&&next<r.y+19&&next+19>r.y)){y=next;break;}}
  occupied.push({x,y,w});if(Math.abs(y+8-p.y)>3||Math.abs(x+3-p.x)>3){ctx.strokeStyle=color;ctx.globalAlpha=.7;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(p.x-5,p.y);ctx.lineTo(x+3,y+8);ctx.stroke();ctx.globalAlpha=1;}
  ctx.fillStyle='#0b171bf2';ctx.fillRect(x,y,w,16);ctx.fillStyle=color;ctx.fillText(text,x+3,y+8);
 }
 for(const p of points.filter(p=>p.layerId===l.id&&!links.some(t=>[t.from.sourceId,t.to.sourceId].includes(p.sourceId)))){const c=at(p);ctx.strokeStyle='#e2bb80';ctx.lineWidth=1.5;ctx.setLineDash(p.fixed?[]:[2,2]);ctx.strokeRect(c.x-Math.max(4,s*.4),c.y-Math.max(4,s*.4),Math.max(8,s*.8),Math.max(8,s*.8));ctx.setLineDash([]);}
 if(view.linkPending){const origin=points.find(p=>p.sourceId===view.linkPending.sourceId&&p.layerId===l.id);if(origin){const c=at(origin);ctx.strokeStyle='#f4db9e';ctx.lineWidth=3;ctx.strokeRect(c.x-s*.6,c.y-s*.6,s*1.2,s*1.2);}if(view.hover){const c=at(view.hover);ctx.strokeStyle='#e9ce91';ctx.lineWidth=2;ctx.beginPath();ctx.arc(c.x,c.y,Math.max(6,s*.48),0,Math.PI*2);ctx.stroke();}}
}
