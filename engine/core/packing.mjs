import {corridorSettings,sampleCorridor} from './corridors.mjs';
import {areaDomain,areaApplies,roomAreaChoices} from './area.mjs';
// Independent room boundaries. Only the faces of actual connections move together.
// The logical contact graph never dictates a shared physical row or column size.
export function packRooms(plan,{roomMin=10,roomMax=16,random,interlocking=true,shapeWeights,packing='growth',roomAreaMin,roomAreaMax,corridors}) {
  if(!['growth','contact'].includes(packing))throw new Error('packing: growth или contact.');
  const passage=corridorSettings(corridors);
  const areaOptions={roomMin,roomMax,shapeWeights,roomAreaMin,roomAreaMax},domain=areaDomain(plan,areaOptions);
  const nodes=plan.nodes,count=nodes.length,byId=new Map(nodes.map((n,i)=>[n.id,i]));
  const columns=Math.max(...nodes.map(n=>n.x+n.spanX)),rows=Math.max(...nodes.map(n=>n.y+n.spanY));
  if(columns>128||rows>128)throw new Error('Слишком большая логическая раскладка.');
  const largeOrdinary=plan.bossId&&nodes.some(n=>n.id!==plan.bossId&&n.spanX*n.spanY>1);
  const protectedIds=new Set([plan.startId,plan.finalId,plan.bossId]),degree=id=>plan.edges.filter(e=>e.from===id||e.to===id).length;
  const nestingAnchors=!domain&&interlocking&&(shapeWeights?.L??2)>0&&roomMax>=roomMin+8?nodes.filter(n=>!protectedIds.has(n.id)&&plan.edges.some(e=>{const other=e.from===n.id?e.to:e.to===n.id?e.from:null,leaf=nodes.find(v=>v.id===other);return leaf&&!protectedIds.has(other)&&degree(other)===1&&leaf.spanX*leaf.spanY===1;})).sort((a,b)=>b.spanX*b.spanY-a.spanX*a.spanY||degree(b.id)-degree(a.id)||a.id.localeCompare(b.id)).slice(0,Math.max(1,Math.floor(count/20))).map(n=>n.id):[];
  const standardMin=largeOrdinary?roomMax:plan.bossId?Math.max(roomMin,Math.ceil(roomMax*Math.sqrt(1.5)/2)):roomMin,baseMin=Math.max(standardMin,nestingAnchors.length?roomMin+8:roomMin);
  const areaPair=domain?.pairs[Math.floor(random()*domain.pairs.length)];
  const widths=Array.from({length:columns},()=>areaPair?.width??baseMin+Math.floor(random()*(roomMax-baseMin+1)));
  const heights=Array.from({length:rows},()=>areaPair?.height??baseMin+Math.floor(random()*(roomMax-baseMin+1)));
  const gapsX=Array.from({length:columns-1},()=>sampleCorridor(passage,random)),gapsY=Array.from({length:rows-1},()=>sampleCorridor(passage,random));
  const origin=(sizes,gaps,i)=>3+sizes.slice(0,i).reduce((a,b)=>a+b,0)+gaps.slice(0,i).reduce((a,b)=>a+b,0);
  const extent=(sizes,gaps,i,span)=>sizes.slice(i,i+span).reduce((a,b)=>a+b,0)+gaps.slice(i,i+span-1).reduce((a,b)=>a+b,0);
  const rects=nodes.map(n=>({x:origin(widths,gapsX,n.x),y:origin(heights,gapsY,n.y),width:extent(widths,gapsX,n.x,n.spanX),height:extent(heights,gapsY,n.y,n.spanY)}));
  for(let i=0;i<count;i++)if(['start','final'].includes(nodes[i].purpose)) {
    const r=rects[i],n=nodes[i],e=plan.edges.find(e=>e.from===n.id||e.to===n.id),p=nodes[byId.get(e.from===n.id?e.to:e.from)];
    if(n.x+n.spanX===p.x){r.x+=r.width-5;r.y+=Math.floor((r.height-5)/2);}
    else if(p.x+p.spanX===n.x)r.y+=Math.floor((r.height-5)/2);
    else if(n.y+n.spanY===p.y){r.y+=r.height-5;r.x+=Math.floor((r.width-5)/2);}
    else r.x+=Math.floor((r.width-5)/2);
    r.width=r.height=5;
  }
  const initial=structuredClone(rects),parents=Array.from({length:count*4},(_,i)=>i);
  const root=i=>parents[i]===i?i:(parents[i]=root(parents[i]));
  const join=(a,b)=>{parents[root(a)]=root(b);};
  const edges=plan.edges.map(e=>{
    const a=byId.get(e.from),b=byId.get(e.to);if(a===undefined||b===undefined)throw new Error('Неизвестная комната связи.');
    const an=nodes[a],bn=nodes[b],horizontal=an.x+an.spanX===bn.x||bn.x+bn.spanX===an.x;
    if(horizontal){const left=an.x<bn.x?a:b,right=left===a?b:a;join(left*4+1,right*4);}
    else{const top=an.y<bn.y?a:b,bottom=top===a?b:a;join(top*4+3,bottom*4+2);}
    return{a,b,horizontal};
  });
  for(let i=0;i<count;i++)if(['start','final'].includes(nodes[i].purpose)){join(i*4,i*4+1);join(i*4+2,i*4+3);}
  const groups=new Map();for(let v=0;v<parents.length;v++){const id=root(v);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(v);}
  const list=[...groups.values()],bounds=rects.map(r=>[r.x,r.x+r.width-1,r.y,r.y+r.height-1]);
  const fixed=i=>['start','final'].includes(nodes[i].purpose);
  const valid=changed=>{
    for(const i of changed){const r=rects[i],n=nodes[i],minW=fixed(i)?5:n.spanX*roomMin+n.spanX-1,maxW=fixed(i)?5:n.spanX*roomMax+(n.spanX-1)*passage.maxLength,minH=fixed(i)?5:n.spanY*roomMin+n.spanY-1,maxH=fixed(i)?5:n.spanY*roomMax+(n.spanY-1)*passage.maxLength;
      if(r.width<minW||r.width>maxW||r.height<minH||r.height>maxH||nestingAnchors.includes(n.id)&&Math.min(r.width,r.height)<roomMin+8)return false;
      if(domain&&areaApplies(n)&&!roomAreaChoices({...r,purpose:n.purpose},areaOptions).length)return false;
      for(let j=0;j<count;j++)if(j!==i){const b=rects[j];if(!(r.x+r.width+1<=b.x||b.x+b.width+1<=r.x||r.y+r.height+1<=b.y||b.y+b.height+1<=r.y))return false;}
    }
    for(const e of edges)if(changed.has(e.a)||changed.has(e.b)){const a=rects[e.a],b=rects[e.b],overlap=e.horizontal?Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y):Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x);if(overlap<5)return false;}
    if(plan.bossId){const boss=rects[byId.get(plan.bossId)];for(let i=0;i<count;i++)if(!fixed(i)&&nodes[i].id!==plan.bossId&&boss.width*boss.height<rects[i].width*rects[i].height*1.5)return false;}
    return true;
  };
  let moves=0;
  for(let pass=0;pass<18;pass++){
    // Seeded shuffle avoids a persistent bias towards one side of the layout.
    for(let i=list.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[list[i],list[j]]=[list[j],list[i]];}
    for(const group of list){const delta=Math.floor(random()*11)-5;if(!delta)continue;const changed=new Set(group.map(v=>Math.floor(v/4)));
      const shift=d=>{for(const v of group)bounds[Math.floor(v/4)][v%4]+=d;for(const i of changed){const [x,right,y,bottom]=bounds[i];Object.assign(rects[i],{x,y,width:right-x+1,height:bottom-y+1});}};
      shift(delta);if(valid(changed))moves++;else shift(-delta);
    }
  }
  // Bounded coordinate search over contact-face domains. All accepted moves
  // retain the existing 1–3-cell gaps and a usable shared door interval.
  let relaxation;
  if(packing==='contact'){
    const objective=()=>{
      const area=(Math.max(...rects.map(r=>r.x+r.width))-Math.min(...rects.map(r=>r.x)))*(Math.max(...rects.map(r=>r.y+r.height))-Math.min(...rects.map(r=>r.y)));
      const buckets=new Map();for(const r of rects)for(const v of ['x:'+r.x,'x:'+(r.x+r.width),'y:'+r.y,'y:'+(r.y+r.height)])buckets.set(v,(buckets.get(v)??0)+1);
      const aligned=[...buckets.values()].reduce((n,k)=>n+k*(k-1)/2,0),floor=rects.reduce((n,r)=>n+r.width*r.height,0);
      return area/floor+aligned/Math.max(1,count)*.12;
    };
    const before=objective(),maxEvaluations=4096;let evaluations=0,accepted=0,rejected=0;
    for(let pass=0;pass<4&&evaluations<maxEvaluations;pass++)for(const group of list){
      if(evaluations>=maxEvaluations)break;
      const changed=new Set(group.map(v=>Math.floor(v/4)));
      const shift=d=>{for(const v of group)bounds[Math.floor(v/4)][v%4]+=d;for(const i of changed){const[x,right,y,bottom]=bounds[i];Object.assign(rects[i],{x,y,width:right-x+1,height:bottom-y+1});}};
      let best=0,score=objective();
      for(const delta of [-3,-2,-1,1,2,3]){if(evaluations>=maxEvaluations)break;evaluations++;shift(delta);if(valid(changed)){const value=objective();if(value<score-1e-9){score=value;best=delta;}}else rejected++;shift(-delta);}
      if(best){shift(best);accepted++;}
    }
    relaxation={evaluations,maxEvaluations,accepted,rejected,scoreBefore:Math.round(before*10000)/10000,scoreAfter:Math.round(objective()*10000)/10000};
  }
  const minX=Math.min(...rects.map(r=>r.x)),minY=Math.min(...rects.map(r=>r.y));
  const movedRooms=rects.filter((r,i)=>Object.keys(r).some(k=>r[k]!==initial[i][k])).length;
  for(const r of rects){r.x+=3-minX;r.y+=3-minY;}
  const width=Math.max(...rects.map(r=>r.x+r.width))+3,height=Math.max(...rects.map(r=>r.y+r.height))+3;
  return{rects,width,height,packing:{...(domain?{areaConstraint:{min:domain.min,max:domain.max,exempt:['start','final','boss'],domainPairs:domain.pairs.length}}:{}),method:packing==='contact'?'contact-domain-relaxation':'independent-contact-faces',passes:18,moves,movedRooms,nestingAnchors,...(relaxation?{relaxation}:{})}};
}
