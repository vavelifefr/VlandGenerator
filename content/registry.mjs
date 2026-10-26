import {CATEGORIES,ENVIRONMENTS,CHANNELS,LIMITS,ContentError,keys,number,id,text,jsonValue} from './common.mjs';
export const CONSTRAINT_FIELDS=['allowedTerrain','excludedTerrain','allowedEnvironments','allowedBiomes','allowedLevels','allowedLayerKinds','allowedRocks','minDepth','maxDepth','requiresWalkable','requiresEmptyTile','conditions'];
export function validateConstraints(c,path='constraints'){
 keys(c,CONSTRAINT_FIELDS,path);for(const k of ['allowedTerrain','excludedTerrain','allowedEnvironments','allowedBiomes','allowedLevels','allowedLayerKinds','allowedRocks'])if(c[k]!==undefined&&(!Array.isArray(c[k])||c[k].length>64||new Set(c[k]).size!==c[k].length||c[k].some(x=>typeof x!=='string'||!x.length||x.length>64)))throw new ContentError('INVALID_CONSTRAINT',path+'.'+k+': список до 64 уникальных ID.');
 if(c.allowedEnvironments?.some(e=>!Object.hasOwn(ENVIRONMENTS,e)))throw new ContentError('INVALID_CONSTRAINT','Неизвестная среда.');
 for(const k of ['requiresWalkable','requiresEmptyTile'])if(c[k]!==undefined&&typeof c[k]!=='boolean')throw new ContentError('INVALID_CONSTRAINT',path+'.'+k+': boolean.');
 if(c.minDepth!==undefined)number(c.minDepth,0,100000,path+'.minDepth');if(c.maxDepth!==undefined)number(c.maxDepth,c.minDepth??0,100000,path+'.maxDepth');
 if(c.conditions!==undefined){if(!Array.isArray(c.conditions)||c.conditions.length>16)throw new ContentError('INVALID_CONSTRAINT','До 16 числовых условий.');for(const condition of c.conditions){keys(condition,['field','min','max'],'condition');id(condition.field,'condition.field');number(condition.min,-1e9,1e9,'condition.min');number(condition.max,condition.min,1e9,'condition.max');}}
 return c;
}
export function validateCatalog(catalog){
 if(!Array.isArray(catalog)||catalog.length>LIMITS.catalog)throw new ContentError('INVALID_CATALOG','Каталог: до '+LIMITS.catalog+' определений.');const ids=new Set();
 for(const e of catalog){keys(e,['id','name','category','type','subtype','color','glyph','footprint','blocking','channel','constraints','properties'],'catalog');id(e.id);if(ids.has(e.id))throw new ContentError('DUPLICATE_ID','Повтор определения '+e.id);ids.add(e.id);text(e.name,'name');id(e.type,'type');id(e.subtype,'subtype');if(!Object.hasOwn(CATEGORIES,e.category)||!CHANNELS.includes(e.channel)||!/^#[a-fA-F0-9]{6}$/.test(e.color)||typeof e.glyph!=='string'||e.glyph.length>4||typeof e.blocking!=='boolean')throw new ContentError('INVALID_CATALOG','Неверное определение '+e.id);
  keys(e.footprint,['width','height'],'footprint');for(const k of ['width','height'])number(e.footprint[k],1,8,'footprint.'+k,true);validateConstraints(e.constraints);keys(e.properties,Object.keys(e.properties??{}),'properties');jsonValue(e.properties);
  if(e.channel==='subsurface'&&(e.category!=='resources'||e.blocking))throw new ContentError('INVALID_CATALOG','Подземная залежь должна быть неблокирующим ресурсом.');
 }
 return catalog;
}
