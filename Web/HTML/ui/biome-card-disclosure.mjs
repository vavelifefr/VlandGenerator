// View-only state, keyed by stable biome IDs rather than mutable row indexes.
export function captureBiomeCardDisclosure(container){
 return [...container.querySelectorAll('[data-biome-card]')].map(card=>({id:card.dataset.biomeCard,open:Boolean(card.open)}));
}
export function restoreBiomeCardDisclosure(container,saved){
 if(!Array.isArray(saved))return;
 const byId=new Map(saved.filter(value=>value&&typeof value.id==='string'&&typeof value.open==='boolean').map(value=>[value.id,value.open]));
 for(const card of container.querySelectorAll('[data-biome-card]'))if(byId.has(card.dataset.biomeCard))card.open=byId.get(card.dataset.biomeCard);
}
