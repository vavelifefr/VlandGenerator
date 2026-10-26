// Pure deterministic PRNG shared by the standalone generator and the game adapter.
export function seededRandom(seed){
 let value=seed>>>0;
 return()=>{value=(value+0x6d2b79f5)>>>0;let n=Math.imul(value^(value>>>15),value|1);n^=n+Math.imul(n^(n>>>7),n|61);return((n^(n>>>14))>>>0)/4294967296;};
}
export const pointKey=p=>p.x+':'+p.y;
export const DIRECTIONS=Object.freeze([[0,-1],[1,0],[0,1],[-1,0]].map(Object.freeze));
