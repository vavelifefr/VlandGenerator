// One correlation length drives relief, climate and selected biome territories.
// The midpoint preserves the existing Surface profile. This is a spatial scale,
// not additional white noise, a biome quota or a change to the land/sea mask.
export const landscapeUniformity=r=>r.landscape?.uniformity??50;
export const landscapeFieldScale=r=>2**((50-landscapeUniformity(r))/45);
