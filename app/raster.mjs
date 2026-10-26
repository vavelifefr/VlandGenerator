import {gridNeighbors} from '../engine/core/topology.mjs';
// Portable RGBA raster and PNG encoder. No DOM, Node or external packages.
import {SURFACES} from './catalog.mjs';
import {BIOME_COLORS,MATERIAL_COLORS} from './views.mjs';
import {WATER_COLORS,normalizePalette,terrainBiomeColor} from './display-colors.mjs';
export {WATER_COLORS};
export function cellColor(l,i,channel='material',palette={}){
 const custom=palette[channel]?.[l[channel]?.[i]];if(custom)return[1,3,5].map(n=>parseInt(custom.slice(n,n+2),16));
 const natural=['material','biome'].includes(channel)?terrainBiomeColor(l.biome?.[i],channel==='biome'?undefined:l.material[i],palette):null;
 let hex=natural??(channel==='biome'?(BIOME_COLORS[l.biome[i]]??'#566769'):channel==='water'?(WATER_COLORS[l.water[i]]??'#4087a1'):(SURFACES[l.material[i]]?.color??MATERIAL_COLORS[l.material[i]]??'#526466'));
 if(['elevation','fertility','temperature','humidity','drainage','transition'].includes(channel)){let v=channel==='transition'?l.sourceFields?.transitionStrength?.[i]:l[channel]?.[i]??l.sourceFields?.[channel]?.[i]??0;if(channel==='drainage')v=Math.log2(1+v)/12;if(channel==='elevation')v=Math.max(0,Math.min(1,v))**2.4;const n=Math.round(Math.max(0,Math.min(1,v))*220+25);hex='#'+[n,Math.min(255,n+10),Math.min(255,n+13)].map(x=>x.toString(16).padStart(2,'0')).join('');}
 const rgb=[1,3,5].map(n=>parseInt(hex.slice(n,n+2),16));
 // Transition bands use named biome colors; secondary fields describe context, never an RGB gradient.
 if(natural&&(channel==='biome'||!['poisoned','frozen','burnt'].includes(l.traits?.[i])))return rgb;
 const tint=channel==='material'?{fertile:[83,133,78],poisoned:[128,147,65],frozen:[151,196,211],burnt:[83,63,57]}[l.traits?.[i]]:null;if(tint)rgb.forEach((v,k)=>rgb[k]=Math.round(v*.55+tint[k]*.45));if(l.solid[i]&&!['elevation','fertility','temperature','humidity','drainage','transition'].includes(channel))rgb.forEach((v,j)=>rgb[j]=Math.round(v*.66));return rgb;
}
function exterior(l){const n=l.width*l.height,out=new Uint8Array(n),q=[];for(let i=0;i<n;i++)if((i<l.width||i>=n-l.width||i%l.width===0||i%l.width===l.width-1)&&l.solid[i]){q.push(i);out[i]=1;}for(let k=0;k<q.length;k++){const i=q[k],x=i%l.width,y=Math.floor(i/l.width);for(const j of gridNeighbors(i,l.width,l.height,l.topology))if(!out[j]&&l.solid[j]){out[j]=1;q.push(j);}}return out;}
export function rasterLayout(layer,scale=4){
 if(!Number.isInteger(scale)||scale<1||scale>16||layer.width*layer.height*scale*scale>16777216)throw new Error('PNG: масштаб 1–16, не более 16 млн пикселей.');
 const hex=layer.topology?.kind==='hex',cell=scale,dx=hex?Math.sqrt(3)*cell:cell,dy=hex?1.5*cell:cell,width=hex?Math.ceil((layer.width+.5)*dx):layer.width*cell,height=hex?Math.ceil((layer.height-1)*dy+2*cell):layer.height*cell;
 if(width*height>16777216)throw new Error('PNG: не более 16 млн пикселей с учётом формы гексагонов.');
 // Exact length for this RGBA8 encoder: filter bytes, stored-deflate headers, zlib and PNG chunks.
 const raw=(width*4+1)*height;return{hex,cell,dx,dy,width,height,pngBytes:63+raw+5*Math.ceil(raw/65535)};
}
export function rasterizeLayer(layer,{channel='material',scale=4,transparent=true,palette={}}={}){
 palette=normalizePalette(palette);
 const{hex,cell,dx,dy,width,height}=rasterLayout(layer,scale),rgba=new Uint8Array(width*height*4),outside=transparent?exterior(layer):null;
 for(let y=0;y<layer.height;y++)for(let x=0;x<layer.width;x++){const i=y*layer.width+x;if(transparent&&(layer.material[i]==='air'||layer.biome[i]==='void'))continue;if(outside?.[i]){const near=gridNeighbors(i,layer.width,layer.height,layer.topology).some(j=>!layer.solid[j]);if(!near)continue;}const color=cellColor(layer,i,channel,palette);if(!hex){for(let yy=y*cell;yy<(y+1)*cell;yy++)for(let xx=x*cell;xx<(x+1)*cell;xx++)rgba.set([...color,255],(yy*width+xx)*4);}else{const cx=(x+.5+(y%2)*.5)*dx,cy=y*dy+cell;for(let yy=Math.max(0,Math.floor(cy-cell));yy<Math.min(height,Math.ceil(cy+cell));yy++)for(let xx=Math.max(0,Math.floor(cx-dx/2));xx<Math.min(width,Math.ceil(cx+dx/2));xx++)if(Math.abs(xx+.5-cx)<=Math.sqrt(3)*Math.min(cell-Math.abs(yy+.5-cy),cell/2))rgba.set([...color,255],(yy*width+xx)*4);}}
 return{width,height,rgba};
}
const u32=n=>new Uint8Array([n>>>24,n>>>16&255,n>>>8&255,n&255]);
const join=arrays=>{const out=new Uint8Array(arrays.reduce((s,a)=>s+a.length,0));let at=0;for(const a of arrays){out.set(a,at);at+=a.length;}return out;};
const crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function chunk(type,data){const body=join([new TextEncoder().encode(type),data]);let crc=0xffffffff;for(const b of body)crc=crcTable[(crc^b)&255]^(crc>>>8);return join([u32(data.length),body,u32((crc^0xffffffff)>>>0)]);}
export function encodePNG({width,height,rgba}){if(rgba.length!==width*height*4)throw new Error('RGBA length');const stride=width*4,raw=new Uint8Array((stride+1)*height);for(let y=0;y<height;y++)raw.set(rgba.subarray(y*stride,(y+1)*stride),y*(stride+1)+1);const blocks=[new Uint8Array([0x78,0x01])];let a=1,b=0;for(const n of raw){a=(a+n)%65521;b=(b+a)%65521;}for(let i=0;i<raw.length;i+=65535){const count=Math.min(65535,raw.length-i),last=i+count===raw.length;blocks.push(new Uint8Array([last?1:0,count&255,count>>>8,(~count)&255,((~count)>>>8)&255]),raw.subarray(i,i+count));}blocks.push(u32(((b<<16)|a)>>>0));return join([new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',join([u32(width),u32(height),new Uint8Array([8,6,0,0,0])])),chunk('IDAT',join(blocks)),chunk('IEND',new Uint8Array())]);}
