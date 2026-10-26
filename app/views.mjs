import {ATLAS_BIOMES,ATLAS_MATERIALS} from '../engine/api/atlas-catalog.mjs';
const clone=structuredClone;
const base=(id,z,kind,width,height)=>({id,z,kind,width,height,solid:Array(width*height).fill(0),material:Array(width*height).fill('floor'),biome:Array(width*height).fill('interior'),water:Array(width*height).fill('none'),vegetation:Array(width*height).fill(''),resource:Array(width*height).fill(''),fertility:Array(width*height).fill(0),traits:Array(width*height).fill('normal'),elevation:Array(width*height).fill(z),reserved:Array(width*height).fill(0),rooms:[],objects:[],protected:[],links:[],spawn:null,exit:null});
const native=(id,layerId,catalogId,x,y,properties={})=>({id:`native-${layerId}-${id}`,layerId,catalogId,x,y,properties,origin:'source'});
export function dungeonLayer(map,id,z){
 const level=map.level,{width,height}=level.board,v=base(id,z,'dungeon',width,height);
 for(const w of level.board.walls){const i=w.y*width+w.x;v.solid[i]=w.type==='door'?0:1;v.material[i]=w.type==='internal'?'destructible':w.type==='door'?'door':'wall';}
 v.spawn=clone(level.spawn);v.exit=clone(level.rooms.find(r=>r.id===level.plan.finalId).core);
 v.rooms=level.rooms.map(r=>({id:r.id,name:r.role??r.id,purpose:r.purpose,x:r.x,y:r.y,width:r.width,height:r.height,cells:clone(r.floorTiles),shape:r.shape,core:clone(r.core),doors:clone(r.doors)}));
 v.transportLinks=clone(level.transportLinks??[]).map(t=>({...t,id:id+'-'+t.id,from:{...t.from,layerId:id},to:{...t.to,layerId:id}}));v.externalTransports=clone(level.externalTransports??[]).map(t=>({...t,id:id+'-'+t.id,from:{...t.from,layerId:id},to:{...t.to,layerId:id}}));v.links=clone(v.transportLinks);v.gates=clone(level.gates);v.mechanisms=clone(level.mechanisms);v.plan=clone(level.plan);
 for(const g of v.gates){const i=g.position.y*width+g.position.x;v.material[i]=g.kind==='breakable'?'destructible':g.kind==='secret'?'wall':'door';}
 v.protected=(level.protectedTiles??[]).map(k=>{const[x,y]=k.split(':').map(Number);return{x,y};});
 for(const p of v.protected)v.reserved[p.y*width+p.x]=1;
 v.objects=(map.content.hints??[]).map(h=>native(h.id,id,({enemy:'guard',loot:'chest',trap:'spikes',light:'lamp',spawner:'spawner'})[h.kind]??'event',h.x,h.y,{sourceKind:h.kind,roomId:h.roomId}));
 v.objects.push(...v.transportLinks.flatMap(t=>['from','to'].map(side=>native(t.id+'-'+side,id,t.kind==='teleport'?'portal':t.kind,t[side].x,t[side].y,{transportId:t.id,kind:t.kind,destination:clone(t[side==='from'?'to':'from']),bidirectional:t.bidirectional,travelCost:t.travelCost??1,automatic:!!t.automatic,structural:true}))));
 v.objects.push(...level.mechanisms.map(m=>native(m.id,id,m.type==='pump'?'pump':'lever',m.position.x,m.position.y,{source:m,structural:true})));
 return v;
}
export function sideLayer(map){
 const{width,height}=map.board,v=base('main',0,'sideview',width,height);for(const p of map.board.walls){const i=p.y*width+p.x;v.solid[i]=1;v.material[i]='rock';}
 v.spawn=clone(map.spawn);v.exit=clone(map.exit);v.rooms=map.rooms.map(r=>({...clone(r),cells:[]}));
 v.objects=[...map.sites.map(s=>native(s.id,'main','chest',s.position.x,s.position.y,{source:s})),...map.grants.map(g=>native(g.id,'main','event',g.position.x,g.position.y,{ability:g.ability,source:g,structural:true}))];
 v.ladders=clone(map.ladders);v.challenges=clone(map.challenges);v.hazards=clone(map.hazards);
 v.protected=[map.spawn,map.exit,...map.grants.map(g=>g.position),...map.challenges.flatMap(c=>[c.from,c.to])].flatMap(p=>Array.from({length:map.request.physics.width*map.request.physics.height},(_,i)=>({x:p.x+i%map.request.physics.width,y:p.y+Math.floor(i/map.request.physics.width)})));
 return v;
}
export function naturalLayers(map){return map.layers.map(l=>{
 const{width,height}=l.board,v=base(l.id,l.z,l.kind,width,height),f=l.fields;
 v.topology=clone(l.topology??{kind:'square'});v.solid=[...f.obstacle];v.material=[...f.material];v.biome=[...f.biome];v.water=[...f.waterType];v.elevation=[...f.elevation];v.reserved=[...f.reserved];v.vegetation=[...f.vegetation];v.resource=[...f.resource];v.fertility=[...f.fertility];v.sourceFields=clone(f);
 v.spawn=map.spawn.layerId===l.id?clone(map.spawn):clone(l.spawn);v.exit=map.exit.layerId===l.id?clone(map.exit):clone(l.exit);
 v.protected=[...l.routeCells,...map.links.flatMap(link=>[link.from,link.to].filter(p=>p.layerId===l.id)).flatMap(p=>Array.from({length:(p.footprint?.width??2)*(p.footprint?.height??2)},(_,i)=>({x:p.x+i%(p.footprint?.width??2),y:p.y+Math.floor(i/(p.footprint?.width??2))})))];
 v.objects=l.sites.map(s=>native(s.id,l.id,s.kind==='structure'?(s.type==='camp'?'camp':'ruin'):s.kind==='spawner'?'spawner':'event',s.position.x,s.position.y,{sourceType:s.type,...clone(s)}));
 v.links=map.links.filter(link=>link.from.layerId===l.id||link.to.layerId===l.id);return v;
});}
export const BIOME_COLORS=Object.fromEntries(Object.entries(ATLAS_BIOMES).map(([id,v])=>[id,v.color]));
export const MATERIAL_COLORS=Object.fromEntries(Object.entries(ATLAS_MATERIALS).map(([id,v])=>[id,v.color]));
