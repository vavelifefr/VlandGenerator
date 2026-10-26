// Optional browser-pixel QA. Uses an existing external Playwright installation,
// an isolated headless context and a read-only module server; no working session.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const modulePath=process.env.VLAND_PLAYWRIGHT_MODULE;
if(!modulePath)throw Error('Set VLAND_PLAYWRIGHT_MODULE to an existing Playwright index.mjs.');
const phase='after',
 {chromium}=await import(pathToFileURL(modulePath)),root=fileURLToPath(new URL('../',import.meta.url)),report={ok:false,phase,headless:true,isolated:true,workingSessionUntouched:true,cases:[],actual:[]};
const server=createServer(async(req,res)=>{try{
 const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1);
 if(!relative){res.setHeader('Content-Type','text/html');res.end('<!doctype html><style>body{margin:0}#stage{position:relative}canvas{width:100%;height:100%;display:block}</style><div id="stage"><canvas></canvas></div>');return;}
 assert.match(relative,/^(Web\/HTML\/ui|app|content|engine)\/[\w./-]+\.mjs$/);const file=path.resolve(root,relative);assert.ok(file.startsWith(root));assert.ok(!relative.includes('/fixtures/'));
 res.setHeader('Content-Type','text/javascript');res.end(await readFile(file));
 }catch{res.writeHead(404);res.end();}});
