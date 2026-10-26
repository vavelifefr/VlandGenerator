import {ATLAS_RESOURCES,ATLAS_BIOMES,ATLAS_STRUCTURES} from '../api/atlas-catalog.mjs';
import {createMovementField,findMovementPath} from '../api/movement.mjs';
import {atlasComponents} from '../api/atlas-navigation.mjs';
import {atlasSeed} from './atlas-landforms.mjs';
import {hash2,neighbors,cell} from './atlas-math.mjs';

const trees=new Set(['oak','pine','palm','acacia','giant-fungus']);
export function populateAtlasLayer(layer,r){
  const f=layer.fields,w=r.width,h=r.height,n=w*h,depth=layer.kind==='underground'?Number(layer.id.slice(5)):0,seed=atlasSeed(r,layer.id,'deposits');
  layer.deposits=[];layer.sites=[];
  const eligible=r.resources.types.filter(id=>depth>=ATLAS_RESOURCES[id].minDepth&&depth<=ATLAS_RESOURCES[id].maxDepth);
  const count=layer.kind==='aboveground'?0:Math.round(n/900*r.resources.frequency);
  for(let k=0;k<count;k++){
    const center=Math.floor(hash2(seed,k,3)*n),host=f.rock[center],options=eligible.filter(id=>ATLAS_RESOURCES[id].hosts.includes(host));
    if(!options.length||f.reserved[center]||f.waterType[center]!=='none')continue;
    let roll=hash2(seed,k,5)*options.reduce((s,id)=>s+ATLAS_RESOURCES[id].weight,0),id=options.at(-1);
    for(const option of options){roll-=ATLAS_RESOURCES[option].weight;if(roll<=0){id=option;break;}}
    const spec=ATLAS_RESOURCES[id],target=Math.max(1,Math.round((3+hash2(seed,k,9)*10)*r.resources.size)),queue=[center],seen=new Set(queue),cells=[];
    for(let q=0;q<queue.length&&cells.length<target;q++){
      const i=queue[q],x=i%w,y=Math.floor(i/w);
      if(x<1||y<1||x>=w-1||y>=h-1||f.resource[i]||f.reserved[i]||f.waterType[i]!=='none'||!spec.hosts.includes(f.rock[i]))continue;
      cells.push(i);for(const j of neighbors(i,w,h,r.topology).sort((a,b)=>hash2(seed,k,a)-hash2(seed,k,b)))if(!seen.has(j)){seen.add(j);queue.push(j);}
    }
    if(!cells.length)continue;const depositId=layer.id+'-ore-'+(layer.deposits.length+1);
    for(const i of cells){f.resource[i]=id;f.resourceAmount[i]=Math.max(1,Math.round((15+hash2(seed,k,i)*65)*r.resources.richness));f.deposit[i]=depositId;}
    layer.deposits.push({id:depositId,type:id,depth,hostRule:[...spec.hosts],cells:cells.map(i=>cell(i,w)),amount:cells.reduce((sum,i)=>sum+f.resourceAmount[i],0)});
  }
  // All mandatory routes are reserved before vegetation/structures are placed.
  const ecology=atlasSeed(r,layer.id,'ecology'),occupied=new Set();
  for(let i=0;i<n;i++){
    if(r.ecology.vegetation===0||f.obstacle[i]||!f.support[i]||f.waterType[i]!=='none'||f.reserved[i]||f.resource[i])continue;
    const b=ATLAS_BIOMES[f.biome[i]],plant=b.plant;if(!plant||hash2(ecology,i,1)>b.cover*r.ecology.vegetation)continue;
    if(trees.has(plant)&&neighbors(i,w,h,r.topology).some(j=>occupied.has(j)))continue;
    f.vegetation[i]=plant;occupied.add(i);if(trees.has(plant)&&r.ecology.blockingTrees)f.obstacle[i]=1;
  }
  const field=createMovementField(layer,r.profile),main=new Set(layer.routeCells),reachable=new Set(atlasComponents(field).find(c=>c.includes(layer.spawn.y*w+layer.spawn.x))??[]),siteSeed=atlasSeed(r,layer.id,'sites');
  const distance=i=>Math.hypot(i%w-layer.spawn.x,Math.floor(i/w)-layer.spawn.y);
  const candidates=Array.from({length:n},(_,i)=>i).filter(i=>reachable.has(i)&&field.passable[i]&&f.support[i]&&f.waterType[i]==='none'&&!f.reserved[i]&&!f.resource[i]&&!f.vegetation[i]&&distance(i)>r.playability.safeRadius+1)
    .sort((a,b)=>hash2(siteSeed,a,1)-hash2(siteSeed,b,1));
  const used=new Set(),approach=i=>neighbors(i,w,h,r.topology).find(j=>main.has(j))??i;
  function site(kind,type,size=1){
    const i=candidates.find(i=>{const x=i%w,y=Math.floor(i/w);if(x+size>=w-1||y+size>=h-1)return false;
      for(let dy=0;dy<size;dy++)for(let dx=0;dx<size;dx++){const j=i+dy*w+dx;if(!field.passable[j]||!f.support[j]||f.reserved[j]||f.resource[j]||f.vegetation[j]||f.waterType[j]!=='none'||used.has(j))return false;}return true;});
    if(i===undefined)return null;const cells=[];for(let dy=0;dy<size;dy++)for(let dx=0;dx<size;dx++){const j=i+dy*w+dx;used.add(j);cells.push(cell(j,w));}
    const item={id:layer.id+'-'+kind+'-'+(layer.sites.length+1),kind,type,position:cell(i,w),footprint:{width:size,height:size},cells,approach:cell(approach(i),w),biome:f.biome[i],depth};layer.sites.push(item);return item;
  }
  if(layer.kind!=='aboveground')for(let k=0;k<Math.round(n/3000*r.structures.density);k++){
    if(!r.structures.types.length)break;
    const options=r.structures.types.filter(id=>layer.kind==='underground'?['mine','ruins','temple','outpost'].includes(id):true),type=options[Math.floor(hash2(siteSeed,k,21)*options.length)];if(!type)continue;
    const item=site('structure',type,3);if(item){item.interaction=ATLAS_STRUCTURES[type]??type;item.destructible=type!=='temple';for(const p of item.cells){const i=p.y*w+p.x;f.structure[i]=item.id;f.reserved[i]=1;}if(r.structures.trails)for(const p of findMovementPath(layer,layer.spawn,item.position,r.profile,{},field)??[]){const i=p.y*w+p.x;f.road[i]=f.bridge[i]?'bridge':'trail';}}
  }
  for(let k=0;k<Math.round(n/4000*r.events.density);k++){
    const types=layer.kind==='underground'?['survey','cache','unstable','shrine']:['cache','survey','contamination'],item=site('event',types[k%types.length]);if(!item)continue;
    item.trigger='interact';item.once=true;item.choices=[{id:'investigate',outcomes:[{type:item.type==='unstable'?'hazard':'reward',value:item.type==='unstable'?'rockfall':'supplies',amount:1}]},{id:'leave',outcomes:[{type:'flag',value:'declined',amount:1}]}];
  }
  for(let k=0;k<Math.round(n/4200*r.events.spawners);k++){
    const item=site('spawner',layer.kind==='underground'?'cave-nest':'wildlife-den');if(!item)continue;
    const biome=f.biome[item.position.y*w+item.position.x],family=layer.kind==='underground'?'subterranean':biome==='desert'?'arid-wildlife':biome==='snow'||biome==='tundra'?'cold-wildlife':'forest-wildlife';
    item.family=family;item.threat=r.events.threat;item.period=4;item.program={activation:{type:'proximity',delay:0},waves:[{members:[{mobId:family+'-scout',count:1}]},{members:[{mobId:family+'-guard',count:1+Math.floor(r.events.threat*2)}]}],repeat:'once'};item.aliveLimit=3;item.totalLimit=item.program.waves.reduce((s,v)=>s+v.members.reduce((a,m)=>a+m.count,0),0);item.radius=5;
  }
  if(r.resources.starter&&r.resources.frequency>0&&r.resources.types.length&&layer.id==='surface'){
    const near=layer.routeCells.find(i=>field.passable[i]&&f.waterType[i]==='none'&&distance(i)>=2&&distance(i)<=r.playability.safeRadius&&!f.structure[i]);
    if(near!==undefined)layer.sites.push({id:'starter-cache',kind:'supply',type:'cache',position:cell(near,w),footprint:{width:1,height:1},cells:[cell(near,w)],approach:cell(near,w),biome:f.biome[near],depth:0,contents:[{resource:r.resources.types[0],amount:10}],note:'Стартовый запас; не природная залежь.'});
  }
}
