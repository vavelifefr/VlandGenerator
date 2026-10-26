export const SPAWNER_ACTIVATIONS=Object.freeze({proximity:'При приближении', 'room-entry':'Вход в комнату',lever:'Связанный рычаг',timer:'Таймер после входа'});
export const SPAWNER_REPEATS=Object.freeze({cycle:'Повторять все волны',last:'Повторять последнюю',once:'Только один раз'});
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
export function spawnerProgram(rule={}){
 const activation=rule.activation??{type:'proximity',delay:0},waves=rule.waves??[],repeat=rule.repeat??'cycle';
 if(!object(activation)||Object.keys(activation).some(k=>!['type','delay'].includes(k))||!Object.hasOwn(SPAWNER_ACTIVATIONS,activation.type)||!Number.isInteger(activation.delay??0)||(activation.delay??0)<0||(activation.delay??0)>60)throw new Error('Активация спавнера: приближение/вход/рычаг/таймер, задержка0–60.');
 if(activation.type!=='timer'&&(activation.delay??0)!==0)throw new Error('Задержка задаётся только для таймера спавнера.');
 if(!Object.hasOwn(SPAWNER_REPEATS,repeat)||!Array.isArray(waves)||waves.length>8)throw new Error('Спавнер: до8 волн, повтор cycle/last/once.');
 for(const wave of waves){
  if(!object(wave)||Object.keys(wave).some(k=>k!=='members')||!Array.isArray(wave.members)||!wave.members.length||wave.members.length>8)throw new Error('В каждой волне нужен состав:1–8 записей.');
  const seen=new Set();let count=0;for(const m of wave.members){if(!object(m)||Object.keys(m).some(k=>!['mobId','count'].includes(k))||typeof m.mobId!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,79}$/.test(m.mobId)||seen.has(m.mobId)||!Number.isInteger(m.count)||m.count<1||m.count>8)throw new Error('Состав волны: уникальный ID моба и целое количество1–8.');seen.add(m.mobId);count+=m.count;}
  if(count>8)throw new Error('В одной волне не больше8 мобов.');
 }
 return{activation:{type:activation.type,delay:activation.delay??0},waves:structuredClone(waves),repeat};
}
export function spawnerWave(rule,index){
 const {waves,repeat}=spawnerProgram(rule);if(!waves.length)return Array(rule.batch).fill(null);
 if(index>=waves.length&&repeat==='once')return null;
 const wave=waves[repeat==='last'?Math.min(index,waves.length-1):index%waves.length];
 return wave.members.flatMap(m=>Array(m.count).fill(m.mobId));
}
export function describeSpawner(rule,{mobName=id=>id}={}){
 const p=spawnerProgram(rule);return `${SPAWNER_ACTIVATIONS[p.activation.type]}${p.activation.type==='timer'?' · задержка '+p.activation.delay:''}; `+(p.waves.length?p.waves.map((w,i)=>`${i+1}: `+w.members.map(m=>`${mobName(m.mobId)} ×${m.count}`).join(', ')).join(' → ')+`; ${SPAWNER_REPEATS[p.repeat]}`:`по семейству, ${rule.batch} за волну`);
}
