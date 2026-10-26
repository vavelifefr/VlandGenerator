import {gridNeighbors} from './topology.mjs';
import {ATLAS_BIOMES} from '../api/atlas-catalog.mjs';
export function fieldDistance(seeds,width,height,topology,max=Infinity){const d=new Array(width*height).fill(width+height),q=[];for(let i=0;i<d.length;i++)if(seeds(i)){d[i]=0;q.push(i);}for(let k=0;k<q.length;k++){const i=q[k];if(d[i]>=max)continue;for(const j of gridNeighbors(i,width,height,topology))if(d[j]>d[i]+1){d[j]=d[i]+1;q.push(j);}}return d;}
function landscapeEcotones(fields,r,regions){
 const width=r.biomes.transitionWidth;if(!regions||!width)return;
 const n=regions.length,distance=new Int16Array(n).fill(32767),owner=new Array(n),queue=[],counts=new Map(),candidates=new Map();
 for(let i=0;i<n;i++)if(fields.waterType[i]==='none'){
  counts.set(regions[i],(counts.get(regions[i])??0)+1);
  const different=gridNeighbors(i,r.width,r.height,r.topology).find(j=>fields.waterType[j]==='none'&&regions[j]!==regions[i]);
  if(different!==undefined){distance[i]=1;owner[i]=regions[different];queue.push(i);}
 }
 for(let at=0;at<queue.length;at++){const i=queue[at];if(distance[i]>=width)continue;for(const j of gridNeighbors(i,r.width,r.height,r.topology))if(fields.waterType[j]==='none'&&regions[j]===regions[i]&&distance[j]>distance[i]+1){distance[j]=distance[i]+1;owner[j]=owner[i];queue.push(j);}}
 const protectedBiomes=new Set(['beach','gravel-shore','rocky-coast','floodplain','cliffs']);
 for(const i of queue){if(protectedBiomes.has(fields.biome[i]))continue;
  const a=regions[i],b=owner[i],pair=[a,b],temp=fields.temperature[i];let biome;
  if(pair.includes('mountains')&&pair.some(type=>['forest','meadow','swamp'].includes(type))&&fields.elevation[i]<.87)biome='foothills';
  else if(pair.includes('snow')&&pair.some(type=>['forest','meadow','mountains','desert'].includes(type)))biome='tundra';
  else if(pair.includes('desert')&&pair.some(type=>['forest','meadow','swamp'].includes(type)))biome=temp>.4?'savanna':'cold-desert';
  else if(pair.includes('swamp')&&pair.some(type=>['forest','meadow'].includes(type))&&fields.slope[i]<.045)biome='floodplain';
  else if(pair.includes('volcanic')&&distance[i]===1)biome='badlands';
  if(!biome||biome===fields.biome[i])continue;
  if(!candidates.has(a))candidates.set(a,[]);candidates.get(a).push({i,biome,distance:distance[i]});
 }
 // A very small selected territory must retain its core. Apply complete
 // distance rings, not an arbitrary prefix of a border or random pixels.
 for(const [type,items]of candidates){let limit=0,spent=0;for(let d=1;d<=width;d++){const ring=items.filter(item=>item.distance===d).length;if(spent+ring>counts.get(type)*.35)break;spent+=ring;limit=d;}
  for(const item of items)if(item.distance<=limit){fields.biome[item.i]=item.biome;fields.material[item.i]=ATLAS_BIOMES[item.biome].material;}
 }
}
// A semantic water biome only: preserve the bed, depth, water kind and navigation.
export function applyLandscapeShallows(fields,r){
 if(!r.landscape||!fields.waterType.includes('sea'))return;
 const distance=fieldDistance(i=>fields.waterType[i]==='none',r.width,r.height,r.topology),reach=Math.max(1,Math.min(r.width,r.height)*.025);
 for(let i=0;i<fields.waterType.length;i++)if(fields.waterType[i]==='sea'){
  const depth=fields.waterDepth?.[i],threshold=.075+.045*Math.exp(-Math.max(0,distance[i]-1)/reach);
  // Near a dry shore a broader shallow shelf is possible. Offshore shoals
  // qualify by their actual small depth, without inventing dry reefs.
  if(depth>0&&depth<=threshold){fields.biome[i]='shallow-water';fields.material[i]='water';}
 }
}
export function deriveBiomes(fields,r,regions){const n=r.width*r.height,nearSea=fieldDistance(i=>fields.waterType[i]==='sea',r.width,r.height,r.topology),nearRiver=fieldDistance(i=>['river','lake'].includes(fields.waterType[i]),r.width,r.height,r.topology),nearMountain=fieldDistance(i=>fields.elevation[i]>.76,r.width,r.height,r.topology);fields.coastDistance=nearSea;fields.landform=new Array(n);fields.salinity=new Array(n).fill(0);fields.floodRisk=new Array(n).fill(0);fields.secondaryBiome=new Array(n).fill('');fields.transitionStrength=new Array(n).fill(0);
 // In an explicit landscape, local edge contexts supplement the selected
 // surface identity. Their bands cannot swallow a small island's whole core.
 const profile=r.landscape?.baseBiome,coastWidth=profile?Math.min(r.biomes.coastWidth,Math.max(1,Math.floor(Math.min(r.width,r.height)/32))):r.biomes.coastWidth,
  floodWidth=profile?Math.min(r.hydrology.floodplainWidth,1):r.hydrology.floodplainWidth,
  foothillWidth=profile?Math.min(r.biomes.foothillWidth,1):r.biomes.foothillWidth;
 for(let i=0;i<n;i++){const e=fields.elevation[i],s=fields.slope[i],water=fields.waterType[i],localProfile=regions?.[i]??profile;fields.landform[i]=water==='sea'?'seabed':water!=='none'?'basin':s>.12?'cliff':e>.82?'peak':e>.7?'mountain':s>.045?'hills':'plain';fields.salinity[i]=water==='sea'?1:water!=='none'&&nearSea[i]<3?Math.round((3-nearSea[i])/3*1000)/1000:0;if(water!=='none')continue;
  if(nearSea[i]<=coastWidth&&(!profile||e<.42&&!['snow','volcanic'].includes(localProfile))){fields.biome[i]=s>.09?'rocky-coast':s>.04?'gravel-shore':'beach';}
  else if(nearRiver[i]<=floodWidth&&fields.slope[i]<.045&&(!profile||e<.48&&!['swamp','snow','volcanic'].includes(localProfile))){fields.biome[i]=profile?'floodplain':fields.humidity[i]>.65?'wetland':'floodplain';fields.floodRisk[i]=Math.round((1-nearRiver[i]/(floodWidth+1))*.8*1000)/1000;}
  else if(nearMountain[i]<=foothillWidth&&e<.76&&s>.025&&(!profile||localProfile==='mountains'&&e<.6))fields.biome[i]='foothills';
  fields.material[i]=ATLAS_BIOMES[fields.biome[i]].material;
 }
 applyLandscapeShallows(fields,r);
 landscapeEcotones(fields,r,regions);
 const original=[...fields.biome],width=r.biomes.transitionWidth;if(!width)return;const distance=new Int16Array(n).fill(32767),owner=new Array(n).fill(''),q=[];for(let i=0;i<n;i++)if(fields.waterType[i]==='none'&&!['cliffs','snow','rocky-coast'].includes(original[i])){const different=gridNeighbors(i,r.width,r.height,r.topology).find(j=>fields.waterType[j]==='none'&&original[j]!==original[i]&&!['cliffs','snow','rocky-coast'].includes(original[j]));if(different!==undefined){distance[i]=1;owner[i]=original[different];q.push(i);}}
 for(let at=0;at<q.length;at++){const i=q[at];if(distance[i]>=width)continue;for(const j of gridNeighbors(i,r.width,r.height,r.topology))if(original[j]===original[i]&&distance[j]>distance[i]+1){distance[j]=distance[i]+1;owner[j]=owner[i];q.push(j);}}
 for(let i=0;i<n;i++)if(distance[i]<=width){fields.secondaryBiome[i]=owner[i];fields.transitionStrength[i]=Math.round(.5*(1-(distance[i]-.5)/(width+.5))*1000)/1000;}
}
