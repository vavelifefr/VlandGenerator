import {SURFACES,SURFACE_TRAITS} from '../../../app/catalog.mjs';
import {ATLAS_BIOMES,ATLAS_ROCKS} from '../../../engine/api/atlas-catalog.mjs';
import {WATER_NAMES} from '../../../app/display-colors.mjs';
export function cellDetails(l,p){
 if(!l||!p||!Number.isInteger(p.x)||!Number.isInteger(p.y)||p.x<0||p.y<0||p.x>=l.width||p.y>=l.height)return null;
 const i=p.y*l.width+p.x,rock=l.sourceFields?.rock?.[i];
 const neighborhood=l.neighborhoods?.find(n=>n.cells.includes(i)),quarter=neighborhood&&l.quarters?.find(q=>q.neighborhoodIds.includes(neighborhood.id));
 return{title:'Клетка '+p.x+', '+p.y,values:{...(l.neighborhoods?{'Микрорайон основы':neighborhood?neighborhood.id.replace('neighborhood-','М')+' · '+neighborhood.area+' кл.':'—','Квартал основы':quarter?quarter.id.replace('quarter-','К')+' · '+quarter.area+' кл.':'—'}:{}),Уровень:l.id,Материал:SURFACES[l.material[i]]?.name??l.material[i],Биом:ATLAS_BIOMES[l.biome[i]]?.name??l.biome[i],Вода:WATER_NAMES[l.water[i]]??l.water[i],Поверхность:SURFACE_TRAITS[l.traits?.[i]]??'Обычная',Высота:Number(l.elevation?.[i]??l.z??0).toFixed(2),Плодородность:Number(l.fertility?.[i]??0).toFixed(2),Порода:ATLAS_ROCKS[rock]?.name??rock??'—',Проход:l.solid[i]?'Перекрыт':'Открыт',Резерв:l.reserved?.[i]?'Защищён':'—'}};
}
