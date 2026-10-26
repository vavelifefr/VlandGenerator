import test from 'node:test';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {createRecipe,generateBase,materialize,editProject,execute} from '../app/index.mjs';
import {cellColor} from '../app/raster.mjs';
import {exportLayerImages} from '../app/raster-export.mjs';
import {BIOME_COLORS} from '../app/views.mjs';
import {hash} from '../content/common.mjs';

function pixel(file,x,y){
 const data=Buffer.from(file.data,'base64'),chunks=[];let offset=8;
 while(offset<data.length){const length=data.readUInt32BE(offset);if(data.toString('ascii',offset+4,offset+8)==='IDAT')chunks.push(data.subarray(offset+8,offset+8+length));offset+=length+12;}
 const raw=inflateSync(Buffer.concat(chunks)),stride=file.width*4+1;assert.equal(raw[y*stride],0,'RGBA encoder filter');return [...raw.subarray(y*stride+1+x*4,y*stride+1+x*4+4)];
}
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
const sample=()=>({id:'surface',width:1,height:1,topology:{kind:'square'},material:['grass'],biome:['plains'],solid:[0],water:['none'],sourceFields:{secondaryBiome:['forest'],transitionStrength:[.4]}});

test('secondary metadata does not blend the primary named color in shared cell or PNG',()=>{
 const layer=sample(),before=structuredClone(layer),palette={biome:{forest:'#ff00ff'}},expected=rgb(BIOME_COLORS.plains);
 assert.deepEqual(cellColor(layer,0,'biome',palette),expected);
 const png=exportLayerImages([layer],{channel:'biome',scale:1,transparent:false,palette}).files[0];assert.deepEqual(pixel(png,0,0),[...expected,255]);assert.deepEqual(layer,before);
});

test('an explicit primary biome color remains exact despite secondary blending and solid shading',()=>{
 const layer=sample();layer.solid[0]=1;const palette={biome:{plains:'#123456',forest:'#ff00ff'}};
 assert.deepEqual(cellColor(layer,0,'biome',palette),[18,52,86]);
 assert.deepEqual(pixel(exportLayerImages([layer],{channel:'biome',scale:1,transparent:false,palette}).files[0],0,0),[18,52,86,255]);
});

for(const mode of ['landscape','hexlandscape'])test(mode+' manual biome override clears only its derived band and preserves the immutable source',async()=>{
 const recipe=await createRecipe(mode);Object.assign(recipe.generation,{width:32,height:32,layers:{above:0,underground:0},landscape:{structure:'coast',baseBiome:'forest'}});recipe.generation.hydrology.rivers=0;recipe.generation.hydrology.lakes=0;
 const project=await generateBase(recipe),sourceHash=hash(project.source),layer=(await materialize(project))[0],original=structuredClone(layer.sourceFields),i=original.secondaryBiome.findIndex((v,i)=>v&&!layer.reserved[i]&&!layer.solid[i]);assert.ok(i>=0,'Real transition available');
 const cell={x:i%layer.width,y:Math.floor(i/layer.width)},context=await execute('export',{project,format:'llm-context'});
 for(const value of [original.secondaryBiome[i],layer.biome[i]])for(const operation of [{type:'terrain.stroke',layerId:layer.id,field:'biome',value,cells:[cell]},{type:'field',layerId:layer.id,field:'biome',value,...cell}]){
  const edited=await editProject(project,operation),current=(await materialize(edited))[0],fields=current.sourceFields;
  assert.equal(current.biome[i],value);assert.equal(fields.secondaryBiome[i],'','Manual cell has no old secondary biome');assert.equal(fields.transitionStrength[i],0,'Manual cell has no old transition weight');
  assert.equal(hash(edited.source),sourceHash);assert.equal(hash(project.source),sourceHash);assert.deepEqual((await materialize(project))[0].sourceFields,original,'Previous project still restores its source bands');
  for(let j=0;j<layer.width*layer.height;j++)if(j!==i){assert.equal(fields.secondaryBiome[j],original.secondaryBiome[j],'Neighbor secondary unchanged');assert.equal(fields.transitionStrength[j],original.transitionStrength[j],'Neighbor weight unchanged');}
  for(const key of Object.keys(original).filter(k=>!['biome','secondaryBiome','transitionStrength'].includes(k)))assert.deepEqual(fields[key],original[key],'Independent source field '+key);
  const runtime=await execute('runtime',{project:edited}),physical=runtime.scene.map.layers.find(l=>l.id===layer.id);assert.equal(physical.biome[i],value);assert.equal(physical.secondaryBiome[i],'');assert.equal(physical.metrics.transitionStrength[i],0);
  const updated=await execute('export',{project:edited,format:'llm-context'}),count=c=>c.layers.find(l=>l.id===layer.id).fields.biome.counts.find(v=>v.value===value)?.count??0;assert.equal(count(updated),count(context)+(value===layer.biome[i]?0:1),'Current context histogram includes the override');
  const file=(await execute('raster-export',{project:edited,options:{layerId:layer.id,channel:'biome',scale:2,transparent:false}})).files[0],point=mode==='hexlandscape'?{x:Math.floor((cell.x+.5+(cell.y%2)*.5)*Math.sqrt(3)*2),y:Math.floor(cell.y*3+2)}:{x:cell.x*2,y:cell.y*2};assert.deepEqual(pixel(file,point.x,point.y),[...rgb(BIOME_COLORS[value]),255],'PNG shows the manually chosen biome without the old band');
  const restored=(await materialize(await editProject(edited,{type:'reset-edits'})))[0];assert.deepEqual(restored.sourceFields.secondaryBiome,original.secondaryBiome);assert.deepEqual(restored.sourceFields.transitionStrength,original.transitionStrength);
 }
});
