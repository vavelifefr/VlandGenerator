import {seededRandom} from './random.mjs';
import {assignDistricts} from './districts.mjs';
import {assignCompositions} from './compositions.mjs';
import {LAYOUT_PRESETS,frontierPlacements,rankFrontier,orientFootprints,adjacentFootprints} from './growth.mjs';
export function planLevel({seed,roomCount=12,preset='compact',locks=true,loopChance,largeRoomChance,dependencyMode='local',districts=true,compositions=true}={}){
 if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff)throw new Error('Seed: целое от0 до4294967295.');
 if(!Number.isInteger(roomCount)||roomCount<2||roomCount>120)throw new Error('Количество комнат:2–120.');
 if(!Object.hasOwn(LAYOUT_PRESETS,preset))throw new Error('Неизвестный пресет.');
 if(!['local','progressive'].includes(dependencyMode))throw new Error('Зависимости:local или progressive.');
 for(const n of [loopChance,largeRoomChance])if(n!==undefined&&(!Number.isFinite(n)||n<0||n>1))throw new Error('Вероятности должны лежать в0–1.');
 const rules=LAYOUT_PRESETS[preset],random=seededRandom((seed^0x654a9b17)>>>0),nodes=[],edges=[],keys=[],controllers=[],occupied=new Set(),core=[];
 const bonus=locks?Math.max(0,Math.min(6,Math.floor((roomCount-3)*rules.branches))):0,coreCount=Math.max(0,roomCount-2-bonus);
 const create=(purpose,role='intermediate')=>{const n={id:'room-'+(nodes.length+1),name:({start:'Старт',final:'Выход',chamber:'Зал',bonus:'Боковая комната',secret:'Секретный зал'})[purpose],purpose,role,spanX:1,spanY:1};nodes.push(n);return n;};
 const place=(n,p)=>{Object.assign(n,{x:p.x,y:p.y,spanX:p.spanX??1,spanY:p.spanY??1});for(let y=n.y;y<n.y+n.spanY;y++)for(let x=n.x;x<n.x+n.spanX;x++)occupied.add(x+':'+y);};
 const add=(a,b,kind='open',extra={})=>{const edge={id:'edge-'+(edges.length+1),from:a.id,to:b.id,kind,...extra};edges.push(edge);return edge;};
 const linked=(a,b)=>edges.some(e=>e.from===a.id&&e.to===b.id||e.from===b.id&&e.to===a.id);
 const start=create('start','start');start.compact=true;
 if(roomCount===2){place(start,{x:0,y:0});const final=create('final','final');final.compact=true;place(final,{x:1,y:0});add(start,final);return finish(final);}
 for(let i=0;i<coreCount;i++){
  const node=create('chamber'),large=random()<(largeRoomChance??rules.large),spanX=large&&random()<.5?2:1,spanY=large&&spanX===1?2:1;
  if(i===0)place(node,{x:0,y:0,spanX,spanY});
  else{const choices=rankFrontier(frontierPlacements(core,occupied,spanX,spanY),core,random,{preset,step:i-1,ensureLoop:coreCount>=4}),p=choices[0];place(node,p);add(node,p.neighbors[Math.floor(random()*p.neighbors.length)]);}
  if(large){node.name='Большой зал';node.tags=['large-hall'];}core.push(node);
 }
 for(let i=0;i<core.length;i++)for(const b of core.slice(i+1))if(adjacentFootprints(core[i],b)&&!linked(core[i],b)&&random()<(loopChance??rules.loops))add(core[i],b);
 const distances=from=>{const seen=new Map([[from,0]]),q=[from];for(let i=0;i<q.length;i++)for(const e of edges){const next=e.from===q[i]?e.to:e.to===q[i]?e.from:null;if(next&&!seen.has(next)){seen.set(next,seen.get(q[i])+1);q.push(next);}}return seen;};
 const attachEndpoint=(node,from)=>{const dist=distances(from),choices=frontierPlacements(core,occupied).flatMap(p=>p.neighbors.map(parent=>({...p,parent,score:-(dist.get(parent.id)??0)*20+random()*4}))).sort((a,b)=>a.score-b.score),p=choices[0];place(node,p);add(node,p.parent);return p.parent;};
 const startParent=attachEndpoint(start,core[0].id),final=create('final','final');final.compact=true;attachEndpoint(final,startParent.id);
 const offset=Math.floor(random()*4),kinds=['key','lever','secret','breakable'],bonusRooms=[];
 for(let i=0;i<bonus;i++){
  const kind=kinds[(i+offset)%kinds.length],node=create(kind==='secret'?'secret':'bonus','branch'),choices=rankFrontier(frontierPlacements(core,occupied),core,random,{preset,step:coreCount+i}),p=choices[0],parent=p.neighbors[Math.floor(random()*p.neighbors.length)];
  place(node,p);node.tags=['optional',kind==='secret'?'discovery':kind==='breakable'?'breach':'reward'];const edge=add(parent,node,kind);
  const controllerRoom=dependencyMode==='progressive'&&bonusRooms.length?bonusRooms.at(-1):parent;
  if(kind==='key'){edge.keyId='key-'+(keys.length+1);keys.push({id:edge.keyId,roomId:controllerRoom.id,edgeId:edge.id});}
  if(kind==='lever'){edge.controllerId='lever-'+(controllers.length+1);controllers.push({id:edge.controllerId,roomId:controllerRoom.id,edgeId:edge.id});}
  const other=p.neighbors.find(n=>n!==parent);if(other&&kind==='key')add(node,other,'one-way');else if(other&&kind==='secret')add(node,other,'breakable');
  bonusRooms.push(node);
 }
 return finish(final);
 function finish(final){
  const oriented=orientFootprints(nodes,random),plan={version:1,seed,number:1,count:roomCount,preset,dependencyMode,nodes:oriented.nodes,edges,keys,controllers,startId:start.id,bossId:null,finalId:final.id,rotation:oriented.rotation,mirrored:oriented.mirrored};
  const paths=new Map([[start.id,[start.id]]]),q=[start.id];for(let i=0;i<q.length;i++)for(const e of edges.filter(e=>e.kind==='open')){const n=e.from===q[i]?e.to:e.to===q[i]?e.from:null;if(n&&!paths.has(n)){paths.set(n,[...paths.get(q[i]),n]);q.push(n);}}plan.mainPath=paths.get(final.id);return assignCompositions(assignDistricts(plan,{districts}),{compositions});
 }
}
