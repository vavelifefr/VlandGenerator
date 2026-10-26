const spec=(summary,required,optional,result,effect='read-only',method='POST',path)=>({summary,required,optional,result,effect,method,...(path?{path}:{})});
export const OPERATION_DETAILS={
 defaults:spec('Create a recipe with the selected mode defaults.',[],['mode'],'/schemas/recipe.schema.json','read-only','GET','/api/defaults?mode={mode}'),
 'generate-base':spec('Generate immutable geometry without authored population.',['recipe'],[],'/schemas/project.schema.json','returns-project'),
 'landscape-rebuild':spec('Rebuild only a landscape profile; preserve authoring overrides and reject conflicts atomically.',['project','recipe'],[],'/schemas/project.schema.json','returns-project'),
 validate:spec('Validate generated geometry, edits, source programs and navigation separately.',['project'],[],'validation-report'),
 edit:spec('Apply one atomic authoring operation; the input project remains unchanged.',['project','operation'],[],'/schemas/project.schema.json','returns-project'),
 'source-preview':spec('Analyze one source and propose a dry-run emission; no entities are saved.',['project','sourceId'],['context','simulateActivation'],'/schemas/source-preview.schema.json'),
 'distribution-preview':spec('Propose source distribution scoped by category, kind, group and layer IDs.',['project','request'],[],'/schemas/distribution-preview.schema.json'),
 'distribution-apply':spec('Apply an unchanged preview only to its matching project checksum.',['project','preview'],[],'/schemas/project.schema.json','returns-project'),
 runtime:spec('Validate and export a neutral scene, navigation and initial spawn state.',['project'],[],'/schemas/runtime.schema.json'),
 export:spec('Export explicit project/recipe/runtime/llm-context; context options only apply to llm-context.',['project','format'],['options'],'format-dependent'),
 import:spec('Validate a schema4 project; no migration, disk write or autosave.',['project'],[],'/schemas/project.schema.json'),
 'raster-export':spec('Export current/all physical layers as lossless RGBA PNG.',['project'],['options'],'/schemas/raster.schema.json'),
 diagnose:spec('Report geometric components of current edited layers.',['project'],[],'layer-diagnostics'),
 'runtime-init':spec('Create initial state for a neutral scene.',['scene'],[],'/schemas/spawn-state.schema.json','returns-state'),
 'runtime-plan':spec('Propose bounded spawn commands against state and external occupancy.',['scene','state'],['context'],'/schemas/spawn-plan.schema.json'),
 'runtime-commit':spec('Commit after actual host creation; options.acceptedIds selects confirmations (default: all commands).',['scene','state','plan'],['options'],'/schemas/spawn-state.schema.json','returns-state'),
 'runtime-update':spec('Report movement/removal or source activation state.',['scene','state','operation'],[],'/schemas/spawn-state.schema.json','returns-state'),
 'transition-resolve':spec('Resolve an active pair after both endpoints are confirmed; does not move a player.',['runtime','state','linkId','fromSourceId'],[],'resolved-transition')
};
for(const[name,value]of Object.entries(OPERATION_DETAILS))value.path??='/api/'+name;
export const EXPORT_FORMATS={
 project:{name:'Проект JSON',schema:'/schemas/project.schema.json',purpose:'Редактируемая основа, источники и правки; можно импортировать.'},
 recipe:{name:'Рецепт JSON',schema:'/schemas/recipe.schema.json',purpose:'Параметры новой генерации; без ручных правок и источников.'},
 runtime:{name:'Для приложения',schema:'/schemas/runtime.schema.json',purpose:'Сцена, навигация, программы появления и начальное состояние.'},
 'llm-context':{name:'Контекст LLM',schema:'/schemas/project-context.schema.json',purpose:'Краткая сводка и реальные ID, до128KiB; не проект для импорта.'}
};

OPERATION_DETAILS.export.requestSchema='/schemas/export-request.schema.json';
OPERATION_DETAILS['landscape-rebuild'].requestSchema='/schemas/landscape-rebuild-request.schema.json';
