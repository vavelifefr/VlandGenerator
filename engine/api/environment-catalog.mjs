export const LIGHT_TYPES=Object.freeze({
 'wall-torch':{name:'Настенный факел',mount:'wall',height:1.8,cone:180,themes:['fantasy','ruins','caverns']},
 'wall-projector':{name:'Настенный прожектор',mount:'wall',height:2.4,cone:90,themes:['sci-fi','abstract']},
 window:{name:'Окно',mount:'wall',height:1.5,cone:120,themes:['sci-fi','fantasy','ruins']},
 'ceiling-lamp':{name:'Потолочный светильник',mount:'ceiling',height:3,cone:360,themes:['sci-fi','abstract','caverns','ruins']},
 chandelier:{name:'Люстра',mount:'ceiling',height:3.5,cone:360,themes:['fantasy','ruins']}
});
export const MEDIUM_TYPES=Object.freeze({
 water:{name:'Вода',layer:'liquid',conductive:true,flammable:false,opaque:false,toxic:false},
 oil:{name:'Масло',layer:'liquid',conductive:false,flammable:true,opaque:false,toxic:false},
 poison:{name:'Ядовитая жидкость',layer:'liquid',conductive:true,flammable:false,opaque:false,toxic:true},
 fog:{name:'Туман',layer:'gas',conductive:false,flammable:false,opaque:true,toxic:false},
 'poison-gas':{name:'Отравляющий газ',layer:'gas',conductive:false,flammable:false,opaque:true,toxic:true}
});
export const ENVIRONMENT_DEFAULTS=Object.freeze({enabled:true,mediaFrequency:.3,powerFrequency:.6,wallPreference:.75,ceilingMinArea:160});
export function environmentSettings(value={}){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['enabled','mediaFrequency','powerFrequency','wallPreference','ceilingMinArea','lightTypes'].includes(k)))throw new Error('content.environment: неизвестные поля или неверный объект.');
 const result={...ENVIRONMENT_DEFAULTS,...value};
 if(typeof result.enabled!=='boolean')throw new Error('environment.enabled: boolean.');
 for(const k of ['mediaFrequency','powerFrequency','wallPreference'])if(!Number.isFinite(result[k])||result[k]<0||result[k]>1)throw new Error('environment.'+k+':0–1.');
 if(!Number.isInteger(result.ceilingMinArea)||result.ceilingMinArea<36||result.ceilingMinArea>65536)throw new Error('environment.ceilingMinArea: целое 36–65536.');
 if(result.lightTypes!==undefined&&(!Array.isArray(result.lightTypes)||!result.lightTypes.length||new Set(result.lightTypes).size!==result.lightTypes.length||result.lightTypes.some(id=>!Object.hasOwn(LIGHT_TYPES,id))))throw new Error('environment.lightTypes: непустой список известных типов света.');
 return result;
}
