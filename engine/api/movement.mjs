import {gridNeighbors,gridDistance} from '../core/topology.mjs';
import {transportNeighbors} from '../core/transports.mjs';
import {LabError} from './config.mjs';
import {collisionWalls} from './navigation.mjs';
import {createContentState} from './content-runtime.mjs';
const key=p=>p.x+':'+p.y,dirs=[[0,-1],[1,0],[0,1],[-1,0]];
const make=(id,width,height,mode,capabilities=[])=>Object.freeze({id,width,height,mode,capabilities:Object.freeze(capabilities),bodyHeight:id==='large'?2.8:id==='flyer'?.8:1.8,maxStep:.18,maxWaterDepth:.12});
export const MOVEMENT_PROFILES=Object.freeze({walker:make('walker',1,1,'ground'),large:make('large',3,3,'ground'),flyer:make('flyer',1,1,'flying',['flight']),swimmer:make('swimmer',1,1,'swimming',['swim'])});
export function movementProfile(input='walker'){
 if(typeof input==='string'){if(!Object.hasOwn(MOVEMENT_PROFILES,input))throw new LabError('INVALID_PROFILE','Неизвестный профиль движения.');input=MOVEMENT_PROFILES[input];}
 if(!input||typeof input!=='object'||Array.isArray(input))throw new LabError('INVALID_PROFILE','Профиль движения должен быть объектом или именем.');
 const allowed=['id','width','height','mode','capabilities','maxStep','maxWaterDepth','bodyHeight'];for(const k of Object.keys(input))if(!allowed.includes(k))throw new LabError('INVALID_PROFILE','Неизвестное поле профиля '+k);
 const p={id:'custom',width:1,height:1,mode:'ground',capabilities:[],bodyHeight:1.8,maxStep:.18,maxWaterDepth:.12,...input};
 if(typeof p.id!=='string'||!p.id.length||p.id.length>64||![p.width,p.height].every(n=>Number.isInteger(n)&&n>=1&&n<=8)||!Number.isFinite(p.bodyHeight)||p.bodyHeight<=0||p.bodyHeight>8||!['ground','flying','swimming'].includes(p.mode)||![p.maxStep,p.maxWaterDepth].every(n=>Number.isFinite(n)&&n>=0&&n<=1)||!Array.isArray(p.capabilities)||p.capabilities.length>64||p.capabilities.some(c=>typeof c!=='string'||!/^[a-z][a-z0-9-]{0,31}$/.test(c)))throw new LabError('INVALID_PROFILE','Неверные размер1–8, высота тела0–8, режим, способности или ограничения уступа/воды0–1.');
 return{...p,capabilities:[...new Set(p.capabilities)]};
}
function heap(){const q=[];return{push(item){q.push(item);let i=q.length-1;while(i){const p=(i-1)>>1;if(q[p].cost<=item.cost)break;q[i]=q[p];i=p;}q[i]=item;},pop(){if(!q.length)return null;const first=q[0],last=q.pop();if(q.length){let i=0;while(i*2+1<q.length){let c=i*2+1;if(c+1<q.length&&q[c+1].cost<q[c].cost)c++;if(q[c].cost>=last.cost)break;q[i]=q[c];i=c;}q[i]=last;}return first;},get length(){return q.length;}};}
export function createMovementField(value,input='walker',state={}){
 const profile=movementProfile(input),terrain=['vland.terrain','vland.atlas.layer'].includes(value.schema),level=value.level??value,board=level.board;
 if(!board||!Number.isInteger(board.width)||!Number.isInteger(board.height)||board.width<1||board.height<1||board.width*board.height>250000||!Array.isArray(board.walls))throw new LabError('INVALID_MAP','Неверное поле для навигации.');
 if(!state||typeof state!=='object'||Array.isArray(state)||state.blockedCells!==undefined&&(!Array.isArray(state.blockedCells)||state.blockedCells.length>board.width*board.height||state.blockedCells.some(p=>!Number.isInteger(p?.x)||!Number.isInteger(p?.y)||p.x<0||p.y<0||p.x>=board.width||p.y>=board.height)))throw new LabError('INVALID_STATE','Динамические препятствия должны быть клетками внутри карты.');
 const {width,height}=board,n=width*height,physical=new Set(board.walls.map(key));let walls;
 if(terrain){walls=new Set(physical);for(const p of state.blockedCells??[])walls.add(key(p));}
 else{
  const capabilities=[...profile.capabilities,...(state.content?.capabilities??[])];if(profile.mode==='swimming')capabilities.push('swim');
  const content=state.content?{...state.content,capabilities:[...new Set(capabilities)]}:createContentState(value,{capabilities:[...new Set(capabilities)]});
  walls=collisionWalls(value,{...state,content});
  if(profile.mode==='flying'){
   const fixed=new Set([...physical,...(state.blockedCells??[]).map(key),...(value.content?.setpieces?.zones??[]).filter(z=>z.type!=='flood'&&z.blocksMovement&&!content.flags[z.requiredFlag]&&!capabilities.includes(z.bypassCapability)).flatMap(z=>z.cells).map(key)]);
   for(const p of (value.content?.setpieces?.zones??[]).filter(z=>z.type==='flood').flatMap(z=>z.cells))if(!fixed.has(key(p)))walls.delete(key(p));
  }
 }
 const blocked=new Uint8Array(n),costs=new Float64Array(n).fill(1),elevation=terrain?value.fields.elevation:null;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=y*width+x;blocked[i]=walls.has(x+':'+y)?1:0;
  if(terrain&&profile.mode==='ground'&&(value.fields.waterDepth[i]??0)>profile.maxWaterDepth&&!value.fields.bridge?.[i]&&!value.fields.frozen?.[i])blocked[i]=1;
  if(value.schema==='vland.atlas.layer'){
   if((value.fields.ceiling?.[i]??8)<profile.bodyHeight||profile.mode!=='flying'&&!value.fields.support[i])blocked[i]=1;
   if(profile.mode!=='flying'&&value.fields.waterType[i]==='lava'&&!value.fields.bridge[i]&&!profile.capabilities.includes('heat-resistant'))blocked[i]=1;
  }
  if(terrain&&profile.mode==='swimming'&&(value.fields.waterDepth[i]??0)<=0)costs[i]=1.5;
 }
 if(!terrain)for(const medium of value.content?.environment?.media??[])for(const p of medium.cells){const i=p.y*width+p.x;if(profile.mode==='ground'||medium.layer==='gas')costs[i]=Math.max(costs[i],{water:1.5,oil:2,poison:4,fog:1,'poison-gas':3}[medium.type]??1);}
 const prefix=new Int32Array((width+1)*(height+1)),pitch=width+1;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)prefix[(y+1)*pitch+x+1]=blocked[y*width+x]+prefix[y*pitch+x+1]+prefix[(y+1)*pitch+x]-prefix[y*pitch+x];
 const clearance=new Int32Array(n).fill(-1),queue=[];
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=y*width+x;if(blocked[i]){clearance[i]=0;queue.push(i);}else if(x===0||y===0||x===width-1||y===height-1){clearance[i]=1;queue.push(i);}}
 for(let q=0;q<queue.length;q++){const i=queue[q],x=i%width,y=(i/width)|0;for(const j of gridNeighbors(i,width,height,value.topology)){if(clearance[j]<0||clearance[j]>clearance[i]+1){clearance[j]=clearance[i]+1;queue.push(j);}}}
 const cellCosts=costs.slice(),passable=new Uint8Array(n);for(let y=0;y+profile.height<=height;y++)for(let x=0;x+profile.width<=width;x++){
  const xx=x+profile.width,yy=y+profile.height,count=prefix[yy*pitch+xx]-prefix[y*pitch+xx]-prefix[yy*pitch+x]+prefix[y*pitch+x];if(!count){let cost=1,lo=Infinity,hi=-Infinity;for(let dy=0;dy<profile.height;dy++)for(let dx=0;dx<profile.width;dx++){const j=(y+dy)*width+x+dx;cost=Math.max(cost,cellCosts[j]);if(elevation){lo=Math.min(lo,elevation[j]);hi=Math.max(hi,elevation[j]);}}costs[y*width+x]=cost;if(!elevation||profile.mode==='flying'||hi-lo<=profile.maxStep)passable[y*width+x]=1;}
 }
 return{version:1,width,height,topology:value.topology??{kind:'square'},profile,passable:Array.from(passable),clearance:Array.from(clearance),costs:Array.from(costs),...(elevation?{elevation:[...elevation]}:{})};
}
export function movementFits(field,p){return Number.isInteger(p?.x)&&Number.isInteger(p?.y)&&p.x>=0&&p.y>=0&&p.x<field.width&&p.y<field.height&&field.passable[p.y*field.width+p.x]===1;}
export function canMovementStep(field,a,b){return adjacentMovementFits(field,a,b)&&gridDistance(a,b,field.topology)===1;}
function adjacentMovementFits(field,a,b){
 if(!movementFits(field,a)||!movementFits(field,b))return false;if(!field.elevation||field.profile.mode==='flying')return true;
 const w=field.width,p=field.profile;for(let y=0;y<p.height;y++)for(let x=0;x<p.width;x++)if(Math.abs(field.elevation[(a.y+y)*w+a.x+x]-field.elevation[(b.y+y)*w+b.x+x])>p.maxStep)return false;return true;
}
export function findMovementPath(value,from,to,input='walker',state={},field=createMovementField(value,input,state)){
 if(!movementFits(field,from)||!movementFits(field,to))return null;
 const {width,height}=field,start=from.y*width+from.x,end=to.y*width+to.x,dist=new Float64Array(width*height).fill(Infinity),previous=new Int32Array(width*height).fill(-1),q=heap();dist[start]=0;q.push({id:start,cost:0});
 while(q.length){const current=q.pop();if(current.cost!==dist[current.id])continue;if(current.id===end){const cells=[];for(let i=end;i!==-1;i=previous[i])cells.push({x:i%width,y:(i/width)|0});return cells.reverse();}const a={x:current.id%width,y:(current.id/width)|0};
  const adjacent=gridNeighbors(current.id,width,height,field.topology);for(const b of [...adjacent.map(i=>({x:i%width,y:Math.floor(i/width)})),...transportNeighbors(value.level??value,a)]){if(adjacent.includes(b.y*width+b.x)?!adjacentMovementFits(field,a,b):!movementFits(field,b))continue;const id=b.y*width+b.x,cost=current.cost+field.costs[id];if(cost<dist[id]){dist[id]=cost;previous[id]=current.id;q.push({id,cost});}}
 }return null;
}
export function analyzeMovement(value,input='walker',state={}){
 const field=createMovementField(value,input,state),level=value.level??value,exit=['vland.terrain','vland.atlas.layer'].includes(value.schema)?value.exit:level.rooms.find(r=>r.id===level.plan.finalId).core,path=findMovementPath(value,level.spawn,exit,input,state,field);
 return{version:1,profile:field.profile,legalAnchors:field.passable.reduce((n,x)=>n+x,0),spawnFits:movementFits(field,level.spawn),exitFits:movementFits(field,exit),reachable:!!path,pathLength:path?path.length-1:null,path, note:'Проверка клеток и габарита; прыжки, navmesh и реальная физика остаются адаптеру. Узкие двери могут быть недоступны крупному существу.'};
}
