import {validForm} from './dom.mjs';

export function validateMapSettings({settings,access,layers}){
 for(const body of [settings,access,layers])if(body)validForm({querySelectorAll:selector=>[...body.querySelectorAll(selector)].filter(field=>field.dataset?.biomeDraft!=='true')});
}
