import {execute} from '../../../app/project.mjs';
self.onmessage=async({data})=>{try{self.postMessage({id:data.id,ok:true,result:await execute(data.operation,data.input)});}catch(e){self.postMessage({id:data.id,ok:false,error:{code:e.code??'ERROR',message:e.message,details:e.details??[]}});}};
