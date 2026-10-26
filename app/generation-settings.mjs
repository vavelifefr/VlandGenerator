import {naturalTransportSettings} from '../engine/api/atlas-transports.mjs';
import {transportSettings} from '../engine/core/transport-settings.mjs';
import {hash} from '../content/common.mjs';
import {normalizeLandscapeProfile} from '../engine/core/landscape-profile.mjs';
const profileHash=value=>hash(value===undefined?null:normalizeLandscapeProfile(value));
const enabled=request=>request?.layout?.allowDisconnected??request?.generator?.allowDisconnected??false;
export function generationSettingsErrors(project){
 const {mode,generation}=project.recipe,errors=[];
 if(mode==='dungeon'){
  if(hash(transportSettings(generation.layout?.transports))!==hash(transportSettings(project.source.level.options.transports))||(generation.layout?.allowDisconnected??false)!==!!project.source.level.options.allowDisconnected)errors.push('Настройки автоматического доступа не соответствуют показанной основе. Пересоздайте карту.');
 }else if(mode==='tiers'){
  if(hash(transportSettings(generation.autoTransports,true))!==hash(project.source.request.autoTransports)||generation.layers.some(l=>enabled(l.request)!==project.source.layers.find(s=>s.id===l.id)?.dungeon.level.options.allowDisconnected))errors.push('Настройки автоматического доступа ярусов не соответствуют показанной основе. Пересоздайте карту.');
 }else if(['caves','landscape','hexlandscape','relief'].includes(mode)){if(profileHash(generation.landscape)!==profileHash(project.source.request.landscape))errors.push('Основа и базовый биом изменены. Пересоздайте основу.');if(hash(generation.layerSettings??{})!==hash(project.source.request.layerSettings??{}))errors.push('Настройки физических слоёв изменены. Пересоздайте основу.');if(hash(naturalTransportSettings(generation.autoTransports))!==hash(project.source.request.autoTransports))errors.push('Настройки переходов природной карты изменены. Пересоздайте основу.');}return errors;
}
