import {connectAtlasRegions,analyzeAtlasAccess,atlasTransportErrors} from './atlas-transports.mjs';
import {caveLayerRequest} from './atlas-layer-settings.mjs';
import {API_VERSION,GENERATOR_VERSION,LabError} from './config.mjs';
import {fingerprint} from './identity.mjs';
import {normalizeAtlasRequest,ATLAS_VERSION,ATLAS_BIOMES,ATLAS_ROCKS,ATLAS_MATERIALS,ATLAS_RESOURCES,ATLAS_MAX_CELLS} from './atlas-catalog.mjs';
import {surfaceFields,caveFields,rockFields,highFields,atlasSeed} from '../core/atlas-landforms.mjs';
import {populateAtlasLayer} from '../core/atlas-content.mjs';
import {hash2,cell,index} from '../core/atlas-math.mjs';
import {watershed} from '../core/atlas-water.mjs';
import {createMovementField,movementFits,findMovementPath,analyzeMovement} from './movement.mjs';
import {atlasComponents,rebuildAtlasWalls,atlasFarthest,clearAtlasFootprint,connectAtlasAnchor,findAtlasPath} from './atlas-navigation.mjs';
import {spawnerProgram} from './spawner-program.mjs';

const count=array=>array.reduce((s,v)=>(s[v]=(s[v]??0)+1,s),{});
export const atlasFingerprint=value=>fingerprint({...value,analysis:undefined,navigation:undefined,fingerprint:undefined,layers:value.layers.map(l=>({...l,analysis:undefined}))});
function layerObject(r,id,z,kind,fields){
  const n=r.width*r.height;Object.assign(fields,{heightmap:[...fields.elevation],ceiling:new Array(n).fill(kind==='underground'?Math.max(3,r.profile.bodyHeight):8),bridge:new Array(n).fill(0),frozen:fields.waterType.map((type,i)=>type!=='none'&&type!=='lava'&&fields.temperature[i]<.18?1:0),road:new Array(n).fill('')});
  if(kind==='underground')for(let i=0;i<n;i++)if(i<r.width||i>=n-r.width||i%r.width===0||i%r.width===r.width-1){fields.material[i]='bedrock';fields.hardness[i]=1;}
  const result={schema:'vland.atlas.layer',topology:r.topology,id,name:kind==='surface'?'Поверхность':kind==='aboveground'?'Надземный ярус '+z:'Недра '+(-z),z,kind,board:{width:r.width,height:r.height,walls:[]},fields,spawn:{x:2,y:2},exit:{x:2,y:2},routeCells:[],sites:[],deposits:[]};rebuildAtlasWalls(result);return result;
}
function bestAnchor(layer,r,repairs){
  let field=createMovementField(layer,r.profile),main=atlasComponents(field)[0]??[];
  if(main.length<r.playability.minRegion){
    const anchors=Math.ceil(Math.sqrt(r.playability.minRegion)),width=Math.min(r.width-2,anchors+r.profile.width-1),height=Math.min(r.height-2,anchors+r.profile.height-1),p={x:1+Math.floor((r.width-2-width)/2),y:1+Math.floor((r.height-2-height)/2)};
    clearAtlasFootprint(layer,p,width,height);const elevation=layer.fields.elevation[index(p,r.width)];
    for(let y=p.y;y<p.y+height;y++)for(let x=p.x;x<p.x+width;x++)layer.fields.elevation[y*r.width+x]=elevation;
    repairs.push({layerId:layer.id,type:'safe-clearing',cells:width*height,reason:'minimum-legal-anchors',footprint:{width:r.profile.width,height:r.profile.height}});
    rebuildAtlasWalls(layer);field=createMovementField(layer,r.profile);main=atlasComponents(field)[0]??[];
  }
  if(main.length<r.playability.minRegion)throw new LabError('ATLAS_NO_REGION','Нет области требуемого размера для выбранного тела; уменьшите minRegion или габарит.');
  const center={x:r.width/2,y:r.height/2};main.sort((a,b)=>Math.hypot(a%r.width-center.x,Math.floor(a/r.width)-center.y)-Math.hypot(b%r.width-center.x,Math.floor(b/r.width)-center.y));return cell(main[0],r.width);
}
function reservePath(layer,from,to,r){
  const path=findMovementPath(layer,from,to,r.profile);if(!path)throw new LabError('ATLAS_UNREACHABLE','Путь между опорными точками яруса отсутствует: '+layer.id);
  const w=r.width,used=new Set(layer.routeCells);for(const p of path)for(let dy=0;dy<r.profile.height;dy++)for(let dx=0;dx<r.profile.width;dx++){const i=(p.y+dy)*w+p.x+dx;layer.fields.reserved[i]=1;used.add(i);}layer.routeCells=[...used].sort((a,b)=>a-b);return path;
}
export function generateAtlas(input){
  const request=normalizeAtlasRequest(input),r=request,surface=surfaceFields(r);surface.fields.rock=rockFields(r,0);surface.fields.hardness=surface.fields.rock.map(id=>ATLAS_ROCKS[id].hardness);
  if(r.autoTransports.enabled&&r.autoTransports.maxLinks<r.layers.above+r.layers.underground)throw new Error('maxLinks меньше числа обязательных связей между слоями.');
  const layers=[layerObject(r,'surface',0,'surface',surface.fields)],repairs=[];
  for(let z=1;z<=r.layers.above;z++)layers.push(layerObject(r,'high-'+z,z,'aboveground',highFields(r,z,surface.fields)));
  for(let depth=1;depth<=r.layers.underground;depth++){const local=caveLayerRequest(r,depth),c=caveFields(local,depth,surface.fields);layers.push(layerObject(r,'cave-'+depth,-depth*local.layers.depthStep,'underground',c.fields));}
  for(const layer of layers)layer.spawn=bestAnchor(layer,r,repairs);
  const links=[],ordered=[...layers].sort((a,b)=>b.z-a.z),footprint={width:Math.max(2,r.profile.width,r.autoTransports.enabled?r.autoTransports.landingSize:1),height:Math.max(2,r.profile.height,r.autoTransports.enabled?r.autoTransports.landingSize:1)};
  for(let k=1;k<ordered.length;k++){
    const a=ordered[k-1],b=ordered[k],fa=createMovementField(a,r.profile),fb=createMovementField(b,r.profile),seed=atlasSeed(r,a.id+'-'+b.id,'transition');
    const candidates=[];for(let y=2;y<r.height-footprint.height-1;y++)for(let x=2;x<r.width-footprint.width-1;x++){const i=y*r.width+x;const score=(movementFits(fa,{x,y})?0:2)+(movementFits(fb,{x,y})?0:2)+hash2(seed,x,y);candidates.push({x,y,score,i});}
    candidates.sort((p,q)=>p.score-q.score);const p=candidates[0];
    for(const layer of [a,b]){connectAtlasAnchor(layer,p,r.profile,repairs);clearAtlasFootprint(layer,p,footprint.width,footprint.height);rebuildAtlasWalls(layer);reservePath(layer,layer.spawn,p,r);}
    links.push({id:'transition-'+k,kind:a.kind==='aboveground'?'climb':'stairs',from:{layerId:a.id,x:p.x,y:p.y},to:{layerId:b.id,x:p.x,y:p.y},footprint:{...footprint},clearance:Math.max(3,r.profile.bodyHeight),travelCost:2});
  }
  for(const layer of layers){rebuildAtlasWalls(layer);layer.exit=atlasFarthest(createMovementField(layer,r.profile),layer.spawn);reservePath(layer,layer.spawn,layer.exit,r);populateAtlasLayer(layer,r);rebuildAtlasWalls(layer);}
  const entry=r.preset==='caverns'?layers.find(l=>l.id==='cave-1'):layers[0],last=layers.filter(l=>l.kind==='underground').at(-1)??layers[0];
  const atlas={schema:'vland.atlas',schemaVersion:1,apiVersion:API_VERSION,generatorVersion:GENERATOR_VERSION,atlasVersion:ATLAS_VERSION,seed:r.seed,request:r,layers,links,spawn:{layerId:entry.id,...entry.spawn},exit:{layerId:last.id,...last.exit},hydrology:{seaLevel:surface.seaLevel,riverThreshold:surface.riverThreshold},repairs};
  connectAtlasRegions(atlas);atlas.access=analyzeAtlasAccess(atlas);if(!atlas.access.ok)throw new Error(atlas.access.errors.join('; '));
  atlas.navigation=findAtlasPath(atlas);if(!atlas.navigation.ok)throw new LabError('ATLAS_UNREACHABLE','Не все ярусы доступны по реальной геометрии.',atlas.navigation);
  atlas.analysis=analyzeAtlas(atlas);atlas.fingerprint=atlasFingerprint(atlas);return atlas;
}
export function analyzeAtlas(atlas){
  const layers=atlas.layers.map(l=>{const movement=analyzeMovement(l,atlas.request.profile);l.analysis={...movement,biomes:count(l.fields.biome),water:count(l.fields.waterType),plants:count(l.fields.vegetation.filter(Boolean)),rocks:count(l.fields.rock),resources:l.deposits.length,sites:l.sites.length};return{id:l.id,z:l.z,...l.analysis,path:undefined};});
  return{layers,cells:atlas.layers.length*atlas.request.width*atlas.request.height,biomes:[...new Set(atlas.layers.flatMap(l=>l.fields.biome))].filter(id=>!['void','cave-wall'].includes(id)),deposits:atlas.layers.reduce((s,l)=>s+l.deposits.length,0),sites:atlas.layers.reduce((s,l)=>s+l.sites.length,0),repairs:atlas.repairs.length,note:'Конечный 2D-атлас. Срезы имеют общее XY; вода — статическая карта, не гидродинамика.'};
}
const unitFields=['elevation','heightmap','humidity','temperature','rainfall','erosion','slope','fertility','hardness','waterDepth'];
const bitFields=['obstacle','support','reserved','bridge','frozen'];
export function validateAtlas(atlas){
  try{
    if(atlas?.schema!=='vland.atlas'||atlas.schemaVersion!==1||atlas.apiVersion!==1||atlas.atlasVersion!==ATLAS_VERSION)throw new Error('Неверный формат или версия atlas.');
    const r=normalizeAtlasRequest(atlas.request),n=r.width*r.height;if(atlas.seed!==r.seed||atlas.layers?.length!==1+r.layers.above+r.layers.underground||n*atlas.layers.length>ATLAS_MAX_CELLS)throw new Error('Ярусы не соответствуют заданию.');
    const expected=new Map([['surface',0],...Array.from({length:r.layers.above},(_,i)=>['high-'+(i+1),i+1]),...Array.from({length:r.layers.underground},(_,i)=>['cave-'+(i+1),-(r.layerSettings?.['cave-'+(i+1)]?.depth??(i+1)*r.layers.depthStep)])]),ids=new Set();
    for(const l of atlas.layers){
      if(l.topology?.kind!==r.topology.kind)throw new Error('Сетка яруса не соответствует заданию.');
      if(l.schema!=='vland.atlas.layer'||ids.has(l.id)||!expected.has(l.id)||expected.get(l.id)!==l.z||l.kind!==(l.z===0?'surface':l.z>0?'aboveground':'underground')||l.board?.width!==r.width||l.board?.height!==r.height)throw new Error('Неверный ярус.');ids.add(l.id);
      const f=l.fields;if(!f||Object.values(f).some(a=>!Array.isArray(a)||a.length!==n))throw new Error('Все поля должны быть row-major массивами одной площади.');
      for(const key of unitFields)if(!f[key]||f[key].some(v=>!Number.isFinite(v)||v<0||v>1))throw new Error('Неверное поле '+key);
      for(const key of bitFields)if(!f[key]||f[key].some(v=>v!==0&&v!==1))throw new Error('Неверное битовое поле '+key);
      if(!f.ceiling||f.ceiling.some(v=>!Number.isFinite(v)||v<0||v>8)||!f.road||f.road.some(v=>!['','trail','bridge','pier'].includes(v)))throw new Error('Неверные просветы или дороги.');
      for(const[key,catalog]of [['biome',ATLAS_BIOMES],['material',ATLAS_MATERIALS],['rock',ATLAS_ROCKS]])if(!f[key]||f[key].some(v=>!Object.hasOwn(catalog,v)))throw new Error('Неизвестный '+key);
      if(!f.waterType||f.waterType.some((v,i)=>!['none','sea','river','lake','groundwater','lava'].includes(v)||(v==='none')!==(f.waterDepth[i]===0)||f.bridge[i]&&!f.waterDepth[i]||f.frozen[i]&&(v==='lava'||v==='none')))throw new Error('Противоречивая вода.');
      if(!f.vegetation||f.vegetation.some(v=>typeof v!=='string')||!f.structure||!f.deposit||!f.resource||!f.resourceAmount||f.resource.some((id,i)=>id!==''&&(!r.resources.types.includes(id)||!ATLAS_RESOURCES[id].hosts.includes(f.rock[i])||(l.kind==='underground'?Number(l.id.slice(5)):0)<ATLAS_RESOURCES[id].minDepth||(l.kind==='underground'?Number(l.id.slice(5)):0)>ATLAS_RESOURCES[id].maxDepth))||f.resourceAmount.some((v,i)=>!Number.isInteger(v)||v<0||!!v!==!!f.resource[i]))throw new Error('Залежь не соответствует породе, глубине или количеству.');
      if(!Array.isArray(l.board.walls)||l.board.walls.length!==f.obstacle.reduce((s,v)=>s+v,0)||new Set(l.board.walls.map(p=>p.y*r.width+p.x)).size!==l.board.walls.length||l.board.walls.some(p=>!Number.isInteger(p.x)||!Number.isInteger(p.y)||p.x<0||p.y<0||p.x>=r.width||p.y>=r.height||!f.obstacle[p.y*r.width+p.x]))throw new Error('Стены расходятся с collision-полем.');
      if(l.kind==='underground'&&f.obstacle.some((v,i)=>(i<r.width||i>=n-r.width||i%r.width===0||i%r.width===r.width-1)&&v!==1))throw new Error('Пробита внешняя нерушимая порода.');
      if(!Array.isArray(l.routeCells)||l.routeCells.some(i=>!Number.isInteger(i)||i<0||i>=n||!f.reserved[i]||f.obstacle[i]))throw new Error('Защищённый маршрут перекрыт.');
      const field=createMovementField(l,r.profile);if(!movementFits(field,l.spawn)||!movementFits(field,l.exit)||!findMovementPath(l,l.spawn,l.exit,r.profile,{},field))throw new Error('Нет маршрута по ярусу.');
      const deposits=new Set();if(!Array.isArray(l.deposits)||l.deposits.length>n)throw new Error('Неверный список залежей.');
      const depositCells=new Map();for(let i=0;i<n;i++)if(f.deposit[i]){if(!depositCells.has(f.deposit[i]))depositCells.set(f.deposit[i],new Set());depositCells.get(f.deposit[i]).add(i);}
      for(const d of l.deposits){const spec=ATLAS_RESOURCES[d.type],actual=depositCells.get(d.id);if(typeof d.id!=='string'||!d.id.length||deposits.has(d.id)||!spec||d.depth!==(l.kind==='underground'?Number(l.id.slice(5)):0)||!Array.isArray(d.hostRule)||d.hostRule.length!==spec.hosts.length||new Set(d.hostRule).size!==spec.hosts.length||d.hostRule.some(id=>!spec.hosts.includes(id))||!Array.isArray(d.cells)||!d.cells.length||actual?.size!==d.cells.length||new Set(d.cells.map(p=>p.y*r.width+p.x)).size!==d.cells.length||d.cells.some(p=>!Number.isInteger(p.x)||!Number.isInteger(p.y)||p.x<0||p.y<0||p.x>=r.width||p.y>=r.height||!actual.has(p.y*r.width+p.x)||f.resource[p.y*r.width+p.x]!==d.type)||d.amount!==d.cells.reduce((s,p)=>s+f.resourceAmount[p.y*r.width+p.x],0))throw new Error('Залежь и её клетки не совпадают.');deposits.add(d.id);}
      if(f.deposit.some((id,i)=>id?(!deposits.has(id)||!f.resource[i]):!!f.resource[i]))throw new Error('Потерян ID залежи.');
      if(!Array.isArray(l.sites)||l.sites.length>n||new Set(l.sites.map(s=>s.id)).size!==l.sites.length)throw new Error('Неверные объекты.');
      for(const s of l.sites){const i=s.position.y*r.width+s.position.x;if(!movementFits(field,s.position)||f.waterType[i]!=='none'||s.cells?.length!==s.footprint.width*s.footprint.height||s.cells.some(p=>!movementFits(field,p)))throw new Error('Объект вне доступной сухой позиции.');if(['spawner','event'].includes(s.kind)&&Math.hypot(s.position.x-l.spawn.x,s.position.y-l.spawn.y)<=r.playability.safeRadius)throw new Error('Опасность в стартовой зоне.');if(s.kind==='spawner'){spawnerProgram(s.program);if(s.program.repeat!=='once'||s.totalLimit!==s.program.waves.reduce((sum,v)=>sum+v.members.reduce((a,m)=>a+m.count,0),0))throw new Error('Спавнер должен иметь конечные волны.');}}
      if(l.id==='surface'){
        const hydro=watershed(f.heightmap,r.width,r.height,f.rainfall,r.topology);for(const key of ['flowTo','flowRank','basin','filledElevation','drainage'])if(!f[key]||f[key].some((v,i)=>!Number.isFinite(v)||Math.abs(v-hydro[key][i])>1e-5))throw new Error('Водосбор не соответствует исходной высоте: '+key);
      }
    }
    if(!Array.isArray(atlas.links)||atlas.links.length<atlas.layers.length-1||atlas.links.length>128||new Set(atlas.links.map(l=>l.id)).size!==atlas.links.length)throw new Error('Не хватает парных переходов.');
    for(const link of atlas.links){if(!['stairs','climb','lift','teleport'].includes(link.kind)||![link.footprint?.width,link.footprint?.height].every(n=>Number.isInteger(n)&&n>=1&&n<=8)||link.bidirectional!==undefined&&typeof link.bidirectional!=='boolean'||!Number.isFinite(link.travelCost)||link.travelCost<1||link.footprint?.width<r.profile.width||link.footprint.height<r.profile.height||!Number.isFinite(link.clearance)||link.clearance<r.profile.bodyHeight||(link.kind==='teleport'?link.from.layerId!==link.to.layerId:link.from.layerId===link.to.layerId||link.from.x!==link.to.x||link.from.y!==link.to.y))throw new Error('Неверный физический переход.');for(const end of [link.from,link.to]){const l=atlas.layers.find(l=>l.id===end.layerId);if(!l||!movementFits(createMovementField(l,r.profile),end))throw new Error('Площадка отсутствует.');for(let dy=0;dy<link.footprint.height;dy++)for(let dx=0;dx<link.footprint.width;dx++){const i=(end.y+dy)*r.width+end.x+dx;if(!l.fields.reserved[i]||l.fields.obstacle[i]||!l.fields.support[i]||l.fields.ceiling[i]<link.clearance)throw new Error('Площадка перекрыта.');}}}
    const access=analyzeAtlasAccess(atlas);if(!access.ok)throw new Error(access.errors.join('; '));const transportErrors=atlasTransportErrors(atlas);if(transportErrors.length)throw new Error(transportErrors.join('; '));if(fingerprint(atlas.access)!==fingerprint(access))throw new Error('Сохранённый отчёт доступности не совпадает с физической проверкой.');
    if(!Array.isArray(atlas.repairs)||atlas.fingerprint!==atlasFingerprint(atlas))throw new Error('Отпечаток atlas не совпадает.');const navigation=findAtlasPath(atlas);if(!navigation.ok)throw new Error('Не все ярусы достижимы.');return{ok:true,errors:[],layers:atlas.layers.length,cells:n*atlas.layers.length,reachableLayers:navigation.reachableLayers};
  }catch(error){return{ok:false,errors:[error.message],code:error.code??'INVALID_ATLAS'};}
}
export function exportAtlasTiles(atlas){return{schema:'vland.atlas.tiles',schemaVersion:1,atlasVersion:atlas.atlasVersion,sourceFingerprint:atlas.fingerprint,origin:structuredClone(atlas.request.origin),spawn:structuredClone(atlas.spawn),exit:structuredClone(atlas.exit),links:structuredClone(atlas.links),catalogs:{biomes:ATLAS_BIOMES,materials:ATLAS_MATERIALS,resources:ATLAS_RESOURCES},layers:atlas.layers.map(l=>({id:l.id,z:l.z,kind:l.kind,topology:structuredClone(l.topology),width:l.board.width,height:l.board.height,fields:structuredClone(l.fields),sites:structuredClone(l.sites),deposits:structuredClone(l.deposits)}))};}
