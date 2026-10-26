function canonical(v) {if(Array.isArray(v))return'['+v.map(canonical).join(',')+']';if(v&&typeof v==='object')return'{'+Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';return JSON.stringify(v);}
// Reproducibility checksum, not a cryptographic signature or an authenticity check.
export function fingerprint(value) {let n=2166136261;for(const c of canonical(value)){n^=c.charCodeAt(0);n=Math.imul(n,16777619);}return(n>>>0).toString(16).padStart(8,'0');}
