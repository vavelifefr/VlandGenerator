import {DIRECTIONS,pointKey as key} from './random.mjs';
export const ROOM_TEMPLATES=Object.freeze({
 scattered:{name:'Свободное размещение укрытий',minSize:8},
 colonnade:{name:'Колонный зал',minSize:12},
 pool:{name:'Центральный квадратный бассейн',minSize:12},
 lake:{name:'Центральное озеро',minSize:14},
 mazeEasy:{name:'Лёгкий лабиринт',minSize:12},
 mazeHard:{name:'Сложный лабиринт',minSize:14}
});
export const DEFAULT_TEMPLATE_WEIGHTS=Object.freeze({scattered:6,colonnade:2,pool:1,lake:1,mazeEasy:1,mazeHard:1});
export function templateWeights(value){
 if(value===undefined)return undefined;
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(id=>!Object.hasOwn(ROOM_TEMPLATES,id))||Object.values(value).some(n=>!Number.isFinite(n)||n<0||n>100)||!Object.values(value).some(n=>n>0))throw new Error('Веса шаблонов: известные имена, значения 0–100, хотя бы один положительный вес.');
 return value;
}
function path(floor,from,goals){
 const queue=[from],previous=new Map([[key(from),null]]);
 if(!floor.has(key(from)))return null;
 for(let i=0;i<queue.length;i++){
  const p=queue[i];if(goals.has(key(p))){const result=[];for(let q=p;q;q=previous.get(key(q)))result.push(q);return result.reverse();}
  for(const[dx,dy]of DIRECTIONS){const q={x:p.x+dx,y:p.y+dy},k=key(q);if(floor.has(k)&&!previous.has(k)){previous.set(k,p);queue.push(q);}}
 }return null;
}
function connected(floor,from){
 const seen=new Set([key(from)]),queue=[from];
 for(let i=0;i<queue.length;i++)for(const[dx,dy]of DIRECTIONS){const q={x:queue[i].x+dx,y:queue[i].y+dy},k=key(q);if(floor.has(k)&&!seen.has(k)){seen.add(k);queue.push(q);}}
 return seen.size===floor.size;
}
export function classifyRoomSize(area,{roomMin=10,roomMax=16,roomAreaMin,roomAreaMax}={}){
 const minArea=roomAreaMin??(roomMin-2)**2,maxArea=roomAreaMax??(roomMax-2)**2,lo=Math.min(minArea,maxArea),mediumFrom=Math.ceil(lo+(maxArea-lo)/3),largeFrom=Math.ceil(lo+2*(maxArea-lo)/3);
 const fixed=roomMin===roomMax&&roomAreaMin===undefined&&roomAreaMax===undefined;
 return{area,minArea:lo,maxArea,mediumFrom,largeFrom,category:fixed&&area<=maxArea?'medium':area<mediumFrom?'small':area<largeFrom?'medium':'large'};
}
export function applyRoomTemplate(room,{footprint,walls,random,weights,destructibleRatio=.6,...sizeOptions}){
 if(!weights||['start','final','boss'].includes(room.purpose))return null;
 const size=classifyRoomSize(footprint.size,sizeOptions),eligible=Object.keys(ROOM_TEMPLATES).filter(id=>(weights[id]??0)>0&&Math.min(room.width,room.height)>=ROOM_TEMPLATES[id].minSize&&(!id.startsWith('maze')||size.category!=='small'));
 if(!eligible.length)return{template:{type:'scattered',requested:null,reason:Object.keys(weights).some(id=>id.startsWith('maze')&&weights[id]>0)&&size.category==='small'?`Лабиринты только в средних/крупных комнатах: площадь ${footprint.size}, средняя от ${size.mediumFrom}.`:'Размер меньше порога разрешённых шаблонов.'},features:[]};
 let roll=random()*eligible.reduce((n,id)=>n+weights[id],0),type=eligible.at(-1);for(const id of eligible){roll-=weights[id];if(roll<0){type=id;break;}}
 if(type==='scattered')return{template:{type},features:[]};
 const points=[...footprint].map(k=>{const[x,y]=k.split(':').map(Number);return{x,y};}),features=[];
 const fallback=reason=>({template:{type:'scattered',requested:type,reason},features:[]});
 const addFeature=(cells,kind,material)=>{
  const id=`template-${room.id}-${features.length+1}`;
  for(const p of cells)walls.set(key(p),{...p,type:material,featureId:id});
  features.push({id,roomId:room.id,kind,material,destructible:material==='internal',cells});
 };
 if(type==='pool'||type==='lake'){
  const square=Math.max(3,Math.floor(Math.min(room.width,room.height)*.38)),left=room.x+1+Math.floor((room.width-2-square)/2),top=room.y+1+Math.floor((room.height-2-square)/2),cx=type==='pool'?left+(square-1)/2:room.x+(room.width-1)/2,cy=type==='pool'?top+(square-1)/2:room.y+(room.height-1)/2;
  const rx=type==='pool'?square/2:Math.max(2,(room.width-4)*.27),ry=type==='pool'?square/2:random()<.5?Math.min(rx,(room.height-4)*.27):Math.max(2,(room.height-4)*.27);
  const cells=[];for(let y=room.y+1;y<room.y+room.height-1;y++)for(let x=room.x+1;x<room.x+room.width-1;x++)if(type==='pool'?x>=left&&x<left+square&&y>=top&&y<top+square:((x-cx)/rx)**2+((y-cy)/ry)**2<=1)cells.push({x,y});
  if(cells.length<9||cells.some(p=>!footprint.has(key(p))||room.doors.some(d=>Math.abs(p.x-d.inside.x)+Math.abs(p.y-d.inside.y)<=1)))return fallback('Центральной области не хватает места с сухими подходами.');
  return{template:{type,shape:type==='pool'?'square':Math.abs(rx-ry)<.1?'circle':'ellipse',geometry:{centerX:cx,centerY:cy,radiusX:rx,radiusY:ry,...(type==='pool'?{side:square,left,top}:{})},cells,medium:'water',blocksMovement:false},features:[]};
 }
 if(type==='colonnade'){
  const w=room.width-2,h=room.height-2,grids=[];
  for(const pitch of [4,5,3])for(let cols=2;cols<=8;cols++)for(let rows=2;rows<=8;rows++){
   const mx=(w-1-(cols-1)*pitch)/2,my=(h-1-(rows-1)*pitch)/2;
   if(!Number.isInteger(mx)||!Number.isInteger(my)||mx<2||my<2)continue;
   const cells=Array.from({length:rows},(_,j)=>Array.from({length:cols},(_,i)=>({x:room.x+1+mx+i*pitch,y:room.y+1+my+j*pitch}))).flat();
   if(cells.some(p=>!footprint.has(key(p))||room.doors.some(d=>Math.abs(p.x-d.inside.x)+Math.abs(p.y-d.inside.y)<=1)))continue;
   const free=new Set([...footprint].filter(k=>!cells.some(p=>key(p)===k))),cores=points.filter(p=>[-1,0,1].every(dy=>[-1,0,1].every(dx=>free.has((p.x+dx)+':'+(p.y+dy))))).sort((a,b)=>Math.abs(a.x-room.core.x)+Math.abs(a.y-room.core.y)-Math.abs(b.x-room.core.x)-Math.abs(b.y-room.core.y));
   if(cores.length&&connected(free,cores[0]))grids.push({cells,cols,rows,pitch,marginX:mx,marginY:my,core:cores[0]});
  }
  if(!grids.length)return fallback('Контур или входы не вмещают симметричную решётку колонн.');
  const grid=grids.sort((a,b)=>b.cells.length-a.cells.length||b.pitch-a.pitch)[0];room.core={...grid.core};
  for(const p of grid.cells)addFeature([p],'column',random()<destructibleRatio?'internal':'bedrock');
  return{template:{type,columns:grid.cols,rows:grid.rows,pitchX:grid.pitch,pitchY:grid.pitch,marginX:grid.marginX,marginY:grid.marginY,pillarSize:1},features};
 }
 // A seeded depth-first maze, then explicit connections to every existing door
 // and a 3×3 staging pocket. The surviving floor is checked as one component.
 const carved=new Set(),centres=points.filter(p=>(p.x-room.x)%2===0&&(p.y-room.y)%2===0),centreKeys=new Set(centres.map(key)),seen=new Set();
 const carve=p=>{if(footprint.has(key(p)))carved.add(key(p));};
 for(const start of centres){
  if(seen.has(key(start)))continue;const stack=[start];seen.add(key(start));carve(start);
  while(stack.length){const p=stack.at(-1),choices=DIRECTIONS.map(([dx,dy])=>({x:p.x+dx*2,y:p.y+dy*2,mid:{x:p.x+dx,y:p.y+dy}})).filter(q=>centreKeys.has(key(q))&&!seen.has(key(q))&&footprint.has(key(q.mid)));
   if(!choices.length){stack.pop();continue;}const q=choices[Math.floor(random()*choices.length)];carve(q.mid);carve(q);seen.add(key(q));stack.push({x:q.x,y:q.y});
  }
 }
 if(!carved.size)return fallback('Не помещается решётка лабиринта.');
 // Join any mask-induced maze components through the original connected floor.
 let joined=new Set([key(centres[0])]),queue=[centres[0]];
 const flood=()=>{for(let i=0;i<queue.length;i++)for(const[dx,dy]of DIRECTIONS){const p={x:queue[i].x+dx,y:queue[i].y+dy},k=key(p);if(carved.has(k)&&!joined.has(k)){joined.add(k);queue.push(p);}}};flood();
 for(const p of points)if(carved.has(key(p))&&!joined.has(key(p))){const link=path(footprint,p,joined);for(const q of link??[])carve(q);joined.add(key(p));queue.push(p);flood();}
 for(const p of [room.core,...room.doors.map(d=>d.inside)]){const link=path(footprint,p,carved);for(const q of link??[])carve(q);}
 for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)carve({x:room.core.x+dx,y:room.core.y+dy});
 if(type==='mazeEasy')for(const p of points)if(!carved.has(key(p))&&DIRECTIONS.filter(([dx,dy])=>carved.has((p.x+dx)+':'+(p.y+dy))).length>=2&&random()<.4)carve(p);
 if(!connected(carved,room.core))return fallback('Не удалось соединить карманы лабиринта.');
 const obstacles=points.filter(p=>!carved.has(key(p)));
 for(const material of ['bedrock','internal']){
  const cells=obstacles.filter(p=>(p.material??=(random()<destructibleRatio?'internal':'bedrock'))===material).map(({x,y})=>({x,y}));
  for(let i=0;i<cells.length;i+=256)addFeature(cells.slice(i,i+256),'maze-wall',material);
 }
 const degree=p=>DIRECTIONS.filter(([dx,dy])=>carved.has((p.x+dx)+':'+(p.y+dy))).length;
 return{template:{type,difficulty:type==='mazeHard'?'hard':'easy',algorithm:'seeded-depth-first',passageCells:carved.size,deadEnds:points.filter(p=>carved.has(key(p))&&degree(p)===1).length,junctions:points.filter(p=>carved.has(key(p))&&degree(p)>2).length,solved:true},features};
}
export function templateErrors(level){
 const errors=[],walls=new Set(level.board.walls.map(key));
 for(const room of level.rooms){const t=room.interiorTemplate;if(!t)continue;if(!Object.hasOwn(ROOM_TEMPLATES,t.type)){errors.push('Неизвестный шаблон комнаты.');continue;}
  if(['pool','lake'].includes(t.type)&&(!Array.isArray(t.cells)||t.cells.length<9||t.cells.some(p=>!room.floorTiles.some(q=>key(q)===key(p))||walls.has(key(p)))))errors.push('Бассейн/озеро выходит за проходимый пол.');
  if(t.type==='pool'&&t.geometry){const g=t.geometry;if(t.shape!=='square'||!Number.isInteger(g.side)||g.side<3||!Number.isInteger(g.left)||!Number.isInteger(g.top)||t.cells.length!==g.side*g.side||new Set(t.cells.map(key)).size!==t.cells.length||t.cells.some(p=>p.x<g.left||p.x>=g.left+g.side||p.y<g.top||p.y>=g.top+g.side))errors.push('Бассейн должен быть полным квадратом.');}
  if(t.type.startsWith('maze')&&classifyRoomSize(room.floorArea,level.options).category==='small')errors.push('Лабиринт размещён в маленькой комнате.');
  if(t.type==='colonnade'){
   const columns=level.features.filter(f=>f.roomId===room.id&&f.kind==='column').flatMap(f=>f.cells),xs=[...new Set(columns.map(p=>p.x))].sort((a,b)=>a-b),ys=[...new Set(columns.map(p=>p.y))].sort((a,b)=>a-b);
   if(xs.length!==t.columns||ys.length!==t.rows||columns.length!==t.columns*t.rows||xs.slice(1).some((x,i)=>x-xs[i]!==t.pitchX)||ys.slice(1).some((y,i)=>y-ys[i]!==t.pitchY)||xs[0]-room.x-1!==room.x+room.width-2-xs.at(-1)||ys[0]-room.y-1!==room.y+room.height-2-ys.at(-1))errors.push('Колонны не образуют симметричную равномерную решётку.');
  }
 }return errors;
}
