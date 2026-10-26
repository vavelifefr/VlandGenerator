// Shared JSON document serialization for browser downloads and CLI output.
import {ContentError} from '../content/common.mjs';
const BYTE_BUDGETS=new Map([['vland.recipe',1024*1024],['vland.project',24*1024*1024],['vland.runtime',24*1024*1024],['vland.project.context',128*1024]]);
export function serializeDocument(value){
 const compact=JSON.stringify(value);if(typeof compact!=='string')throw new Error('Нет документа JSON для экспорта.');
 const bytes=text=>new TextEncoder().encode(text).byteLength,limit=value?.schemaVersion===4?(BYTE_BUDGETS.get(value.schema)??Infinity):Infinity,compactBytes=bytes(compact);
 if(compactBytes>limit)throw new ContentError('TOO_LARGE','Документ превышает допустимый размер экспорта.');
 // Do not allocate an expanded copy of a large map: it can exceed its own import limit.
 let text=value?.schema==='vland.project.context'||compactBytes>1024*1024?compact:JSON.stringify(value,null,2),size=bytes(text);if(size>limit){text=compact;size=compactBytes;}
 return text+(size<limit?'\n':'');
}
