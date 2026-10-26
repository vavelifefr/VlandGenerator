import {createHash} from 'node:crypto';

// A control-only WebSocket: no map data, subscriptions, or application messages.
// Its TCP lifetime covers abrupt tab closure when pagehide/sendBeacon is lost.
export function attachSessionPresence(server,session){
 const sockets=new Set();
 server.on('upgrade',async(req,socket,head)=>{
  const reject=status=>{socket.end('HTTP/1.1 '+status+'\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');};
  socket.on('error',()=>{});
  try{
   const url=new URL(req.url,'http://localhost'),origin=req.headers.origin,key=req.headers['sec-websocket-key'];
   if(url.pathname!=='/api/session/presence')return reject('404 Not Found');
   if(sockets.size>=32)return reject('429 Too Many Requests');
   if(origin!==`http://${req.headers.host}`&&origin!==`https://${req.headers.host}`)return reject('403 Forbidden');
   if(req.method!=='GET'||req.headers.upgrade?.toLowerCase()!=='websocket'||!req.headers.connection?.toLowerCase().split(/\s*,\s*/).includes('upgrade')||req.headers['sec-websocket-version']!=='13'||typeof key!=='string'||!/^[A-Za-z0-9+/]{22}==$/.test(key))return reject('400 Bad Request');
   if([...url.searchParams.keys()].some(k=>!['sessionId','clientId','pageId'].includes(k)))return reject('400 Bad Request');
   const release=await session.presence(Object.fromEntries(url.searchParams));
   let released=false,buffer=Buffer.alloc(0),alive=true;
   const finish=()=>{if(released)return;released=true;clearInterval(ping);sockets.delete(socket);release().catch(()=>{});};
   const close=code=>{if(!socket.destroyed){const frame=Buffer.alloc(4);frame[0]=0x88;frame[1]=2;frame.writeUInt16BE(code,2);socket.end(frame);}finish();};
   const receive=data=>{
    buffer=Buffer.concat([buffer,data]);if(buffer.length>4096)return close(1009);
    while(buffer.length>=2){
     const opcode=buffer[0]&15,length=buffer[1]&127;
     if((buffer[0]&0xf0)!==0x80||!(buffer[1]&128)||length>125||![8,9,10].includes(opcode))return close(1002);
     if(buffer.length<6+length)return;
     const payload=Buffer.from(buffer.subarray(6,6+length)),mask=buffer.subarray(2,6);for(let i=0;i<length;i++)payload[i]^=mask[i%4];buffer=buffer.subarray(6+length);
     if(opcode===8){
      if(length===1)return close(1002);
      if(length>=2){const code=payload.readUInt16BE(0);if(!((code>=1000&&code<=1014&&![1004,1005,1006].includes(code))||(code>=3000&&code<=4999)))return close(1002);try{new TextDecoder('utf-8',{fatal:true}).decode(payload.subarray(2));}catch{return close(1007);}}
      socket.end(Buffer.concat([Buffer.from([0x88,length]),payload]));finish();return;
     }
     if(opcode===9)socket.write(Buffer.concat([Buffer.from([0x8a,length]),payload]));
     if(opcode===10)alive=true;
    }
   };
   const ping=setInterval(()=>{if(!alive)return socket.destroy();alive=false;socket.write(Buffer.from([0x89,0]));},30000);ping.unref();
   sockets.add(socket);socket.on('close',finish);socket.on('end',()=>{finish();socket.end();});socket.on('data',receive);socket.setNoDelay(true);
   if(socket.destroyed){finish();return;}
   const accept=createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
   socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');
   if(head.length)receive(head);
  }catch{reject('409 Conflict');}
 });
 server.on('close',()=>{for(const socket of sockets)socket.destroy();});
}
