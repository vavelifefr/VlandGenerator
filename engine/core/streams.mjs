// FNV-1a over UTF-8 JSON tuple. Stable across browser/Node and request order.
export function deriveStageSeed(seed,regionId,stageId,version='1'){
 if(!Number.isInteger(seed)||seed<0||seed>0xffffffff||![regionId,stageId,version].every(s=>typeof s==='string'&&s.length>0&&s.length<=128))throw new Error('Stage seed: uint32 seed и непустые имена до128 символов.');
 let n=2166136261;for(const byte of new TextEncoder().encode(JSON.stringify([seed,version,regionId,stageId]))){n^=byte;n=Math.imul(n,16777619);}return n>>>0;
}
