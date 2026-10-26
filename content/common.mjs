export const CONTENT_VERSION=4;
import {CATEGORIES} from './taxonomy.mjs';
export {CATEGORIES};
export const ENVIRONMENTS=Object.freeze({land:'Суша',underground:'Подземелье',freshwater:'Пресная вода',saltwater:'Морская вода',air:'Воздух'});
export const CHANNELS=['solid','prop','actor','cover','subsurface','air','trigger'];
export const LIMITS=Object.freeze({catalog:256,sources:256,rulesPerSource:16,entriesPerRule:16,emissions:12000,maskCells:250000,totalMaskCells:2000000,propertiesBytes:8192});
export class ContentError extends Error{constructor(code,message,details=[]){super(message);this.name='ContentError';this.code=code;this.details=details;}}
export function object(value,path){if(!value||typeof value!=='object'||Array.isArray(value))throw new ContentError('INVALID_INPUT',path+': нужен объект.');return value;}
export function keys(value,allowed,path){object(value,path);for(const k of Object.keys(value))if(!allowed.includes(k))throw new ContentError('UNKNOWN_FIELD',path+'.'+k+': неизвестное поле.');}
export function number(v,min,max,path,integer=false){if(!Number.isFinite(v)||v<min||v>max||integer&&!Number.isInteger(v))throw new ContentError('INVALID_NUMBER',`${path}: ${integer?'целое ':''}${min}–${max}.`);return v;}
export function id(v,path='id'){if(typeof v!=='string'||!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(v)||['__proto__','prototype','constructor'].includes(v))throw new ContentError('INVALID_ID',path+': неверный идентификатор.');return v;}
export function text(v,path,max=100){if(typeof v!=='string'||!v.trim()||v.length>max)throw new ContentError('INVALID_TEXT',path+': 1–'+max+' символов.');return v;}
export const compare=(a,b)=>a<b?-1:a>b?1:0;
export function stable(value){if(Array.isArray(value))return'['+value.map(stable).join(',')+']';if(value&&typeof value==='object')return'{'+Object.keys(value).filter(k=>value[k]!==undefined).sort(compare).map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';return JSON.stringify(value);}
export function hash(value){let n=2166136261;for(const c of stable(value)){n=Math.imul(n^c.charCodeAt(0),16777619)>>>0;}return n.toString(16).padStart(8,'0');}
export const seedOf=(seed,...parts)=>parseInt(hash([seed,...parts]),16)>>>0;
export const roll=(seed,...parts)=>seedOf(seed,...parts)/4294967296;
export function jsonValue(v,path='properties',limit=LIMITS.propertiesBytes){let s;try{s=JSON.stringify(v,(_,x)=>{if(typeof x==='number'&&!Number.isFinite(x)||typeof x==='function'||typeof x==='bigint'||typeof x==='undefined')throw new Error();return x;});}catch{throw new ContentError('INVALID_JSON_VALUE',path+': нужны конечные JSON-значения.');}if(!s||new TextEncoder().encode(s).length>limit)throw new ContentError('TOO_LARGE',path+': превышен бюджет JSON.');return v;}
export function category(v){if(!Object.hasOwn(CATEGORIES,v))throw new ContentError('INVALID_CATEGORY','Категория: '+Object.keys(CATEGORIES).join(', ')+'.');return v;}
