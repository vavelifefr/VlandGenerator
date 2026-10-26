// Authoring view deliberately reveals secret gates. The host decides when a
// player discovers them; no collision or gate state is changed by these marks.
export const GATE_STYLES=Object.freeze({
 secret:{name:'Секретная дверь',symbol:'?',color:'#d7a4ed',help:'Скрыта для игрока. В редакторе показана пунктиром.'},
 key:{name:'Замок с ключом',symbol:'К',color:'#e1c77b',help:'Открывается соответствующим ключом.'},
 lever:{name:'Дверь с рычагом',symbol:'Р',color:'#f0b67e',help:'Открывается связанным рычагом.'},
 breakable:{name:'Разрушаемый проход',symbol:'×',color:'#e29c89',help:'Открывается разрушением преграды.'},
 'one-way':{name:'Односторонний проход',symbol:'→',color:'#9fc9e5',help:'Направление указано в графе соединений.'}
});