let browser;
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({headless:true});
 for(const width of [360,1100])for(const dpr of [1,2])for(const scenario of [{size:300,zoom:null},{size:128,zoom:8},{size:128,zoom:16}]){
  const context=await browser.newContext({viewport:{width,height:800},deviceScaleFactor:dpr}),page=await context.newPage();
  try{
   await page.goto('http://127.0.0.1:'+server.address().port);
   const result=await page.evaluate(async({width,dpr,scenario})=>{
    const {drawHexMap,hexExtent,hexPosition,hexCell}=await import('/Web/HTML/ui/hex-render.mjs'),{cellColor}=await import('/app/raster.mjs');
    const stage=document.querySelector('#stage'),canvas=document.querySelector('canvas'),height=width===360?360:800;stage.style.width=width+'px';stage.style.height=height+'px';
    const size=scenario.size,n=size*size,l={id:'surface',width:size,height:size,topology:{kind:'hex'},solid:Array(n).fill(0),material:Array(n).fill('water'),water:Array(n).fill('sea'),biome:Array(n).fill('ocean'),traits:Array(n).fill('normal'),objects:[]},extent=hexExtent(l),scale=scenario.zoom??Math.min((width-16)/extent.width,(height-16)/extent.height),
     map={canvas,ctx:canvas.getContext('2d'),layer:l,scale,offset:{x:(width-extent.width*scale)/2,y:(height-extent.height*scale)/2},channel:'water',palette:{},showTerrain:true,grid:false,showSources:false,sources:[],catalog:new Map(),selection:null,hover:null,transportLinks:[]};
    const started=performance.now();drawHexMap(map);const elapsedMs=performance.now()-started,panMs=[];for(let k=0;k<5;k++){map.offset.x+=.37;map.offset.y+=.23;const start=performance.now();drawHexMap(map);panMs.push(performance.now()-start);}const expected=cellColor(l,0,'water'),pixels=map.ctx.getImageData(0,0,canvas.width,canvas.height),colors=new Set();let maxDeviation=0,samples=0;
    const left=Math.max(Math.ceil(canvas.width*.2),Math.ceil((map.offset.x+extent.width*scale*.2)*dpr)),right=Math.min(Math.floor(canvas.width*.8),Math.floor((map.offset.x+extent.width*scale*.8)*dpr)),top=Math.max(Math.ceil(canvas.height*.2),Math.ceil((map.offset.y+extent.height*scale*.2)*dpr)),bottom=Math.min(Math.floor(canvas.height*.8),Math.floor((map.offset.y+extent.height*scale*.8)*dpr));
    for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){const i=(y*canvas.width+x)*4,rgb=[...pixels.data.subarray(i,i+3)];for(let c=0;c<3;c++)maxDeviation=Math.max(maxDeviation,Math.abs(rgb[c]-expected[c]));colors.add(rgb.join(','));samples++;}
    let picking=true;for(const p of [{x:0,y:0},{x:size-1,y:size-1},{x:Math.floor(size/2),y:Math.floor(size/2)+1},{x:Math.floor(size/2)+1,y:Math.floor(size/2)}]){const q=hexCell(...Object.values(hexPosition(p)),l);picking&&=q?.x===p.x&&q?.y===p.y;}
    const {MapCanvas}=await import('/Web/HTML/ui/canvas.mjs'),point={x:Math.floor(size/2),y:Math.floor(size/2)},center=hexPosition(point),i=point.y*size+point.x,
     readCenter=()=>[...map.ctx.getImageData(Math.floor((map.offset.x+center.x*scale)*dpr),Math.floor((map.offset.y+center.y*scale)*dpr),1,1).data.subarray(0,3)],equal=(a,b)=>a.every((v,k)=>v===b[k]),invalidation={};
    map.palette={water:{sea:'#aabbcc'}};drawHexMap(map);invalidation.palette=equal(readCenter(),[170,187,204]);
    map.palette.water.sea='#112233';drawHexMap(map);invalidation.mutatedPalette=equal(readCenter(),[17,34,51]);
    map.channel='biome';drawHexMap(map);invalidation.channel=equal(readCenter(),cellColor(l,i,'biome'));
    map.channel='water';map.palette={};map.draw=()=>drawHexMap(map);
    const replacement={...l,water:Array(n).fill('river'),material:[...l.material]};MapCanvas.prototype.set.call(map,replacement,[],false);
    invalidation.layerSet=equal(readCenter(),cellColor(replacement,i,'water'));
    replacement.water[i]='lake';MapCanvas.prototype.set.call(map,replacement,[],false);invalidation.editedLayerSet=equal(readCenter(),cellColor(replacement,i,'water'));
    replacement.material[i]='air';MapCanvas.prototype.set.call(map,replacement,[],false);invalidation.airTransparent=equal(readCenter(),[11,19,24]);
    MapCanvas.prototype.set.call(map,l,[],false);
    return{width,dpr,size,scale,expected,samples,colors:colors.size,maxDeviation,elapsedMs,panMs,picking,invalidation};
   },{width,dpr,scenario});report.cases.push(result);
   await page.screenshot({path:path.join(root,`evidence/hex-render-seams-${phase}-${width}-${dpr}-${scenario.size}-${scenario.zoom??'fit'}.png`)});
  }finally{await context.close();}
 }
 for(const width of [360,1100]){
  const context=await browser.newContext({viewport:{width,height:width===360?360:800},deviceScaleFactor:1}),page=await context.newPage();
  try{
   await page.goto('http://127.0.0.1:'+server.address().port);
   const actual=await page.evaluate(async width=>{
    const {createRecipe,generateBase,materialize}=await import('/app/index.mjs'),{MapCanvas}=await import('/Web/HTML/ui/canvas.mjs'),stage=document.querySelector('#stage');stage.style.width=width+'px';stage.style.height=(width===360?360:800)+'px';
    const r=await createRecipe('hexlandscape');r.seed=42;Object.assign(r.generation,{width:300,height:300,layers:{above:0,underground:0},landscape:{structure:'coast',baseBiome:'forest',landPercent:75,uniformity:50,biomes:[{id:'m',type:'mountains',percent:20},{id:'s',type:'swamp',percent:10},{id:'g',type:'meadow',percent:25}]}});
    const p=await generateBase(r),[l]=await materialize(p),map=new MapCanvas(document.querySelector('canvas'),{});map.showSources=false;map.grid=false;map.transportLinks=p.source.links;map.set(l,p.catalog,true);await new Promise(requestAnimationFrame);return{width,mode:r.mode,size:300,seed:r.seed,checksum:p.checksum,landPercent:75,uniformity:50,navigation:p.source.navigation.ok,access:p.source.access.ok};
   },width);report.actual.push(actual);await page.screenshot({path:path.join(root,`evidence/hex-render-seams-actual-${width}.png`)});
  }finally{await context.close();}
 }
 assert.equal(report.cases.length,12);for(const c of report.cases){assert.ok(c.picking);assert.equal(c.maxDeviation,0,`Uniform sea must have no internal background seams at ${c.width}px DPR${c.dpr}: ${c.colors} colors`);assert.equal(c.colors,1);assert.ok(Math.max(...c.panMs)<250,'Warm panning must not take hundreds of milliseconds');for(const[name,value]of Object.entries(c.invalidation))assert.ok(value,`${name} must refresh terrain colors at ${c.width}px DPR${c.dpr} scale${c.scale}`);}
 report.ok=true;console.log(JSON.stringify(report));
}catch(error){report.error=error.message;throw error;}
finally{await writeFile(path.join(root,'evidence/hex-render-seams.json'),JSON.stringify(report,null,2)+'\n');if(browser)await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
