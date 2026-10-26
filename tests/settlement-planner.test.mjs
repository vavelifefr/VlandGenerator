import test from 'node:test';
import assert from 'node:assert/strict';
import {createStreetPlanner,MAX_PIER_SEA_CELLS} from '../engine/core/settlement-streets.mjs';
function terrain(water){const width=28,height=18,n=width*height;return{board:{width,height,walls:[]},fields:{waterType:Array.from({length:n},(_,i)=>i%width>=11&&i%width<=15?water:'none'),waterDepth:Array.from({length:n},(_,i)=>i%width>=11&&i%width<=15?.4:0),elevation:Array.from({length:n},(_,i)=>i%width>=11&&i%width<=15?.2:.6),biome:Array(n).fill('plains'),obstacle:Array(n).fill(0),support:Array(n).fill(1),road:Array(n).fill(''),material:Array(n).fill('soil'),bridge:Array(n).fill(0),reserved:Array(n).fill(0)}};}
test('river crossings have a walkable deck and sea/lake remain outside the road network',()=>{
 for(const width of [1,3]){
  const layer=terrain('river'),p=createStreetPlanner(layer),roads=new Set(),path=p.route({x:3,y:8},{x:22,y:8},width);
  assert.deepEqual(path.at(-1),{x:22,y:8});p.paint(path,width,'town',roads);
  for(let k=1;k<path.length;k++)for(let dy=0;dy<width;dy++)for(let dx=0;dx<width;dx++)assert.ok(Math.abs(layer.fields.elevation[(path[k].y+dy)*28+path[k].x+dx]-layer.fields.elevation[(path[k-1].y+dy)*28+path[k-1].x+dx])<=.18,'Bridge deck must join both banks without an impassable step');
 }
 for(const water of ['sea','lake']){const layer=terrain(water),p=createStreetPlanner(layer),path=p.route({x:3,y:8},{x:22,y:8},1);assert.ok(path.every(c=>layer.fields.waterType[c.y*28+c.x]==='none'));}
});
test('piers stop in the sea after at most three water cells and never bridge to the other bank',()=>{
 const layer=terrain('sea'),p=createStreetPlanner(layer),path=p.pier({x:9,y:8},{x:22,y:8}),sea=path.filter(c=>layer.fields.waterType[c.y*28+c.x]==='sea');
 assert.equal(sea.length,MAX_PIER_SEA_CELLS);assert.equal(layer.fields.waterType[path.at(-1).y*28+path.at(-1).x],'sea');assert.ok(path.every(c=>c.x<16));
 const roads=new Set();p.paint(path,1,'pier',roads);for(const c of sea)assert.equal(layer.fields.road[c.y*28+c.x],'pier');assert.equal(createStreetPlanner(terrain('lake')).pier({x:9,y:8},{x:22,y:8}),null);
});
test('full-width road footprints avoid cliffs, including at bends',()=>{
 const layer=terrain('none');layer.fields.elevation.fill(.6);layer.fields.waterDepth.fill(0);for(let y=3;y<12;y++)layer.fields.obstacle[y*28+12]=1;
 const p=createStreetPlanner(layer),path=p.route({x:3,y:8},{x:22,y:8},3);assert.deepEqual(path.at(-1),{x:22,y:8});
 for(const c of path)for(let dy=0;dy<3;dy++)for(let dx=0;dx<3;dx++)assert.equal(layer.fields.obstacle[(c.y+dy)*28+c.x+dx],0);
});
