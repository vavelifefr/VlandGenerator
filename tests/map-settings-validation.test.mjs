import test from 'node:test';
import assert from 'node:assert/strict';
import {validateMapSettings} from '../Web/HTML/ui/map-settings-validation.mjs';

const field=(label,valid,disabled=false)=>({checkValidity:()=>disabled||valid,getAttribute:()=>label});
const scope=fields=>({querySelectorAll:()=>fields});
test('invalid access fields under the map prevent generation even when sidebar settings are valid',()=>{
 assert.throws(()=>validateMapSettings({settings:scope([field('Размер',true)]),access:scope([field('Лимит переходов',false)])}),/Лимит переходов/);
});
test('active physical-layer settings are validated with both settings scopes',()=>{
 assert.throws(()=>validateMapSettings({settings:scope([]),access:scope([]),layers:scope([field('Глубина',false)])}),/Глубина/);
});
test('empty access scopes and disabled access options do not block valid settings',()=>{
 assert.doesNotThrow(()=>validateMapSettings({settings:scope([field('Размер',true)]),access:scope([field('Отключённая опция',false,true)]),layers:scope([])}));
});
test('unfinished biome-card inputs never block Create while normal settings remain validated',()=>{
 const draft={...field('Черновик биома',false),dataset:{biomeDraft:'true'}};
 assert.doesNotThrow(()=>validateMapSettings({settings:scope([draft,field('Размер',true)])}));
 assert.throws(()=>validateMapSettings({settings:scope([draft,field('Размер',false)])}),/Размер/);
});
