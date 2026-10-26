import {cellColor} from '../../../app/raster.mjs';
import {sourceMask} from '../../../content/sources.mjs';
import {CATEGORIES} from '../../../content/common.mjs';
export const hexExtent=l=>({width:(l.width+.5)*Math.sqrt(3),height:(l.height-1)*1.5+2});
export const hexPosition=p=>({x:(p.x+.5+(p.y%2)*.5)*Math.sqrt(3),y:p.y*1.5+1});
export function hexCell(px,py,l){let best=null,distance=Infinity;const row=Math.round((py-1)/1.5);for(let y=row-1;y<=row+1;y++){const col=Math.round(px/Math.sqrt(3)-.5-(y%2)*.5);for(let x=col-1;x<=col+1;x++)if(x>=0&&y>=0&&x<l.width&&y<l.height){const p=hexPosition({x,y}),d=(p.x-px)**2+(p.y-py)**2;if(d<distance){distance=d;best={x,y};}}}return distance<=1?best:null;}
const littleEndian=new Uint8Array(new Uint32Array([0xff000000]).buffer)[3]===255;
const pixel=(r,g,b)=>littleEndian?(r|g<<8|b<<16|255<<24)>>>0:(r<<24|g<<16|b<<8|255)>>>0;
function drawHexTerrain(map,dpr){
 const {canvas,ctx,layer:l,scale:s,offset}=map,paletteKey=JSON.stringify(map.palette??{});let cache=map.cache;
 if(!cache?.hexTerrain||cache.layer!==l||cache.channel!==map.channel||cache.paletteKey!==paletteKey){
  const colors=new Uint32Array(l.width*l.height);for(let i=0;i<colors.length;i++)if(l.material[i]!=='air')colors[i]=pixel(...cellColor(l,i,map.channel,map.palette));
  cache=map.cache={hexTerrain:true,layer:l,channel:map.channel,paletteKey,colors};
 }
 if(cache.frame?.width!==canvas.width||cache.frame?.height!==canvas.height){cache.frame=ctx.createImageData(canvas.width,canvas.height);cache.words=new Uint32Array(cache.frame.data.buffer);}
 const {words,colors}=cache,cw=canvas.width,ch=canvas.height,radius=s*dpr,dx=Math.sqrt(3)*radius,dy=1.5*radius,ox=offset.x*dpr,oy=offset.y*dpr;
 words.fill(pixel(11,19,24));
 // The same pointy-top pixel-center inclusion rule as app/raster.mjs. Opaque
 // device pixels avoid independently antialiased polygon edges revealing the
 // background between adjacent equal-color tiles. Only visible cells/rows run.
 const y0=Math.max(0,Math.floor((-oy-radius)/dy)),y1=Math.min(l.height-1,Math.ceil((ch-oy-radius)/dy));
 for(let y=y0;y<=y1;y++){
  const rowOffset=.5+(y%2)*.5,cy=oy+y*dy+radius,x0=Math.max(0,Math.floor(-ox/dx-rowOffset)-1),x1=Math.min(l.width-1,Math.ceil((cw-ox)/dx-rowOffset)+1);
  for(let x=x0;x<=x1;x++){
   const color=colors[y*l.width+x];if(!color)continue;const cx=ox+(x+rowOffset)*dx,top=Math.max(0,Math.floor(cy-radius)),bottom=Math.min(ch-1,Math.ceil(cy+radius)-1);
   for(let yy=top;yy<=bottom;yy++){
    const half=Math.sqrt(3)*Math.min(radius-Math.abs(yy+.5-cy),radius/2);if(half<0)continue;
    const left=Math.max(0,Math.ceil(cx-half-.5)),right=Math.min(cw-1,Math.floor(cx+half-.5));if(left<=right)words.fill(color,yy*cw+left,yy*cw+right+1);
   }
  }
 }
 ctx.putImageData(cache.frame,0,0);
}
export function drawHexMap(map){const c=map.canvas,r=c.parentElement.getBoundingClientRect(),dpr=Math.min(devicePixelRatio,2),ctx=map.ctx,l=map.layer,s=map.scale;if(c.width!==Math.round(r.width*dpr)||c.height!==Math.round(r.height*dpr)){c.width=Math.round(r.width*dpr);c.height=Math.round(r.height*dpr);}ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#0b1318';ctx.fillRect(0,0,r.width,r.height);const pos=p=>{const q=hexPosition(p);return{x:map.offset.x+q.x*s,y:map.offset.y+q.y*s};},polygon=(p,fill,stroke=null)=>{const q=pos(p);if(q.x<-s||q.y<-s||q.x>r.width+s||q.y>r.height+s)return;ctx.beginPath();for(let k=0;k<6;k++){const a=(30+60*k)*Math.PI/180;ctx[k?'lineTo':'moveTo'](q.x+Math.cos(a)*s,q.y+Math.sin(a)*s);}ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}};
 if(map.showTerrain){drawHexTerrain(map,dpr);if(map.grid&&s>=4)for(let i=0;i<l.solid.length;i++)if(l.material[i]!=='air')polygon({x:i%l.width,y:Math.floor(i/l.width)},null,'#0c1b2744');}
 if(map.showSources)for(const source of map.sources.filter(z=>z.layerId===l.id&&map.sourceVisible.has(z.category))){if(source.kind==='zone'){ctx.globalAlpha=source.id===map.sourceId?.3:.15;for(const[y,x,n]of sourceMask(source,l).runs)for(let dx=0;dx<n;dx++)polygon({x:x+dx,y},CATEGORIES[source.category].color);ctx.globalAlpha=1;}else{const p=pos(source.area);ctx.strokeStyle=CATEGORIES[source.category].color;ctx.lineWidth=source.id===map.sourceId?3:1.5;ctx.beginPath();ctx.arc(p.x,p.y,Math.max(3,s*.5),0,Math.PI*2);ctx.stroke();}}
 for(const o of [...l.objects,...(map.showPreview?map.preview?.plan.commands.filter(o=>o.layerId===l.id)??[]:[])]){const def=map.catalog.get(o.catalogId);if(!def)continue;const p=pos(o);ctx.fillStyle=def.color;ctx.fillRect(p.x-s*.4,p.y-s*.4,Math.max(3,s*.8),Math.max(3,s*.8));}
 const links=map.transportLinks??[];if(map.showTransitions!==false)for(const t of links){if(![t.from,t.to].some(p=>p.layerId===l.id))continue;const a=t.from.layerId===l.id?t.from:t.to,b=a===t.from?t.to:t.from,pa=pos(a);ctx.strokeStyle='#80c6d2';ctx.setLineDash([4,3]);ctx.beginPath();ctx.moveTo(pa.x,pa.y);const pb=b.layerId===l.id?pos(b):{x:pa.x+25,y:pa.y-20};ctx.lineTo(pb.x,pb.y);ctx.stroke();ctx.setLineDash([]);ctx.font='10px system-ui';ctx.fillStyle='#b5e1e6';ctx.fillText(b.layerId===l.id?'↔':b.layerId,pb.x+2,pb.y-3);}
 for(const[p,color,label]of[[l.spawn,'#a3dfb6','S'],[l.exit,'#e6bc8a','E']])if(p){polygon(p,color);if(s>=4){const q=pos(p);ctx.fillStyle='#092022';ctx.font='bold '+Math.max(9,s)+'px system-ui';ctx.textAlign='center';ctx.fillText(label,q.x,q.y+3);}}
 if(map.selection)polygon(map.selection,null,'#f4f4bb');if(map.hover&&map.tool==='brush')polygon(map.hover,null,'#b3e4c1');
}
