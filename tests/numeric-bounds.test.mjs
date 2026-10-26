import test from 'node:test';
import assert from 'node:assert/strict';
import {boundNumericInput} from '../Web/HTML/ui/numeric-bounds.mjs';

test('numeric bounds enforce min/max, integral and explicit decimal steps',()=>{
 for(const[value,min,max,step,expected]of [['-10','0','100','1','0'],['105','0','100','1','100'],['10.7','0','100','1','11'],['10.27','0','100','.1','10.3'],['.15','0','100','.1','.2'],['.123456','0','1','any','.123456'],['-100','-50','50','any','-50']]){const input={value,min,max,step};assert.equal(boundNumericInput(input),true);assert.equal(Number(input.value),Number(expected));}
});

test('incomplete numeric drafts remain invalid instead of silently becoming zero',()=>{
 for(const value of ['', 'NaN','Infinity']){const input={value,min:'0',max:'100',step:'1'};assert.equal(boundNumericInput(input),false);assert.equal(input.value,value);}
});


test('uncommitted numeric typing never replaces a partial number with its minimum',()=>{
 for(const[value,min,max,step,valid]of [['1','16','300','1',false],['10','16','300','1',false],['100','16','300','1',true],['0','.3','4','any',false],['0.5','.3','4','any',true],['500','16','300','1',false]]){const input={value,min,max,step};assert.equal(boundNumericInput(input,{commit:false}),valid);assert.equal(input.value,value,'raw keyboard draft must survive');}
});
