import {parentPort,workerData} from 'node:worker_threads';
import {execute} from '../app/project.mjs';
try{parentPort.postMessage({ok:true,result:await execute(workerData.operation,workerData.input)});}catch(e){parentPort.postMessage({ok:false,error:{code:e.code??'ERROR',message:e.message,details:e.details??[]}});}
