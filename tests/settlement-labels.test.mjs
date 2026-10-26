import test from 'node:test';
import assert from 'node:assert/strict';
import {settlementLabels} from '../Web/HTML/ui/settlement-overlay.mjs';
test('settlement labels fit their land and never overlap neighbouring labels or spill outside the map',()=>{
 const layer={width:20,height:12,quarters:[{neighborhoodIds:['neighborhood-1','neighborhood-2','neighborhood-3']}],neighborhoods:[{id:'neighborhood-1',bounds:{x:1,y:1,width:1,height:10},cells:Array.from({length:10},(_,y)=>(y+1)*20+1)},{id:'neighborhood-2',bounds:{x:3,y:1,width:6,height:10},cells:Array.from({length:60},(_,i)=>(Math.floor(i/6)+1)*20+3+i%6)},{id:'neighborhood-3',bounds:{x:10,y:1,width:8,height:10},cells:Array.from({length:80},(_,i)=>(Math.floor(i/8)+1)*20+10+i%8)}]};
 const labels=settlementLabels(layer,4,text=>text.length*6);assert.ok(labels.length>0);assert.ok(!labels.some(l=>l.id==='neighborhood-1'));
 for(let i=0;i<labels.length;i++){const a=labels[i];assert.ok(a.x>=0&&a.y>=0&&a.x+a.width<=80&&a.y+a.height<=48);for(let j=0;j<i;j++){const b=labels[j];assert.ok(a.x>=b.x+b.width||b.x>=a.x+a.width||a.y>=b.y+b.height||b.y>=a.y+a.height,'Neighbour labels overlap');}}
});
