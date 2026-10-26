import {roomEnvelopesOverlap} from './space.mjs';
import {standardPortPairs} from './ports.mjs';
export function nestRooms(rooms,plan,{random,roomMin=10,shapeWeights,interlocking=true,anchorIds=[],accept=()=>true}={}){
 if(typeof interlocking!=='boolean')throw new Error('interlocking должен быть boolean.');
 const nests=[];if(!interlocking||(shapeWeights?.L??2)<=0)return nests;
 const byId=new Map(rooms.map(r=>[r.id,r])),nodes=new Map(plan.nodes.map(n=>[n.id,n])),degree=id=>plan.edges.filter(e=>e.from===id||e.to===id).length;
 const forbidden=r=>[plan.startId,plan.finalId,plan.bossId].includes(r.id)||['start','final','boss'].includes(r.purpose)||r.notch||r.nestedIn;
 const candidates=plan.edges.flatMap(e=>[[e.from,e.to],[e.to,e.from]].filter(([child,parent])=>degree(child)===1&&!forbidden(byId.get(child))&&!forbidden(byId.get(parent))).map(([child,parent])=>({edge:e,child:byId.get(child),host:byId.get(parent),score:(anchorIds.includes(parent)?10:0)+(byId.get(parent).largeHall?5:0)+(byId.get(parent).composition?.id===byId.get(child).composition?.id?2:0)+random()}))).sort((a,b)=>b.score-a.score);
 for(const candidate of candidates){
  const {edge,child,host}=candidate;if(forbidden(child)||forbidden(host)||child.largeHall)continue;
  const original={x:child.x,y:child.y,width:child.width,height:child.height,core:{...child.core}},corners=['NW','NE','SW','SE'].map(corner=>({corner,score:random()})).sort((a,b)=>a.score-b.score);
  let accepted=false;
  search:for(const {corner}of corners)for(const gap of [1,2,3]){
   const maxW=Math.min(original.width,host.width-gap-7),maxH=Math.min(original.height,host.height-gap-7);if(maxW<roomMin||maxH<roomMin)continue;
   const width=roomMin+Math.floor(random()*(Math.min(maxW,roomMin+3)-roomMin+1)),height=roomMin+Math.floor(random()*(Math.min(maxH,roomMin+3)-roomMin+1)),cutW=width+gap+2,cutH=height+gap+2,west=corner.endsWith('W'),north=corner.startsWith('N');
   const notch={x:west?host.x:host.x+host.width-cutW,y:north?host.y:host.y+host.height-cutH,width:cutW,height:cutH,corner,childId:child.id};
   Object.assign(child,{x:west?host.x+1:host.x+host.width-width-1,y:north?host.y+1:host.y+host.height-height-1,width,height});child.core={x:child.x+Math.floor(width/2),y:child.y+Math.floor(height/2)};host.notch=notch;
   const collision=rooms.some(r=>r!==child&&r!==host&&roomEnvelopesOverlap(child,r))||roomEnvelopesOverlap(host,child);
   const blockedPort=plan.edges.some(e=>e.id!==edge.id&&(e.from===host.id||e.to===host.id)&&!standardPortPairs(byId.get(e.from),byId.get(e.to),nodes.get(e.from),nodes.get(e.to)).length);
   if(collision||blockedPort||!accept(host,child)){Object.assign(child,original);delete host.notch;continue;}
   child.nestedIn=host.id;host.core={x:host.x+Math.floor(host.width/2),y:host.y+Math.floor(host.height/2)};
   nests.push({edgeId:edge.id,hostId:host.id,childId:child.id,gap,corner,axis:random()<.5?'x':'y',original});accepted=true;break search;
  }
  if(!accepted){Object.assign(child,original);delete host.notch;}
 }
 return nests;
}
export function nestingErrors(level){
 const errors=[],nests=level.packing?.nests??[],used=new Set();
 for(const n of nests){
  const host=level.rooms.find(r=>r.id===n.hostId),child=level.rooms.find(r=>r.id===n.childId),edge=level.plan.edges.find(e=>e.id===n.edgeId),connection=level.connections.find(c=>c.id===n.edgeId);
  if(!host||!child||!host.notch||host.notch.childId!==child.id||child.nestedIn!==host.id||used.has(host.id)||used.has(child.id)){errors.push('Неверная пара размещения в выемке.');continue;}
  used.add(host.id);used.add(child.id);
  if([level.plan.startId,level.plan.finalId,level.plan.bossId].some(id=>id===host.id||id===child.id)||level.plan.edges.filter(e=>e.from===child.id||e.to===child.id).length!==1)errors.push('В выемку перемещена опорная комната графа.');
  const cut=host.notch;if(child.x<cut.x||child.y<cut.y||child.x+child.width>cut.x+cut.width||child.y+child.height>cut.y+cut.height||host.width-cut.width-1<4||host.height-cut.height-1<4)errors.push('Выемка не сохраняет широкие плечи зала.');
  if(!edge||![edge.from,edge.to].includes(host.id)||![edge.from,edge.to].includes(child.id)||!Number.isInteger(n.gap)||n.gap<1||n.gap>3||connection?.cells.length!==n.gap)errors.push('Неверный короткий вход в выемку.');
 }
 for(const r of level.rooms)if((r.notch||r.nestedIn)&&!used.has(r.id))errors.push('Необъявленное размещение в выемке.');return errors;
}
