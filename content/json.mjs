import {ContentError,keys} from './common.mjs';
import {validateScene} from './generate.mjs';
const MAX_BYTES=24*1024*1024,READABLE_BYTES=1024*1024;
const bytes=text=>new TextEncoder().encode(text).length;
function documentText(value){try{return JSON.stringify(value);}catch{throw new ContentError('INVALID_JSON','Документ не представим в JSON.');}}
function checkSize(text){if(typeof text==='string'&&bytes(text)>MAX_BYTES)throw new ContentError('TOO_LARGE','JSON превышает 24 MiB.');}
export function serializeScene(scene){validateScene(scene);const document={schema:'vland.content.scene',schemaVersion:4,...scene},compact=documentText(document);checkSize(compact);if(bytes(compact)>READABLE_BYTES)return compact;const readable=JSON.stringify(document,null,2);return bytes(readable)<=MAX_BYTES?readable:compact;}
export function parseScene(input){
 checkSize(typeof input==='string'?input:documentText(input));
 let value;try{value=typeof input==='string'?JSON.parse(input.replace(/^\uFEFF/,'')):structuredClone(input);}catch{throw new ContentError('INVALID_JSON','Некорректный JSON.');}
 keys(value,['schema','schemaVersion','map','catalog','sources'],'content.scene');
 if(value.schema!=='vland.content.scene'||value.schemaVersion!==4)throw new ContentError('UNSUPPORTED_SCHEMA','Нужен vland.content.scene/4.');
 const {schema,schemaVersion,...scene}=value;return validateScene(scene);
}
