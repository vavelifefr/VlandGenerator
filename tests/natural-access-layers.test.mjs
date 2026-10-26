import test from 'node:test';
import assert from 'node:assert/strict';
import {createRecipe,generateBase} from '../app/index.mjs';
import {validateAtlas,atlasFingerprint} from '../engine/api/atlas.mjs';

async function request(){const r=await createRecipe('caves');r.seed=42;Object.assign(r.generation,{width:100,height:100,layers:{above:0,underground:1},autoTransports:{...r.generation.autoTransports,connectRegions:false,types:{teleport:100,lift:1,stairs:0}}});return r;}
test('natural physical layer chains select only an enabled vertical kind and reject teleport-only weights',async()=>{
 const r=await request(),p=await generateBase(r);assert.ok(p.source.links.length);assert.ok(p.source.links.every(t=>t.kind==='lift'&&t.from.layerId!==t.to.layerId));assert.ok(validateAtlas(p.source).ok);
 r.generation.autoTransports.types={teleport:1,lift:0,stairs:0};await assert.rejects(generateBase(r),/лестниц|лифт/i);
 r.generation.autoTransports.enabled=false;const native=await generateBase(r);assert.ok(native.source.links.every(t=>t.kind==='stairs'&&!t.automatic));assert.ok(validateAtlas(native.source).ok);
});
test('a resealed cross-layer teleport is invalid even when its type, settings and report agree',async()=>{
 const r=await request();r.generation.autoTransports.types={teleport:0,lift:1,stairs:0};const p=await generateBase(r),a=structuredClone(p.source),link=a.links[0];a.request.autoTransports.types.teleport=1;a.automaticTransports.settings.types.teleport=1;link.kind='teleport';a.automaticTransports.counts.lift--;a.automaticTransports.counts.teleport++;a.fingerprint=atlasFingerprint(a);const report=validateAtlas(a);assert.equal(report.ok,false,'Cross-layer teleport cannot replace a real stairs/lift landing');
});
