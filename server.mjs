import http from 'node:http';
import {readFile,writeFile,mkdir,rename,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {Worker} from 'node:worker_threads';
import {API_CONTRACT} from './app/contracts.mjs';
import {createSessionStore} from './tools/session-store.mjs';
import {attachSessionPresence} from './tools/session-presence.mjs';
const ROOT=path.dirname(fileURLToPath(import.meta.url)),MAX=24*1024*1024;
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.md':'text/plain; charset=utf-8','.svg':'image/svg+xml'};
const digest=data=>createHash('sha256').update(data).digest('hex');
export function createVlandServer({root=ROOT}={}){
 let running=0;const locks=new Set(),session=createSessionStore(root);
 const run=(operation,input)=>new Promise((resolve,reject)=>{
  if(running>=2){reject(Object.assign(new Error('Заняты оба рабочих процесса. Повторите запрос позже.'),{code:'BUSY',status:429}));return;}running++;
  const worker=new Worker(new URL('./tools/api-worker.mjs',import.meta.url),{workerData:{operation,input}});let done=false;
  const finish=(error,value)=>{if(done)return;done=true;running--;clearTimeout(timer);worker.terminate();error?reject(error):resolve(value);};
  const timer=setTimeout(()=>finish(Object.assign(new Error('Превышено время операции (60 секунд).'),{code:'TIMEOUT',status:408})),60000);
  worker.once('message',m=>m.ok?finish(null,m.result):finish(Object.assign(new Error(m.error.message),m.error)));worker.once('error',finish);worker.once('exit',code=>{if(!done)finish(new Error('Рабочий процесс завершился: '+code));});
 });
 const json=(res,status,value,extra={})=>{res.writeHead(status,{'Content-Type':types['.json'],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra});res.end(JSON.stringify(value));};
 const body=async req=>{const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>MAX)throw Object.assign(new Error('Тело запроса больше 24 MiB.'),{code:'TOO_LARGE',status:413});chunks.push(c);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Object.assign(new Error('Не удалось прочитать JSON.'),{code:'INVALID_JSON',status:400});}};
 const server=http.createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://localhost'),pathname=decodeURIComponent(url.pathname),origin=req.headers.origin;
   if(origin&&origin!==`http://${req.headers.host}`&&origin!==`https://${req.headers.host}`)throw Object.assign(new Error('Запрос из другого origin не разрешён.'),{code:'ORIGIN_DENIED',status:403});
   if(pathname==='/api/contract'&&req.method==='GET')return json(res,200,API_CONTRACT);
   if(pathname==='/api/health'&&req.method==='GET')return json(res,200,{ok:true,name:'VlandGenerator',version:API_CONTRACT.version});
   const sessionAction=pathname.match(/^\/api\/session\/(open|save|heartbeat|release)$/)?.[1];
   if(sessionAction&&req.method==='POST')return json(res,200,await session[sessionAction](await body(req)));
   if(pathname==='/api/defaults'&&req.method==='GET')return json(res,200,await run('defaults',{mode:url.searchParams.get('mode')??'dungeon'}));
   if(pathname==='/api/projects'&&req.method==='GET'){
    await mkdir(path.join(root,'projects'),{recursive:true});const files=(await readdir(path.join(root,'projects'))).filter(f=>/^[a-zA-Z][a-zA-Z0-9_-]{0,63}\.json$/.test(f));
    const projects=[];for(const file of files){try{const data=await readFile(path.join(root,'projects',file)),p=JSON.parse(data);projects.push({id:file.slice(0,-5),title:p.recipe.title,mode:p.recipe.mode,revision:digest(data)});}catch{projects.push({id:file.slice(0,-5),error:'Не удалось прочитать проект.'});}}return json(res,200,{projects});
   }
   const saved=pathname.match(/^\/api\/projects\/([a-zA-Z][a-zA-Z0-9_-]{0,63})$/);
   if(saved){const id=saved[1],file=path.join(root,'projects',id+'.json');if(['constructor','prototype','__proto__'].includes(id))throw new Error('Недопустимый ID.');
    if(req.method==='GET'){const data=await readFile(file);return json(res,200,{project:JSON.parse(data),revision:digest(data)});}
    if(req.method==='PUT'){
     const data=await body(req);await run('import',{project:data.project});if(locks.has(id))throw Object.assign(new Error('Проект уже сохраняется.'),{code:'SAVE_CONFLICT',status:409});locks.add(id);
     try{let current=null;try{current=digest(await readFile(file));}catch(e){if(e.code!=='ENOENT')throw e;}
      if((data.expectedRevision??null)!==current)throw Object.assign(new Error('Файл изменился. Откройте текущую версию или сохраните с другим именем.'),{code:'SAVE_CONFLICT',status:409});
      await mkdir(path.dirname(file),{recursive:true});const text=JSON.stringify(data.project)+'\n',tmp=file+'.tmp-'+process.pid;await writeFile(tmp,text,'utf8');await rename(tmp,file);return json(res,200,{ok:true,id,revision:digest(text)});
     }finally{locks.delete(id);}
    }
   }
   const operation=pathname.match(/^\/api\/(export|raster-export|diagnose|generate-base|landscape-rebuild|validate|edit|source-preview|distribution-preview|distribution-apply|runtime-init|runtime-plan|runtime-commit|runtime-update|transition-resolve|runtime|import)$/)?.[1];
   if(operation&&req.method==='POST')return json(res,200,await run(operation,await body(req)));
   if(pathname.startsWith('/api/'))return json(res,404,{error:{code:'NOT_FOUND',message:'Операция API не найдена.'}});
   if(!['GET','HEAD'].includes(req.method))return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'Недопустимый метод.'}});
   const name=['/','/Web','/Web/'].includes(pathname)?'Web/index.html':pathname.slice(1),parts=name.replaceAll('\\','/').split('/');
   if(parts.some(p=>p==='..'||p.startsWith('.')||['projects','tests','tools'].includes(p))||pathname.includes('\0'))return json(res,403,{error:{code:'FORBIDDEN',message:'Доступ запрещён.'}});
   const file=path.resolve(root,name);if(!file.startsWith(path.resolve(root)+path.sep))throw new Error('Недопустимый путь.');
   const data=await readFile(file),ext=path.extname(file),socketOrigin='ws://'+new URL('http://'+req.headers.host).host;res.writeHead(200,{'Content-Type':types[ext]??'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; worker-src 'self'; connect-src 'self' "+socketOrigin+"; object-src 'none'; base-uri 'self'; frame-ancestors 'self'"});res.end(req.method==='HEAD'?undefined:data);
  }catch(e){if(!res.headersSent)json(res,e.status??(e.code==='ENOENT'?404:400),{error:{code:e.code??'ERROR',message:e.message,details:e.details??[]}});else res.end();}
 });attachSessionPresence(server,session);return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const port=Number(process.env.PORT??9670),host=process.env.HOST??'127.0.0.1';createVlandServer().listen(port,host,()=>console.log(`VlandGenerator: http://${host}:${port}/`));}
