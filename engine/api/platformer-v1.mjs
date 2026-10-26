import {LabError,API_VERSION,GENERATOR_VERSION} from './config.mjs';
import {fingerprint} from './identity.mjs';
import {hash2} from '../core/atlas-math.mjs';
import {deriveStageSeed} from '../core/streams.mjs';
export const PLATFORMER_VERSION='1.0.0';
export const PLATFORMER_REQUEST_TEMPLATE=Object.freeze({schema:'vland.platformer.request',schemaVersion:1,seed:42,preset:'metroidvania',rooms:10,roomWidth:{min:14,max:22},roomHeight:{min:10,max:16},branches:.35,platforms:.6,gaps:.4,physics:{width:1,height:2,speed:5,jumpSpeed:11,gravity:28,climbSpeed:3}});
const only=(v,keys)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!keys.includes(k)))throw new LabError('INVALID_PLATFORMER','Неизвестное поле платформера.');};
export function normalizePlatformerRequest(input){
  only(input,Object.keys(PLATFORMER_REQUEST_TEMPLATE));if(input.schema!=='vland.platformer.request'||input.schemaVersion!==1)throw new LabError('INVALID_PLATFORMER','Нужен vland.platformer.request версии1.');
  const r={...structuredClone(PLATFORMER_REQUEST_TEMPLATE),...structuredClone(input)};
  for(const key of ['roomWidth','roomHeight','physics']){if(input[key]!==undefined)only(input[key],Object.keys(PLATFORMER_REQUEST_TEMPLATE[key]));r[key]={...PLATFORMER_REQUEST_TEMPLATE[key],...input[key]};}
  const range=(n,a,b,int=false)=>Number.isFinite(n)&&n>=a&&n<=b&&(!int||Number.isInteger(n));
  if(!range(r.seed,0,0xffffffff,true)||!range(r.rooms,1,30,true)||!['metroidvania','roguelite','vertical'].includes(r.preset)||!['branches','platforms','gaps'].every(k=>range(r[k],0,1)))throw new LabError('INVALID_PLATFORMER','Seed uint32, комнат1–30, частоты0–1.');
  for(const[k,min,max]of [['roomWidth',12,28],['roomHeight',9,22]])if(!range(r[k].min,min,max,true)||!range(r[k].max,r[k].min,max,true))throw new LabError('INVALID_PLATFORMER','Неверные размеры '+k);
  const p=r.physics;if(!range(p.width,1,2,true)||!range(p.height,1,3,true)||!range(p.speed,2,8)||!range(p.jumpSpeed,8,18)||!range(p.gravity,16,40)||!range(p.climbSpeed,1,6))throw new LabError('INVALID_PLATFORMER','Неверный профиль физики.');return r;
}
const key=p=>p.x+':'+p.y;
function model(map,physics=map.request.physics){
  const w=map.board.width,h=map.board.height,solid=new Set(map.board.walls.map(key)),ladder=new Set(map.ladders.map(key));
  const fits=(x,y)=>{if(x<0||y<0||x+physics.width>w||y+physics.height>h)return false;for(let yy=Math.floor(y+.00001);yy<Math.ceil(y+physics.height-.00001);yy++)for(let xx=Math.floor(x+.00001);xx<Math.ceil(x+physics.width-.00001);xx++)if(solid.has(xx+':'+yy))return false;return true;};
  const grounded=(x,y)=>fits(x,y)&&!fits(x,y+.08),onLadder=(x,y)=>{for(let yy=y;yy<y+physics.height;yy++)for(let xx=x;xx<x+physics.width;xx++)if(ladder.has(xx+':'+yy))return true;return false;};
  return{w,h,solid,ladder,fits,grounded,onLadder,physics};
}
function jump(m,start,vx){
  const p=m.physics,dt=.025;let x=start.x,y=start.y,vy=-p.jumpSpeed;const path=[{x,y}];
  for(let step=0;step<220;step++){
    const nx=x+vx*dt,ny=y+vy*dt+.5*p.gravity*dt*dt;vy+=p.gravity*dt;
    if(!m.fits(nx,y))return null;
    if(!m.fits(nx,ny)){
      if(vy>0){const yy=Math.floor(ny+p.height+.00001)-p.height,xx=Math.round(nx);if(Math.abs(xx-nx)<=.46&&m.grounded(xx,yy)&&m.fits(xx,y)){path.push({x:xx,y:yy});return{to:{x:xx,y:yy},type:'jump',trajectory:path,duration:Math.round((step+1)*dt*1000)};}}return null;
    }
    x=nx;y=ny;path.push({x:Math.round(x*1000)/1000,y:Math.round(y*1000)/1000});if(y>m.h)return null;
  }return null;
}
export function analyzePlatformer(map,physics=map.request.physics){
  const cleanPhysics=normalizePlatformerRequest({...map.request,physics}).physics,m=model(map,cleanPhysics),q=[map.spawn],seen=new Set([key(map.spawn)]),previous=new Map(),edges=[],p=m.physics;
  if(!m.grounded(map.spawn.x,map.spawn.y)&&!m.onLadder(map.spawn.x,map.spawn.y))return{ok:false,reachable:false,path:null,reachableRooms:[],positions:0,note:'Старт не имеет опоры.'};
  for(let k=0;k<q.length;k++){
    const a=q[k],next=[];
    for(const dx of [-1,1]){const b={x:a.x+dx,y:a.y};if(m.grounded(b.x,b.y)||m.onLadder(b.x,b.y)&&m.fits(b.x,b.y))next.push({to:b,type:'walk',duration:Math.round(1000/p.speed)});}
    if(m.onLadder(a.x,a.y))for(const dy of [-1,1]){const b={x:a.x,y:a.y+dy};if(m.fits(b.x,b.y)&&(m.onLadder(b.x,b.y)||m.grounded(b.x,b.y)))next.push({to:b,type:'climb',duration:Math.round(1000/p.climbSpeed)});}
    if(m.grounded(a.x,a.y))for(const factor of [-1,-.65,-.35,.35,.65,1]){const edge=jump(m,a,p.speed*factor);if(edge&&key(edge.to)!==key(a))next.push(edge);}
    for(const edge of next){if(!m.fits(edge.to.x,edge.to.y))continue;edges.push({from:a,...edge});const id=key(edge.to);if(seen.has(id))continue;seen.add(id);previous.set(id,{from:a,...edge});q.push(edge.to);}
  }
  let path=null;if(seen.has(key(map.exit))){const segments=[];for(let at=map.exit;key(at)!==key(map.spawn);){const edge=previous.get(key(at));if(!edge)break;segments.push(edge);at=edge.from;}path={segments:segments.reverse(),steps:segments.length};}
  const reachableRooms=map.rooms.filter(r=>q.some(p=>p.x>=r.x&&p.y>=r.y&&p.x<r.x+r.width&&p.y<r.y+r.height)).map(r=>r.id);
  return{ok:!!path&&reachableRooms.length===map.rooms.length,reachable:!!path,path,reachableRooms,positions:q.length,physics:{...p},jumpHeight:p.jumpSpeed**2/(2*p.gravity),jumpRange:2*p.speed*p.jumpSpeed/p.gravity,note:'Проверена дискретная баллистика тела с шагом25мс, опора и лестницы. Движок должен согласовать физику; это не гарантия для другой скорости/коллизии.'};
}
export function generatePlatformer(input){
  const r=normalizePlatformerRequest(input),seed=deriveStageSeed(r.seed,'platformer','geometry',PLATFORMER_VERSION),mainCount=Math.max(1,r.rooms-Math.round((r.rooms-1)*(r.preset==='vertical'?.65:r.branches))),rooms=[],connectors=[];
  const rand=(k,a,b)=>a+Math.floor(hash2(seed,k,3)*(b-a+1)),upperMax=r.roomHeight.max,baseline=upperMax+r.roomHeight.max+8;let cursor=2;
  for(let k=0;k<mainCount;k++){const width=rand(k,r.roomWidth.min,r.roomWidth.max),height=rand(k+80,r.roomHeight.min,r.roomHeight.max),room={id:'room-'+(k+1),x:cursor,y:baseline-height,width,height,role:k===0?'start':k===mainCount-1?'exit':'traverse'};if(k){const prev=rooms.at(-1);connectors.push({id:'door-'+k,kind:'passage',length:cursor-(prev.x+prev.width),from:prev.id,to:room.id,x:prev.x+prev.width,y:baseline-r.physics.height,width:cursor-prev.x-prev.width,height:r.physics.height});}rooms.push(room);cursor+=width+rand(k+140,1,3);}
  for(let k=mainCount;k<r.rooms;k++){
    const parent=rooms[k-mainCount],gap=rand(k+300,1,3),height=rand(k+200,r.roomHeight.min,r.roomHeight.max),width=Math.max(r.roomWidth.min,parent.width-2),x=parent.x+Math.floor((parent.width-width)/2),y=parent.y-gap-height;
    const room={id:'room-'+(k+1),x,y,width,height,role:'reward'};rooms.push(room);connectors.push({id:'shaft-'+k,kind:'ladder',length:gap,from:parent.id,to:room.id,x:x+Math.floor(width/2),y:y+height-1,width:r.physics.width,height:parent.y-(y+height)+3});
  }
  const minY=Math.min(...rooms.map(r=>r.y));for(const room of rooms)room.y+=2-minY;for(const c of connectors)c.y+=2-minY;
  const width=Math.max(cursor+1,...rooms.map(r=>r.x+r.width+2)),height=Math.max(...rooms.map(r=>r.y+r.height))+3,n=width*height;if(n>100000)throw new LabError('PLATFORMER_TOO_LARGE','Платформер превышает100000 клеток.');const solid=new Uint8Array(n).fill(1),platforms=[],ladderSet=new Set();
  for(const room of rooms){for(let y=room.y;y<room.y+room.height;y++)for(let x=room.x;x<room.x+room.width;x++)solid[y*width+x]=0;
    const base=room.y+room.height;if(hash2(seed,room.x,40)<r.platforms){const px=room.x+3,py=base-4;for(let x=px;x<Math.min(px+4,room.x+room.width-2);x++)solid[py*width+x]=1;platforms.push({x:px,y:py,width:4,height:1});}
    if(room.role!=='reward'&&hash2(seed,room.x,70)<r.gaps&&r.physics.speed*2*r.physics.jumpSpeed/r.physics.gravity>=3.5){const gapX=room.x+Math.floor(room.width/2);for(let y=base;y<height-1;y++)for(let dx=0;dx<2;dx++)solid[y*width+gapX+dx]=0;}
  }
  for(const c of connectors)if(c.kind==='passage'){for(let y=c.y;y<c.y+c.height;y++)for(let x=c.x;x<c.x+c.width;x++)solid[y*width+x]=0;}else{
    const upper=rooms.find(r=>r.id===c.to),lower=rooms.find(r=>r.id===c.from),bottom=lower.y+lower.height-r.physics.height;
    for(let y=upper.y+upper.height-r.physics.height;y<=bottom;y++)for(let dx=0;dx<r.physics.width;dx++){solid[y*width+c.x+dx]=0;ladderSet.add((c.x+dx)+':'+y);}
  }
  // Side ledges have explicit ladder access. They also offer a higher takeoff
  // instead of forcing a jump into their underside beside a floor gap.
  for(const platform of platforms)for(let y=platform.y-r.physics.height;y<=platform.y+4-r.physics.height;y++)for(let dx=0;dx<r.physics.width;dx++){solid[y*width+platform.x+dx]=0;ladderSet.add((platform.x+dx)+':'+y);}
  const first=rooms[0],last=rooms[mainCount-1],map={schema:'vland.platformer',schemaVersion:1,apiVersion:API_VERSION,generatorVersion:GENERATOR_VERSION,platformerVersion:PLATFORMER_VERSION,seed:r.seed,request:r,board:{width,height,walls:[]},rooms,connectors,platforms,ladders:[...ladderSet].map(k=>{const[x,y]=k.split(':').map(Number);return{x,y};}),spawn:{x:first.x+1,y:first.y+first.height-r.physics.height},exit:{x:last.x+last.width-r.physics.width-1,y:last.y+last.height-r.physics.height},sites:rooms.filter(r=>r.role==='reward').map(room=>({id:room.id+'-reward',kind:'reward',roomId:room.id,position:{x:room.x+1,y:room.y+room.height-r.physics.height}}))};
  for(let i=0;i<n;i++)if(solid[i])map.board.walls.push({x:i%width,y:Math.floor(i/width),type:'rock'});
  map.analysis=analyzePlatformer(map);if(!map.analysis.ok)throw new LabError('PLATFORMER_UNREACHABLE','Указанная физика не проходит эту геометрию; увеличьте прыжок/скорость или уменьшите gaps.',{reachableRooms:map.analysis.reachableRooms,rooms:rooms.length});map.fingerprint=platformerFingerprint(map);return map;
}
export const platformerFingerprint=map=>fingerprint({...map,analysis:undefined,fingerprint:undefined});
export function validatePlatformer(map){try{const r=normalizePlatformerRequest(map?.request);if(map.schema!=='vland.platformer'||map.schemaVersion!==1||map.platformerVersion!==PLATFORMER_VERSION||map.seed!==r.seed||![map.board?.width,map.board?.height].every(n=>Number.isInteger(n)&&n>=1&&n<=4096)||map.board.width*map.board.height>100000||!Array.isArray(map.rooms)||map.rooms.length!==r.rooms||new Set(map.rooms.map(r=>r.id)).size!==map.rooms.length||map.rooms.some(room=>![room.x,room.y,room.width,room.height].every(Number.isInteger)||room.x<0||room.y<0||room.x+room.width>map.board.width||room.y+room.height>map.board.height||room.width<r.roomWidth.min||room.width>r.roomWidth.max||room.height<r.roomHeight.min||room.height>r.roomHeight.max))throw new Error('Неверный snapshot платформера.');
  for(const list of [map.board.walls,map.ladders])if(!Array.isArray(list)||list.some(p=>!Number.isInteger(p.x)||!Number.isInteger(p.y)||p.x<0||p.y<0||p.x>=map.board.width||p.y>=map.board.height)||new Set(list.map(key)).size!==list.length)throw new Error('Неверная геометрия.');
  if(!Array.isArray(map.connectors)||map.connectors.length!==r.rooms-1||map.connectors.some(c=>!['passage','ladder'].includes(c.kind)||!Number.isInteger(c.length)||c.length<1||c.length>3||![c.from,c.to].every(id=>map.rooms.some(r=>r.id===id))))throw new Error('Проходы должны иметь длину1–3.');
  if(map.fingerprint!==platformerFingerprint(map))throw new Error('Отпечаток не совпадает.');const a=analyzePlatformer(map);if(!a.ok)throw new Error('Нет маршрута с заданной физикой.');return{ok:true,errors:[],rooms:r.rooms,positions:a.positions};}catch(e){return{ok:false,errors:[e.message],code:'INVALID_PLATFORMER'};}}
export function exportPlatformerTiles(map){const w=map.board.width,h=map.board.height,solid=new Array(w*h).fill(0);for(const p of map.board.walls)solid[p.y*w+p.x]=1;return{schema:'vland.platformer.tiles',schemaVersion:1,sourceFingerprint:map.fingerprint,width:w,height:h,solid,ladders:structuredClone(map.ladders),spawn:structuredClone(map.spawn),exit:structuredClone(map.exit),physics:structuredClone(map.request.physics),rooms:structuredClone(map.rooms),connectors:structuredClone(map.connectors),sites:structuredClone(map.sites)};}
