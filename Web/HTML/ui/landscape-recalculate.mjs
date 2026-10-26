// A queued result belongs to both its draft generation and its original project.
export function landscapeRecalculator({snapshot,build,apply,onError,delay=450,setTimer=setTimeout,clearTimer=clearTimeout}){
 let timer=null,generation=0;
 function cancel(){generation++;if(timer!==null)clearTimer(timer);timer=null;}
 function schedule(){
  cancel();const ticket=generation;
  timer=setTimer(async()=>{
   timer=null;const captured=snapshot();if(!captured?.project)return;
   try{
    const result=await build(captured);
    if(ticket!==generation||snapshot()?.project?.checksum!==captured.project.checksum)return;
    await apply(result,captured);
   }catch(error){if(ticket===generation)onError(error);}
  },delay);
 }
 return {schedule,cancel};
}
