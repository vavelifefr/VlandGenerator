import {naturalTransportSettings,NATURAL_TRANSPORT_DEFAULTS} from './atlas-transports.mjs';
import {LANDFORM_DEFAULTS,BIOME_DEFAULTS} from '../core/atlas-shaping.mjs';
import {normalizeTopology} from '../core/topology.mjs';
import {normalizeLayerSettings} from './atlas-layer-settings.mjs';
import {normalizeLandscapeProfile,LANDSCAPE_BIOMES} from '../core/landscape-profile.mjs';
import {LabError} from './config.mjs';
import {movementProfile} from './movement.mjs';

// A separate algorithm version keeps every pre-atlas room/terrain seed intact.
export const ATLAS_VERSION='1.0.0';
export const ATLAS_MAX_CELLS=98304;
const rock=(name,color,hardness,group)=>({name,color,hardness,group,diggable:true});
export const ATLAS_ROCKS=Object.freeze({
  granite:rock('Гранит','#89818a',.8,'igneous'),basalt:rock('Базальт','#4e5864',.85,'igneous'),
  limestone:rock('Известняк','#b4b29a',.45,'sedimentary'),sandstone:rock('Песчаник','#ad8861',.4,'sedimentary'),
  shale:rock('Сланцевая глина','#74766c',.35,'sedimentary'),slate:rock('Сланец','#657985',.65,'metamorphic'),
  marble:rock('Мрамор','#c1b6ba',.6,'metamorphic'),gneiss:rock('Гнейс','#908993',.8,'metamorphic'),
  obsidian:rock('Обсидиан','#423b52',.9,'igneous'),halite:rock('Каменная соль','#c8b6ae',.3,'sedimentary')
});
const material=(name,color,hardness=0)=>({name,color,hardness,diggable:hardness>0});
export const ATLAS_MATERIALS=Object.freeze({...ATLAS_ROCKS,
  soil:material('Обычная земля','#8b7554',.12),grass:material('Дёрн','#648657',.1),sand:material('Песок','#cfb77b',.08),
  clay:material('Глина','#a58066',.18),mud:material('Ил','#5c6a53',.08),peat:material('Торф','#5c5c41',.1),
  gravel:material('Гравий','#9c9989',.2),snow:material('Снег','#d9e3e4',.04),ice:material('Лёд','#9cbdca',.25),
  brick:material('Кладка руин','#927e72',.5),timber:material('Дерево конструкции','#9c7953',.3),
  water:material('Вода','#33718b'),lava:material('Лава','#c05830'),air:material('Воздух / нет опоры','#111b26'),
  bedrock:{...material('Коренная нерушимая порода','#292f3a',1),diggable:false}
});
const biome=(name,color,material,plant='',cover=0)=>({name,color,material,plant,cover});
export const ATLAS_BIOMES=Object.freeze({beach:biome('Песчаный берег','#d5bf87','sand'),'rocky-coast':biome('Скалистый берег','#838c89','granite'),'gravel-shore':biome('Галечный берег','#a7a18b','gravel'),floodplain:biome('Речная пойма','#8d8563','mud'),foothills:biome('Предгорья','#a08b70','gravel'),
  ocean:biome('Море','#234b72','water'),coast:biome('Побережье','#bcb08a','sand'),lake:biome('Озеро','#397b9b','water'),river:biome('Река','#559fb0','water'),
  plains:biome('Равнина','#78955c','grass','grass',.16),forest:biome('Умеренный лес','#466f49','grass','oak',.56),
  'shallow-water':biome('Мелководье','#65b7bd','water'),
  gravel:biome('Гравий','#9c9989','gravel'),
  square:biome('Площадь','#c1b49b','gravel'),park:biome('Парк','#54865c','grass'),
  rainforest:biome('Влажный тропический лес','#466f49','grass','palm',.68),taiga:biome('Тайга','#466f49','grass','pine',.46),
  savanna:biome('Саванна','#bea36b','grass','acacia',.18),desert:biome('Пустыня','#c6aa70','sand','cactus',.05),
  'cold-desert':biome('Холодная пустыня','#b1a58e','gravel','lichen',.04),wetland:biome('Болото','#65634a','peat','reed',.4),
  tundra:biome('Тундра','#b2b8b9','soil','lichen',.12),snow:biome('Снежная равнина','#e4ebef','snow','pine',.05),
  alpine:biome('Альпийский луг','#878d94','gravel','grass',.1),cliffs:biome('Скалы и утёсы','#7c8081','granite'),
  volcanic:biome('Вулканическое плато','#51444a','basalt'),badlands:biome('Эродированные плато','#9c6e59','sandstone','cactus',.025),
  'dry-cave':biome('Сухая пещера','#8b836e','gravel'),'lush-cave':biome('Заросшая пещера','#5e7963','mud','moss',.48),
  'fungal-cave':biome('Грибная пещера','#82708a','peat','mushroom',.5),'crystal-cave':biome('Кристальная полость','#8983aa','granite','crystal',.18),
  'karst-cave':biome('Карстовый зал','#b1ad91','limestone','stalagmite',.12),'ice-cave':biome('Ледяная пещера','#9ab9c7','ice','crystal',.1),
  'magma-cave':biome('Магматическая полость','#8a594d','basalt'),'underground-lake':biome('Подземное озеро','#406b8e','water'),
  'cave-wall':biome('Массив породы','#343e48','granite'),canopy:biome('Кроны и высокие ветви','#3f6850','timber'),
  'high-ledge':biome('Высотные уступы','#a6a192','granite'),void:biome('Нет поверхности на этом ярусе','#111b26','air')
});
const resource=(name,color,minDepth,maxDepth,hosts,weight)=>({name,color,minDepth,maxDepth,hosts,weight});
export const ATLAS_RESOURCES=Object.freeze({
  iron:resource('Железная руда','#b16e55',0,6,['granite','basalt','shale','limestone'],5),
  copper:resource('Медная руда','#ca8c58',0,4,['granite','basalt','slate','sandstone'],4),
  coal:resource('Уголь','#373941',0,4,['shale','sandstone','limestone'],4),
  tin:resource('Олово','#b4c3bd',0,3,['granite','slate','sandstone'],2),
  quartz:resource('Кварц','#e2d6dc',0,6,['granite','gneiss','slate'],3),
  salt:resource('Соль','#dfc9c2',0,3,['halite','limestone','shale'],2),
  silver:resource('Серебро','#bdc9d5',1,5,['granite','marble','slate'],2),
  gold:resource('Золото','#e9c76c',2,6,['granite','gneiss','slate'],1),
  uranium:resource('Урановая руда','#a7b26c',3,6,['granite','gneiss','basalt'],.7),
  gems:resource('Самоцветы','#8ec8ce',2,6,['marble','gneiss','obsidian'],.8),
  sulfur:resource('Сера','#d3ce6e',1,6,['basalt','obsidian'],1.5),
  oil:resource('Нефть','#443d49',0,3,['shale','sandstone','limestone'],1.2)
});
export const ATLAS_STRUCTURES=Object.freeze({ruins:'Заброшенные руины',tower:'Сторожевая башня',mine:'Старая шахта',camp:'Заброшенный лагерь',temple:'Разрушенное святилище',outpost:'Заброшенный форпост'});
export const ATLAS_EVENTS=Object.freeze({cache:'Запасы путешественника',survey:'Геологическая находка',shrine:'Древний алтарь',unstable:'Нестабильный пласт',contamination:'Заражённая стоянка'});
export const ATLAS_PRESETS=Object.freeze({
  temperate:{name:'Умеренный мир',terrain:{water:.28,relief:.6},climate:{temperature:.53,moisture:.58}},
  continents:{name:'Материки и моря',terrain:{water:.4,scale:60,relief:.6}},
  archipelago:{name:'Архипелаг',terrain:{water:.59,scale:27,relief:.45},layers:{above:0}},
  highlands:{name:'Горы и долины',terrain:{water:.16,relief:.95,terraces:6},climate:{temperature:.4}},
  desert:{name:'Пустыни и оазисы',terrain:{water:.08,relief:.5},climate:{temperature:.83,moisture:.18}},
  frozen:{name:'Северный мир',terrain:{water:.24,relief:.65},climate:{temperature:.15,moisture:.55}},
  volcanic:{name:'Вулканические земли',terrain:{water:.2,relief:.85},climate:{temperature:.75,moisture:.3},caves:{lavaDepth:1}},
  caverns:{name:'Пещерный мир',layers:{above:0,underground:4},caves:{style:'mixed',openness:.56},terrain:{water:.15}}
});
export const ATLAS_DEFAULTS=Object.freeze({
  autoTransports:NATURAL_TRANSPORT_DEFAULTS,landforms:LANDFORM_DEFAULTS,biomes:BIOME_DEFAULTS,
  layers:{above:1,underground:3,depthStep:24},
  terrain:{scale:40,water:.28,relief:.6,warp:.65,octaves:5,persistence:.52,blur:1,erosion:4,terraces:0},
  climate:{temperature:.53,moisture:.58,scale:36,latitude:0,wind:'west'},
  hydrology:{rivers:.55,lakes:.6,riverWidth:2,minLakeArea:4,floodplainWidth:2},geology:{scale:26,rocks:Object.keys(ATLAS_ROCKS)},
  caves:{style:'mixed',openness:.45,connectivity:.7,aquifers:.28,lavaDepth:3,tunnelRadius:1.6,branching:.5,smoothing:2},
  resources:{frequency:1,size:1,richness:1,types:Object.keys(ATLAS_RESOURCES),starter:true},
  structures:{density:.7,types:Object.keys(ATLAS_STRUCTURES),trails:true},
  ecology:{vegetation:1,blockingTrees:true},events:{density:.5,spawners:.35,threat:.5},
  playability:{safeRadius:4,minRegion:16}
});
export const ATLAS_REQUEST_TEMPLATE=Object.freeze({schema:'vland.atlas.request',schemaVersion:1,seed:42,preset:'temperate',width:96,height:80});
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
function only(v,keys,path){if(!object(v)||Object.keys(v).some(k=>!keys.includes(k)))throw new LabError('INVALID_ATLAS','Неизвестное поле или неверный объект: '+path);}
const finite=(v,min,max,integer=false)=>Number.isFinite(v)&&v>=min&&v<=max&&(!integer||Number.isInteger(v));
export function normalizeAtlasRequest(input){
  only(input,['schema','schemaVersion','seed','preset','width','height','origin','profile','topology','layerSettings','landscape',...Object.keys(ATLAS_DEFAULTS)],'atlas');
  if(input.schema!=='vland.atlas.request'||input.schemaVersion!==1)throw new LabError('INVALID_ATLAS','Нужен vland.atlas.request версии1.');
  let landscape;if(input.landscape!==undefined){try{landscape=normalizeLandscapeProfile(input.landscape);}catch(error){throw new LabError('INVALID_ATLAS',error.message);}}
  if(landscape&&input.preset!==undefined&&(typeof input.preset!=='string'||!Object.hasOwn(ATLAS_PRESETS,input.preset)))throw new LabError('INVALID_ATLAS','Неизвестный пресет atlas.');
  // Select the profile's preset before group defaults merge. Otherwise a second
  // normalization could introduce different preset-only cave/terrain settings.
  const preset=landscape?LANDSCAPE_BIOMES[landscape.baseBiome].preset:input.preset??'temperate';
  const r={schema:input.schema,schemaVersion:1,seed:input.seed??42,preset,width:input.width??96,height:input.height??80,origin:structuredClone(input.origin??{x:0,y:0}),profile:movementProfile(input.profile??'walker'),topology:normalizeTopology(input.topology)};
  if(!Object.hasOwn(ATLAS_PRESETS,r.preset)||!finite(r.seed,0,0xffffffff,true)||![r.width,r.height].every(n=>finite(n,16,300,true)))throw new LabError('INVALID_ATLAS','Seed uint32, стороны16–300 и известный пресет обязательны.');
  only(r.origin,['x','y'],'origin');if(![r.origin.x,r.origin.y].every(n=>finite(n,-1e6,1e6,true)))throw new LabError('INVALID_ATLAS','Origin: целые координаты ±1000000.');
  for(const [key,defaults]of Object.entries(ATLAS_DEFAULTS)){if(input[key]!==undefined)only(input[key],Object.keys(defaults),key);r[key]={...structuredClone(defaults),...ATLAS_PRESETS[r.preset][key],...structuredClone(input[key]??{})};}
  r.autoTransports=naturalTransportSettings(input.autoTransports);
  const rules={landforms:{direction:[0,359],strength:[0,1],featureScale:[.3,4],coastDetail:[0,1]},biomes:{transitionWidth:[0,12,true],coastWidth:[0,8,true],foothillWidth:[0,8,true]},layers:{above:[0,2,true],underground:[0,6,true],depthStep:[8,128,true]},terrain:{scale:[8,160],water:[0,.8],relief:[0,1],warp:[0,1],octaves:[1,6,true],persistence:[.1,.9],blur:[0,3],erosion:[0,16,true],terraces:[0,12,true]},climate:{temperature:[0,1],moisture:[0,1],scale:[8,160],latitude:[-1,1]},hydrology:{rivers:[0,1],lakes:[0,1],riverWidth:[1,5,true],minLakeArea:[1,128,true],floodplainWidth:[0,8,true]},geology:{scale:[8,96]},caves:{openness:[.2,.75],connectivity:[0,1],aquifers:[0,1],lavaDepth:[1,7,true],tunnelRadius:[1,4],branching:[0,1],smoothing:[0,5,true]},resources:{frequency:[0,3],size:[.3,3],richness:[.1,5]},structures:{density:[0,2]},ecology:{vegetation:[0,2]},events:{density:[0,2],spawners:[0,2],threat:[0,1]},playability:{safeRadius:[2,12,true],minRegion:[4,512,true]}};
  for(const[group,keys]of Object.entries(rules))for(const[key,args]of Object.entries(keys))if(!finite(r[group][key],...args))throw new LabError('INVALID_ATLAS','Вне диапазона: '+group+'.'+key);
  for(const[group,key]of [['resources','starter'],['structures','trails'],['ecology','blockingTrees']])if(typeof r[group][key]!=='boolean')throw new LabError('INVALID_ATLAS',group+'.'+key+': boolean.');
  for(const[group,key,catalog]of [['geology','rocks',ATLAS_ROCKS],['resources','types',ATLAS_RESOURCES],['structures','types',ATLAS_STRUCTURES]])if(!Array.isArray(r[group][key])||r[group][key].length>Object.keys(catalog).length||new Set(r[group][key]).size!==r[group][key].length||r[group][key].some(id=>!Object.hasOwn(catalog,id))||group==='geology'&&!r[group][key].length)throw new LabError('INVALID_ATLAS','Неверный список '+group+'.'+key);
  if(!['natural','island','archipelago','ridge','plateau','basin'].includes(r.landforms.pattern))throw new LabError('INVALID_ATLAS','Неизвестная крупная форма рельефа.');
  if(!['west','east','north','south'].includes(r.climate.wind)||!['mixed','chambers','tunnels','karst','fractured','lava-tubes','shafts','water-carved'].includes(r.caves.style))throw new LabError('INVALID_ATLAS','Неизвестный ветер или форма пещеры.');
  if(r.width*r.height*(1+r.layers.above+r.layers.underground)>ATLAS_MAX_CELLS||r.playability.minRegion>r.width*r.height)throw new LabError('ATLAS_TOO_LARGE','До98304 клеток суммарно по всем Z-срезам. Уменьшите размеры или количество ярусов.');
  if(r.preset==='caverns'&&!r.layers.underground)throw new LabError('INVALID_ATLAS','Пещерному миру нужен хотя бы один подземный ярус.');
  if(input.layerSettings!==undefined)r.layerSettings=normalizeLayerSettings(input.layerSettings,r.layers);
  // Check all explicitly supplied fields above before replacing profile-owned
  // climate means; malformed raw values must not disappear through an override.
  if(landscape){r.landscape=landscape;r.climate.temperature=LANDSCAPE_BIOMES[landscape.baseBiome].temperature;r.climate.moisture=LANDSCAPE_BIOMES[landscape.baseBiome].humidity;}
  return r;
}
