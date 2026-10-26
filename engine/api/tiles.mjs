import {collisionWalls} from './navigation.mjs';
import {validateDungeon} from './serialization.mjs';
import {LabError} from './config.mjs';
export function exportTileGrid(value,state={}) {
  const report=validateDungeon(value);if(!report.ok)throw new LabError('INVALID_JSON',report.errors.join(' '));
  const level=value.level??value,{width,height}=level.board,size=width*height,terrain=Array(size).fill(1),roomIds=Array(size).fill(null),index=p=>p.y*width+p.x;
  for(const w of level.board.walls)terrain[index(w)]=w.type==='door'?3:w.type==='internal'?2:0;
  for(const room of level.rooms)for(const p of room.floorTiles)roomIds[index(p)]=room.id;
  for(const f of level.features)for(const p of f.cells)roomIds[index(p)]=f.roomId;
  const walls=collisionWalls(value,state),walkable=Array.from({length:size},(_,i)=>walls.has(`${i%width}:${Math.floor(i/width)}`)?0:1);
  return{schema:'vland.tiles',schemaVersion:1,seed:level.seed,width,height,origin:{x:0,y:0},cellSize:1,order:'row-major',legend:{0:'indestructible',1:'floor',2:'destructible',3:'closed-door'},terrain,walkable,roomIds,spawn:structuredClone(level.spawn),exit:structuredClone(level.rooms.find(r=>r.id===level.plan.finalId).core),transportLinks:structuredClone(level.transportLinks??[]),gates:structuredClone(level.gates),mechanisms:structuredClone(level.mechanisms),rooms:level.rooms.map(r=>({id:r.id,x:r.x,y:r.y,width:r.width,height:r.height,shape:r.shape,...(r.notch?{notch:structuredClone(r.notch)}:{})})),content:structuredClone(value.content??null),state:structuredClone(state),note:'terrain — исходный материал. walkable учитывает переданное состояние дверей/разрушения; i=y*width+x. Размер спрайтов задаёт движок игры.'};
}
