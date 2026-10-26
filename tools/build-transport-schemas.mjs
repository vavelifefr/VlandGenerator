import {readFile,writeFile} from 'node:fs/promises';
const integer=(min,max)=>({type:'integer',minimum:min,maximum:max}),number=(min,max)=>({type:'number',minimum:min,maximum:max}),object=(properties,required=[])=>({type:'object',additionalProperties:false,properties,required}),text={type:'string',minLength:1,maxLength:96};
const common=object({maxGroups:integer(1,4),maxRoomsPerGroup:integer(1,8),chance:number(0,1),travelCost:number(1,1000)}),types=object(Object.fromEntries(['teleport','lift','stairs'].map(k=>[k,number(0,100)])));
types.anyOf=['teleport','lift','stairs'].map(k=>({required:[k],properties:{[k]:{exclusiveMinimum:0}}}));
const world=object({...common.properties,landingSize:integer(1,3),types}),root=new URL('../',import.meta.url),write=(file,data)=>writeFile(new URL(file,root),JSON.stringify(data,null,2)+'\n');
await write('engine/schemas/transport-settings.schema.json',{$schema:'https://json-schema.org/draft/2020-12/schema',$id:'https://vland.invalid/engine/schemas/transport-settings.schema.json',title:'Automatic isolated-area access settings',...common,$defs:{world}});
const edit=async(file,change)=>{const data=JSON.parse(await readFile(new URL(file,root),'utf8'));change(data);await write(file,data);};
for(const file of ['engine/schemas/request.schema.json','schemas/generation-dungeon.schema.json'])await edit(file,s=>{s.properties.layout.properties.transports={$ref:(file.startsWith('engine/')?'':'../engine/schemas/')+'transport-settings.schema.json'};s.properties.layout.properties.allowDisconnected.description='Allow optional isolated areas, each with a validated automatic transport; the main physical route stays connected.';});
await edit('engine/schemas/recipe.schema.json',s=>{s.properties.generator.properties.transports={$ref:'transport-settings.schema.json'};});
for(const file of ['engine/schemas/world-request.schema.json','schemas/generation-tiers.schema.json'])await edit(file,s=>{s.properties.autoTransports={$ref:(file.startsWith('engine/')?'':'../engine/schemas/')+'transport-settings.schema.json#/$defs/world'};});
await edit('engine/schemas/level.schema.json',s=>{
 const transport=s.properties.transportLinks.items;transport.properties.automatic={const:true};transport.properties.travelCost=number(1,1000);
 s.properties.externalTransports={type:'array',maxItems:4,items:{...structuredClone(transport),required:[...transport.required,'worldLinkId','automatic','travelCost'],properties:{...structuredClone(transport.properties),kind:{enum:['stairs','lift']},worldLinkId:text}}};
 s.properties.isolation.properties.groups={type:'array',maxItems:4,items:object({edgeId:text,transportId:text,roomIds:{type:'array',items:text,minItems:1,maxItems:8,uniqueItems:true}},['edgeId','transportId','roomIds'])};
 s.properties.options.properties??={};s.properties.options.properties.transports={$ref:'transport-settings.schema.json'};
});
await edit('engine/schemas/world.schema.json',s=>{
 s.properties.verticalLinks.maxItems=64;const link=s.properties.verticalLinks.items;link.properties.automatic={const:true};link.properties.isolation=object({layerId:text,edgeId:text},['layerId','edgeId']);link.allOf=[{if:{required:['automatic']},then:{required:['isolation'],properties:{direction:{const:'both'},requirements:{maxItems:0}}}},{if:{required:['isolation']},then:{required:['automatic']}}];
 s.properties.layers.items.properties.reservations.maxItems=128;
 const group=object({layerId:text,edgeId:text,roomIds:{type:'array',items:text,minItems:1,maxItems:8,uniqueItems:true},kind:{enum:['teleport','lift','stairs']},linkId:text},['layerId','edgeId','roomIds','kind','linkId']);
 s.properties.automaticTransports=object({settings:{$ref:'transport-settings.schema.json#/$defs/world'},groups:{type:'array',items:group,maxItems:32},counts:object({teleport:integer(0,32),lift:integer(0,32),stairs:integer(0,32)},['teleport','lift','stairs']),note:{type:'string'}},['settings','groups','counts']);
 s.required=[...new Set([...s.required,'automaticTransports'])];
});
