export function updateTierDraft(generation,{count,rooms,headroom,kind,changed}){
 if(!Number.isInteger(count)||count<1||count>8||!Number.isInteger(rooms)||rooms<1||rooms>30||!Number.isInteger(headroom)||headroom<3||headroom>16||!['stairs','lift'].includes(kind))return false;
 const previous=generation.layers,links=generation.links??[],ids=new Set(previous.map(l=>l.id));
 generation.layers=Array.from({length:count},(_,i)=>{
  const existing=previous[i],layer=structuredClone(existing??previous.at(-1));
  if(!existing){let n=i;while(ids.has('tier-'+n))n++;layer.id='tier-'+n;ids.add(layer.id);layer.elevation=(previous.at(-1)?.elevation??0)+(i-previous.length+1)*(headroom+1);}
  if(changed==='$headroom'){layer.headroom=headroom;layer.elevation=i*(headroom+1);}
  if(changed==='$roomCount'){layer.request.rooms??={};layer.request.rooms.count=rooms;}
  return layer;
 });
 generation.links=generation.layers.slice(1).map((layer,i)=>{
  const from=generation.layers[i],existing=links.find(t=>t.from.layerId===from.id&&t.to.layerId===layer.id);
  return existing?{...existing,...(changed==='$linkKind'?{kind}:{})}:{id:'link-'+i,from:{layerId:from.id,room:'exit'},to:{layerId:layer.id,room:'start'},kind};
 });
 return true;
}
