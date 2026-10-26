// Semantic content: adapters supply meshes, sprites, combat and resource values.
export const CONTENT_CATEGORIES = Object.freeze({
  scenery:'Декорация', destructible:'Разрушаемый объект', mechanism:'Устройство',
  container:'Хранилище', hazard:'Опасность', traversal:'Условный проход',
  encounter:'Боевой сценарий', objective:'Цель', service:'Сервис', discovery:'Секрет'
});
const type = (name,category,material,themes,interaction,destructible=false) =>
  Object.freeze({name,category,material,themes:Object.freeze(themes),interaction,destructible});
export const CONTENT_TYPES = Object.freeze({
  'research-console':type('Исследовательская установка','mechanism','metal',['sci-fi'],'inspect'),
  'glass-vials':type('Стойка с колбами','destructible','glass',['sci-fi'],'sample',true),
  'specimen-vat':type('Капсула с образцом','destructible','glass',['sci-fi'],'inspect',true),
  'power-cabinet':type('Распределительный шкаф','mechanism','metal',['sci-fi'],'power'),
  'supply-crate':type('Ящик припасов','container','wood',['sci-fi','ruins','caverns','fantasy','abstract'],'open',true),
  'rubble':type('Обломки перекрытия','destructible','stone',['ruins','caverns','fantasy'],'salvage',true),
  'ancient-tablet':type('Древняя табличка','discovery','stone',['ruins','fantasy'],'inspect'),
  'crystal-cluster':type('Скопление кристаллов','destructible','crystal',['caverns','fantasy'],'sample',true),
  'ritual-altar':type('Ритуальный алтарь','service','stone',['fantasy'],'inspect'),
  'broken-column':type('Поваленная колонна','scenery','stone',['ruins','fantasy'],'inspect'),
  'marker':type('Тематический объект','scenery','neutral',['abstract'],'inspect'),
  'drain-pump':type('Насос / отвод воды','mechanism','metal',[],'drain'),
  'ability-cache':type('Источник способности','traversal','neutral',[],'acquire')
});
export const GENRE_POLICIES = Object.freeze({
  'turn-based':Object.freeze({name:'Пошаговая игра',clock:'actions',cellsPerSecond:1,ability:'swim'}),
  metroidvania:Object.freeze({name:'Metroidvania',clock:'seconds',cellsPerSecond:3,ability:'dash'}),
  fps:Object.freeze({name:'FPS',clock:'seconds',cellsPerSecond:2,ability:'swim'}),
  'bullet-hell':Object.freeze({name:'Bullet hell',clock:'seconds',cellsPerSecond:3,ability:'phase'})
});
export const CONTENT_THEMES = Object.freeze(['sci-fi','ruins','caverns','fantasy','abstract']);
export const SETPIECE_DEFAULTS = Object.freeze({genre:'turn-based',theme:'sci-fi',propDensity:1,floodFrequency:.25,timedFrequency:.25,abilityFrequency:0});
export function thematicOptions(input={}) {
  const c={...SETPIECE_DEFAULTS,...input};
  if(!Object.hasOwn(GENRE_POLICIES,c.genre)||!CONTENT_THEMES.includes(c.theme))throw new Error('Неизвестный жанр или тема окружения.');
  if(!Number.isFinite(c.propDensity)||c.propDensity<0||c.propDensity>2)throw new Error('Плотность окружения: 0–2.');
  for(const k of ['floodFrequency','timedFrequency','abilityFrequency'])if(!Number.isFinite(c[k])||c[k]<0||c[k]>1)throw new Error(k+': 0–1.');
  return Object.fromEntries(Object.keys(SETPIECE_DEFAULTS).map(k=>[k,c[k]]));
}
