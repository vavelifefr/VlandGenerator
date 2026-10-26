import test from 'node:test';
import assert from 'node:assert/strict';
import {coastlineMetrics} from '../tools/verify-coastlines.mjs';

const size=128;
const mask=predicate=>Uint8Array.from({length:size*size},(_,i)=>+predicate(i%size,Math.floor(i/size)));
const circle=mask((x,y)=>Math.hypot(x-64,y-64)<42);
const measure=shape=>coastlineMetrics(shape,{width:size,height:size});

test('regional bay metrics distinguish deep external inlets from enclosed lakes and pixel jitter',()=>{
 const bay=mask((x,y)=>Math.hypot(x-64,y-64)<42&&!(x>53&&x<75&&y<82));
 const lake=mask((x,y)=>Math.hypot(x-64,y-64)<42&&Math.hypot(x-64,y-64)>13);
 const jitter=mask((x,y)=>Math.hypot(x-64,y-64)<42+(((Math.imul(x,73856093)^Math.imul(y,19349663))>>>0)%3-1));
 const a=measure(circle),b=measure(bay),c=measure(lake),d=measure(jitter);
 for(const factor of [2,4]){
  assert.equal(a.scales[factor].regionalBays,0);assert.equal(c.scales[factor].regionalBays,0);
  assert.ok(b.scales[factor].deepBayFraction>.1);assert.ok(b.scales[factor].regionalBays>=1);
  assert.ok(d.scales[factor].deepBayFraction<.015,'Pixel jitter is not a regional bay');
  assert.ok(b.scales[factor].concavity>a.scales[factor].concavity+.1);
 }
});

test('elongation measures regional proportions and topology keeps distinct island components',()=>{
 const elongated=mask((x,y)=>((x-64)/49)**2+((y-64)/20)**2<1),islands=mask((x,y)=>Math.hypot(x-28,y-35)<16||Math.hypot(x-92,y-35)<17||Math.hypot(x-64,y-95)<15);
 const a=measure(circle),b=measure(elongated),c=measure(islands);
 assert.equal(c.nativeComponents,3);assert.ok(c.seaFrame);
 for(const factor of [2,4]){assert.ok(a.scales[factor].elongation<1.05);assert.ok(b.scales[factor].elongation>2);assert.equal(c.scales[factor].components,3);}
});

test('shore length ignores artificial dry map boundaries',()=>{
 // A straight vertical coast occupies half the map. Its only true shoreline
 // equals its hull's true shoreline; three clipped dry sides are excluded.
 const half=measure(mask((x,y)=>x<64));
 for(const factor of [2,4]){const report=half.scales[factor].reports[0],expected=size/factor;assert.ok(report.coastLength>expected*.8&&report.coastLength<expected*1.2);assert.equal(report.hullCoastLength,expected);}
});
