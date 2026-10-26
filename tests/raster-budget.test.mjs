import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {exportLayerImages} from '../app/raster-export.mjs';
import {rasterizeLayer,encodePNG} from '../app/raster.mjs';
const makeLayer=kind=>({id:'surface',width:5,height:4,topology:{kind},material:Array.from({length:20},(_,i)=>['grass','rock','air','water','floor'][i%5]),solid:Array.from({length:20},(_,i)=>+(i%5===1)),biome:Array(20).fill('grassland'),water:Array.from({length:20},(_,i)=>i%5===3?'river':'none'),traits:Array(20).fill('normal'),elevation:Array.from({length:20},(_,i)=>i/19)});
function unreadLayer(id,width,height){return{id,width,height,topology:{kind:'square'},get material(){assert.fail('Raster cells read before budget rejection');},get solid(){assert.fail('Raster cells read before budget rejection');}};}

test('an oversized PNG is rejected before reading cells or constructing a raster',()=>{
 assert.throws(()=>exportLayerImages([unreadLayer('large',256,256)],{scale:8,transparent:false}),/PNG API: суммарно не более 16 MiB/);
});
test('the full selected batch budget is checked before rendering its first otherwise valid layer',()=>{
 assert.throws(()=>exportLayerImages([unreadLayer('first',128,128),unreadLayer('second',128,128)],{scope:'all',scale:12,transparent:false}),/PNG API: суммарно не более 16 MiB/);
});
test('invalid palettes retain their validation error before the batch size check',()=>{
 assert.throws(()=>exportLayerImages([unreadLayer('large',256,256)],{scale:8,palette:null}),/Палитра: ожидается объект/);
});

test('square/hex material and water PNG hashes stay fixed while elevation uses the contrast curve',()=>{
 const hashes=['db90e67a4e09fa94c6a33f2b15ecf4df1bd3d96f4fecf8955a1bef36437ca86e','d7c733ebb8c463a2a9da8faa4a3504caac1368e533ee67f1db80afff4d04f721','11b79b043799f9278b93230c8ef890de2af050dcd8603ea5884f698b6f2b7961','6368f737db0a3358edf0426d65d31d61fc196ee3c7d771a412a7b13511da9bea','414b44655287ca05345793a54dca028a8b42fb4b25ddc70fce8f2de6f4c96bb1','1907775021d6d46782059a76482e37a4c019ecf5ddc51036268af09535480d7a'];let n=0;
 for(const kind of ['square','hex'])for(const[channel,scale,transparent]of [['material',3,false],['elevation',1,true],['water',2,false]]){const file=exportLayerImages([makeLayer(kind)],{channel,scale,transparent,palette:{material:{grass:'#808080',rock:'#abcdef'}}}).files[0];assert.equal(createHash('sha256').update(Buffer.from(file.data,'base64')).digest('hex'),hashes[n++]);}
});

test('raster layout predicts exact encoded byte lengths across stored-deflate boundaries',async()=>{
 const {rasterLayout}=await import('../app/raster.mjs');assert.equal(typeof rasterLayout,'function');
 for(const kind of ['square','hex'])for(const[width,height,scale]of [[1,1,1],[5,4,3],[200,100,1],[64,255,1],[64,256,1],[128,128,1],[255,257,1]]){const cells=width*height,l={id:'test',width,height,topology:{kind},material:Array(cells).fill('grass'),solid:Array(cells).fill(0)},layout=rasterLayout(l,scale),actual=rasterizeLayer(l,{scale,transparent:false});assert.equal(layout.width,actual.width);assert.equal(layout.height,actual.height);assert.equal(layout.pngBytes,encodePNG(actual).length);}
});
