import {generateBase,normalizeRecipe,recipeFromProject,seal,shapeProject,validateProject} from './project.mjs';
import {VlandError} from './contracts.mjs';
import {hash} from '../content/common.mjs';

const unchangedGeneration=generation=>{const result={...generation};delete result.landscape;return result;};

// Rebuild only the procedural landscape profile. Authoring data remains explicit
// coordinate-bound overrides; any conflict rejects the entire candidate.
export async function rebuildLandscape(input,recipeInput){
 const project=shapeProject(input);
 if(!['landscape','hexlandscape'].includes(project.recipe.mode)||recipeInput?.mode!==project.recipe.mode||recipeInput.seed!==project.recipe.seed||hash(unchangedGeneration(recipeInput.generation??{}))!==hash(unchangedGeneration(project.recipe.generation)))throw new VlandError('REBUILD_SETTINGS_CONFLICT','Автопересчёт биомов требует той же карты, seed и остальных настроек. Примените остальные настройки отдельно.');
 const normalized=normalizeRecipe(recipeInput),recipe=recipeFromProject(project);recipe.generation.landscape=structuredClone(normalized.generation.landscape);
 const generated=await generateBase(normalizeRecipe(recipe)),candidate=seal({...generated,catalog:structuredClone(project.catalog),sources:structuredClone(project.sources),transitions:structuredClone(project.transitions??[]),edits:structuredClone(project.edits),revision:project.revision+1});
 const validation=await validateProject(candidate);
 if(!validation.ok)throw new VlandError('REBUILD_CONFLICT','Пересчёт отменён: сохранённые ручные правки или источники несовместимы с новой основой. Текущая карта сохранена.',validation.errors);
 return candidate;
}
