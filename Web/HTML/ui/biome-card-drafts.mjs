// New cards and pending type edits stay UI-only until Add. Active shares can
// commit separately, retaining their confirmed type.
export function restoreBiomeDrafts(profile,saved){
 const rows=[],ids=new Set();for(const row of Array.isArray(saved)?saved.slice(0,64):[]){if(!row||typeof row.id!=='string'||!row.id.trim()||Array.from(row.id).length>64||ids.has(row.id)||typeof row.type!=='string'||!['string','number'].includes(typeof row.percent))continue;ids.add(row.id);rows.push({id:row.id,type:row.type,percent:String(row.percent)});}
 const confirmed=new Set((profile?.biomes??[]).map(card=>card.id));for(const card of profile?.biomes??[])if(!ids.has(card.id)){ids.add(card.id);rows.push({id:card.id,type:card.type,percent:String(card.percent)});}
 while(rows.length>64){const index=rows.findLastIndex(row=>!confirmed.has(row.id));if(index<0)break;rows.splice(index,1);}return rows;
}
export function confirmedBiomeDraft(profile,draft){const card=profile.biomes.find(c=>c.id===draft.id);return Boolean(card&&card.type===draft.type&&draft.percent!==''&&card.percent===Number(draft.percent));}
// Reserve confirmed shares until replaced, plus larger visible drafts. Integer
// tenths avoid rounding an available decimal share above the100percent budget.
export function biomeDraftLimit(profile,drafts,id){
 const reserved=new Map((profile.biomes??[]).map(c=>[c.id,Math.round(c.percent*10)]));
 for(const draft of drafts){const value=Number(draft.percent);if(draft.percent!==''&&Number.isFinite(value))reserved.set(draft.id,Math.max(reserved.get(draft.id)??0,Math.round(Math.max(0,Math.min(100,value))*10)));}
 reserved.delete(id);return Math.max(0,1000-[...reserved.values()].reduce((sum,n)=>sum+n,0))/10;
}
export function biomeDraftError(profile,draft,types){
 const percent=Number(draft.percent);if(!types.includes(draft.type)||draft.percent===''||!Number.isFinite(percent)||percent<0||percent>100||Math.abs(percent*10-Math.round(percent*10))>1e-7)return'Укажите биом и долю от0до100% с шагом0,1%.';
 const total=profile.biomes.filter(c=>c.id!==draft.id).reduce((n,c)=>n+c.percent,0)+percent;if(total>100.000001)return'Сумма добавленных биомов не должна превышать100%.';if(!profile.biomes.some(c=>c.id===draft.id)&&profile.biomes.length>=64)return'Не более64 добавленных биомов.';return'';
}
export function confirmBiomeDraft(profile,draft,types){const error=biomeDraftError(profile,draft,types);if(error)throw Error(error);const card={id:draft.id,type:draft.type,percent:Math.round(Number(draft.percent)*10)/10},index=profile.biomes.findIndex(c=>c.id===draft.id);if(index<0)profile.biomes.push(card);else profile.biomes[index]=card;return card;}
