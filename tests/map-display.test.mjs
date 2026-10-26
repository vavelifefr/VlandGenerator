import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePalette,paletteEntries} from '../app/display-colors.mjs';
import {cellColor,rasterizeLayer} from '../app/raster.mjs';
import {exportLayerImages} from '../app/raster-export.mjs';
import {cellDetails} from '../Web/HTML/ui/cell-details.mjs';
import {hsvToHex,hexToHsv} from '../Web/HTML/ui/color-picker.mjs';
const layer={id:'ground',width:2,height:1,z:0,kind:'land',material:['grass','rock'],solid:[0,1],biome:['grassland','mountain'],water:['none','none'],traits:['normal','normal'],elevation:[0,.4],fertility:[.5,.2],reserved:[0,1]};
test('display overrides are validated, copied, exact and shared by cells and PNG without editing a layer',()=>{
 const original=structuredClone(layer),palette={material:{grass:'#808080',rock:'#abcdef'}};
 assert.deepEqual(normalizePalette(palette),palette);assert.notEqual(normalizePalette(palette).material,palette.material);
 assert.deepEqual(cellColor(layer,0,'material',palette),[128,128,128]);assert.deepEqual(cellColor(layer,1,'material',palette),[171,205,239]);
 for(const topology of [{kind:'square'},{kind:'hex'}]){const r=rasterizeLayer({...layer,topology},{palette,scale:4,transparent:false});assert.ok(r.rgba.some((v,i)=>i%4===0&&v===128&&r.rgba[i+1]===128&&r.rgba[i+2]===128));}
 assert.notDeepEqual(exportLayerImages([layer],{scale:1,palette}).files[0].data,exportLayerImages([layer],{scale:1}).files[0].data);
 assert.deepEqual(layer,original);for(const p of [{unknown:{}},{material:{grass:'red'}},{material:{unknown:'#ffffff'}},[],null])assert.throws(()=>normalizePalette(p));
 assert.ok(paletteEntries().some(e=>e.channel==='material'&&e.id==='basalt'));assert.ok(paletteEntries().some(e=>e.channel==='water'&&e.id==='river'));
});
test('HSV picker round-trips saturated and neutral colors including endpoints',()=>{
 for(const hex of ['#808080','#ff0000','#00ffff','#000000','#ffffff','#13a7e0'])assert.equal(hsvToHex(...Object.values(hexToHsv(hex))),hex);
 assert.equal(hsvToHex(360,1,1),'#ff0000');assert.equal(hsvToHex(120,1,.5),'#008000');
});
test('cell details are informational, bounds-checked and localized for every physical layer kind',()=>{
 for(const kind of ['dungeon','tier','sideview','underground','land','settlement']){const l={...layer,kind};const before=structuredClone(l),d=cellDetails(l,{x:0,y:0});assert.equal(d.title,'Клетка 0, 0');assert.equal(d.values.Материал,'Дёрн');assert.equal(d.values.Уровень,'ground');assert.ok(d.values.Биом);assert.deepEqual(l,before);}
 for(const p of [null,{x:-1,y:0},{x:2,y:0},{x:0,y:1}])assert.equal(cellDetails(layer,p),null);
});
