import {clamp,fractalNoise,hash2} from './atlas-math.mjs';
import {watershed} from './atlas-water.mjs';

// Settlement surface: a static river valley, not a simulation of water flow.
// Freeze the valley bed before streets build decks, and recompute its watershed.
export function prepareSettlementTerrain(layer,request){
 const {width:w,height:h,seed,type}=request,f=layer.fields,n=w*h,dry=[];
 f.reserved.fill(0);layer.routeCells=[];
 f.secondaryBiome.fill('');f.transitionStrength.fill(0);
 for(let i=0;i<n;i++)if(!f.obstacle[i]&&f.biome[i]!=='cliffs')dry.push({i,noise:fractalNoise(seed^0x294b7,(i%w)/Math.max(12,w*.35),Math.floor(i/w)/Math.max(12,h*.35),{octaves:3})});
 dry.sort((a,b)=>a.noise-b.noise||a.i-b.i);
 const forest=Math.round(dry.length*(type==='village'?.55:.14));
 dry.forEach(({i},k)=>{f.biome[i]=k<forest?'forest':'plains';f.material[i]='grass';});
 if(request.terrain.water===0)return;
 const target=Math.round(n*request.terrain.water),vertical=hash2(seed,13,41)>.5,length=vertical?h:w,across=vertical?w:h,phase=hash2(seed,27,51)*Math.PI*2,
  budget=target*(type==='town'?.52:.8),span=Math.min(length,Math.max(1,Math.floor(budget/2))),start=Math.floor((length-span)/2),
  radius=clamp(budget/length/2,1.1,3),centers=[],river=new Set(),amplitude=Math.min(across*.10,length*.07),detail=Math.min(across*.035,length*.018);
 const water=(i,kind)=>{const cliff=f.obstacle[i]||f.biome[i]==='cliffs';f.waterType[i]=kind;f.waterDepth[i]=kind==='river'?.35:.5;if(!cliff){f.biome[i]=kind;f.material[i]='water';}f.frozen[i]=0;f.elevation[i]=Math.max(0,f.elevation[i]-.07);};
 for(let t=0;t<length;t++){
  const u=t/Math.max(1,length-1),center=across*.46+amplitude*Math.sin(u*Math.PI*2+phase)+detail*Math.sin(u*Math.PI*5+phase*.7);centers.push(center);
  if(t<start||t>=start+span)continue;
  const width=radius*(1+.16*Math.sin(u*Math.PI*3+phase));
  for(let a=Math.max(0,Math.floor(center-width));a<=Math.min(across-1,Math.ceil(center+width));a++)if(Math.abs(a-center)<=width){const i=vertical?t*w+a:a*w+t;river.add(i);water(i,'river');}
 }
 const remaining=Math.max(0,target-river.size);
 if(remaining){
  // A compact lake on one bank; rank a warped ellipse instead of flooding a box.
  const side=hash2(seed,91,31)>.5?1:-1,
   along=length*(.28+hash2(seed,31,73)*.42),cross=clamp(centers[Math.round(along)]+side*across*.28,across*.15,across*.85),
   cx=vertical?cross:along,cy=vertical?along:cross,rx=Math.sqrt(remaining/Math.PI)*1.15,ry=Math.sqrt(remaining/Math.PI)/1.15,candidates=[];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const i=y*w+x;
   if(f.waterType[i]!=='none'||f.biome[i]==='cliffs'||f.obstacle[i])continue;
   const score=((x-cx)/Math.max(1,rx))**2+((y-cy)/Math.max(1,ry))**2+(fractalNoise(seed^0x739b,x/7,y/7,{octaves:2})-.5)*.18;
   candidates.push({i,score});
  }
  candidates.sort((a,b)=>a.score-b.score||a.i-b.i);for(const {i} of candidates.slice(0,remaining))water(i,'lake');
 }
 f.heightmap=[...f.elevation];Object.assign(f,watershed(f.heightmap,w,h,f.rainfall,layer.topology));
}

// The requested percentage bounds the street plan; unsuitable terrain remains natural.
export function settlementPlanBounds(layer,request){
 const {width:w,height:h}=layer.board,scale=Math.sqrt(request.cityPercent/100),bw=Math.max(6,Math.round((w-6)*scale)),bh=Math.max(6,Math.round((h-6)*scale)),f=layer.fields,stride=w+1,integral=new Int32Array((w+1)*(h+1));
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;integral[(y+1)*stride+x+1]=integral[y*stride+x+1]+integral[(y+1)*stride+x]-integral[y*stride+x]+Number(!f.obstacle[i]&&f.waterType[i]==='none'&&f.biome[i]!=='cliffs');}
 let best=-Infinity,result;
 for(let top=3;top<=h-3-bh;top++)for(let left=3;left<=w-3-bw;left++){
  const right=left+bw,bottom=top+bh,dry=integral[bottom*stride+right]-integral[top*stride+right]-integral[bottom*stride+left]+integral[top*stride+left],score=dry-Math.hypot(left+bw/2-w/2,top+bh/2-h/2)*.01;
  if(score>best){best=score;result={left,top,right:right-1,bottom:bottom-1};}
 }
 return result;
}

export function placeTownSpaces(layer,request,districts){
 if(request.type!=='town')return;
 const {width:w,height:h}=layer.board,f=layer.fields,candidates=districts.neighborhoods.filter(v=>{
  const {width,height}=v.bounds;
  return Math.min(width,height)>=4&&Math.max(width,height)/Math.min(width,height)<=2.5&&v.area/(width*height)>=.5;
 }).map(v=>({cells:v.cells,distance:Math.hypot((v.bounds.x+v.bounds.width/2-w/2)/w,(v.bounds.y+v.bounds.height/2-h/2)/h)}));
 candidates.sort((a,b)=>a.distance-b.distance||a.cells[0]-b.cells[0]);
 const area=w*h*request.cityPercent/100;
 const paint=(biome,budget)=>{let used=0;for(let at=0;at<candidates.length;){const site=candidates[at];if(used+site.cells.length>budget){at++;continue;}used+=site.cells.length;for(const i of site.cells){f.biome[i]=biome;f.material[i]=biome==='square'?'gravel':'grass';}candidates.splice(at,1);}};
 paint('square',Math.max(144,Math.round(area*.015)));
 candidates.sort((a,b)=>hash2(request.seed,a.cells[0],71)-hash2(request.seed,b.cells[0],71));
 paint('park',Math.max(144,Math.round(area*.06)));
}
