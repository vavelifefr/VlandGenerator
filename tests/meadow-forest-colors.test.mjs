import test from 'node:test';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {cellColor,rasterizeLayer,encodePNG} from '../app/raster.mjs';
import {BIOME_COLORS} from '../app/views.mjs';
import {paletteEntries,terrainLegendEntries} from '../app/display-colors.mjs';
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
const fixture=kind=>({width:2,height:1,topology:{kind},material:['grass','grass'],solid:[0,0],traits:['normal','normal'],biome:['plains','forest'],water:['none','none']});
const light=c=>c[0]*.2126+c[1]*.7152+c[2]*.0722;
function decodePNG(bytes){const chunks=[];let width,height;for(let at=8;at<bytes.length;){const n=new DataView(bytes.buffer,bytes.byteOffset+at,4).getUint32(0),kind=new TextDecoder().decode(bytes.subarray(at+4,at+8)),data=bytes.subarray(at+8,at+8+n);if(kind==='IHDR'){const view=new DataView(data.buffer,data.byteOffset,data.length);width=view.getUint32(0);height=view.getUint32(4);}if(kind==='IDAT')chunks.push(data);at+=n+12;}const raw=inflateSync(Buffer.concat(chunks)),rgba=new Uint8Array(width*height*4);for(let y=0;y<height;y++){assert.equal(raw[y*(width*4+1)],0);rgba.set(raw.subarray(y*(width*4+1)+1,(y+1)*(width*4+1)),y*width*4);}return{width,height,rgba};}
const at=(r,x,y)=>[...r.rgba.subarray((y*r.width+x)*4,(y*r.width+x)*4+4)];

test('default material view distinguishes open meadow and darker forest while retaining legend biome colors',()=>{
 const l=fixture('square'),before=structuredClone(l),meadow=cellColor(l,0),forest=cellColor(l,1);
 assert.deepEqual(meadow,rgb(BIOME_COLORS.plains));assert.deepEqual(forest,rgb(BIOME_COLORS.forest));assert.ok(light(forest)+25<light(meadow));
 assert.ok(forest[1]>forest[0]&&forest[1]>forest[2]);assert.ok(meadow[1]>meadow[0]&&meadow[1]>meadow[2]);assert.deepEqual(l,before);
 for(const [i,id]of l.biome.entries())assert.equal(paletteEntries().find(v=>v.channel==='biome'&&v.id===id).color,BIOME_COLORS[id]);
});

test('forest climate subtypes remain dark and non-grass materials keep their own identity',()=>{
 const l=fixture('square'),meadow=cellColor(l,0);for(const id of ['forest','taiga','rainforest']){l.biome[1]=id;assert.ok(light(cellColor(l,1))+15<light(meadow));}
 l.material[1]='rock';const rock=cellColor(l,1);l.biome[1]='plains';assert.deepEqual(cellColor(l,1),rock);
});

test('grass keeps discrete biome palette colors while explicit material RGB wins exactly',()=>{
 const l=fixture('hex');l.sourceFields={secondaryBiome:['forest','plains'],transitionStrength:[.25,.25]};
 const a=rgb(BIOME_COLORS.plains),b=rgb(BIOME_COLORS.forest);assert.deepEqual(cellColor(l,0),a);
 assert.deepEqual(cellColor(l,0,'material',{biome:{plains:'#aacc88',forest:'#224422'}}),[170,204,136]);
 l.solid[0]=1;l.traits[0]='poisoned';assert.deepEqual(cellColor(l,0,'material',{material:{grass:'#112233'},biome:{plains:'#ffffff'}}),[17,34,51]);
 l.solid[0]=0;l.traits[0]='normal';l.sourceFields.secondaryBiome[0]='alpine';assert.deepEqual(cellColor(l,0),a,'rocky secondary biome cannot recolor grass through this limited family tint');
});

test('material legend replaces generic turf with actual meadow and forest swatches without duplicate controls',()=>{
 const l=fixture('square'),entries=terrainLegendEntries(l);assert.deepEqual(entries.map(e=>e.name),['Луга','Лес']);
 assert.deepEqual(entries.map(e=>e.color),l.biome.map(id=>BIOME_COLORS[id]));
 assert.deepEqual(terrainLegendEntries({...l,width:3,material:['grass','grass','grass'],biome:['forest','forest','plains']}).map(e=>e.id),['plains','forest']);
 const custom={biome:{forest:'#234523'}};assert.equal(terrainLegendEntries(l,'material',custom)[1].color,'#234523');
 assert.deepEqual(terrainLegendEntries(l,'material',{material:{grass:'#112233'}}).map(e=>e.id),['grass']);
 assert.deepEqual(terrainLegendEntries(l,'biome').map(e=>e.id),['plains','forest']);
 assert.ok(terrainLegendEntries({...l,biome:['interior','forest']}).some(e=>e.channel==='material'&&e.id==='grass'),'unclassified grass still has its generic material swatch');
});

test('square and odd-r PNG export show the same two grass colors as the primary map view',()=>{
 for(const kind of ['square','hex']){
  const l=fixture(kind),scale=8,raster=rasterizeLayer(l,{scale,transparent:false}),png=decodePNG(encodePNG(raster));assert.deepEqual(png.rgba,raster.rgba);
  for(let x=0;x<2;x++){const px=Math.floor(kind==='hex'?(x+.5)*Math.sqrt(3)*scale:(x+.5)*scale),py=kind==='hex'?scale:Math.floor(scale/2);assert.deepEqual(at(png,px,py),[...cellColor(l,x),255]);}
  const custom=rasterizeLayer(l,{scale,transparent:false,palette:{material:{grass:'#667788'}}});for(let x=0;x<2;x++){const px=Math.floor(kind==='hex'?(x+.5)*Math.sqrt(3)*scale:(x+.5)*scale),py=kind==='hex'?scale:Math.floor(scale/2);assert.deepEqual(at(custom,px,py),[102,119,136,255]);}
 }
});
