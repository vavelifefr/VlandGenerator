// Validate typing drafts without rewriting them; enforce bounds when the user commits the field.
export function boundNumericInput(input,{commit=true}={}){
 if(input.value==='')return false;
 let value=Number(input.value);if(!Number.isFinite(value))return false;
 const min=input.min!==''&&input.min!==undefined?Number(input.min):-Infinity,max=input.max!==''&&input.max!==undefined?Number(input.max):Infinity;
 value=Math.min(max,Math.max(min,value));
 // Snap declared steps, retaining arbitrary precision when the input explicitly uses any.
 const step=Number(input.step),base=Number.isFinite(min)?min:0,ticks=(value-base)/step;
 if(input.step!=='any'&&Number.isFinite(step)&&step>0)value=Math.min(max,Math.max(min,Number((base+Math.round(ticks+Number.EPSILON*Math.max(1,Math.abs(ticks)))*step).toPrecision(14))));
 if(!commit)return Number(input.value)===value;
 if(Number(input.value)!==value)input.value=String(value);
 return true;
}
