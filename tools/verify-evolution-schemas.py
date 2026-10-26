"""Offline schema validation. Reads the supplied QA manifest, never live .run."""
import argparse,copy,importlib.metadata,json,pathlib
from decimal import Decimal
from jsonschema import Draft202012Validator
from referencing import Registry,Resource
parser=argparse.ArgumentParser()
parser.add_argument('--data',required=True,type=pathlib.Path)
parser.add_argument('--report',required=True,type=pathlib.Path)
args=parser.parse_args()
# JSON Schema treats 32.0 as integer, while exact fractional shares need Decimal.
def decimal_number(text):
    value=Decimal(text)
    return int(value) if value==value.to_integral_value() else value
root=pathlib.Path(__file__).resolve().parents[1]
schemas={};registry=Registry();checks=[];failures=[];negative=0
for file in [*root.joinpath('schemas').glob('*.json'),*root.joinpath('engine/schemas').glob('*.json')]:
    data=json.loads(file.read_text(encoding='utf-8-sig'),parse_float=decimal_number);Draft202012Validator.check_schema(data);schemas[file]=data
    for uri in [data.get('$id',file.as_uri()),file.as_uri(),'https://vland.invalid/'+file.relative_to(root).as_posix()]:registry=registry.with_resource(uri,Resource.from_contents(data))
def check(value,schema,label):
    global negative
    errors=list(Draft202012Validator(schemas[root/schema],registry=registry).iter_errors(value))
    row={'document':label,'schema':schema,'ok':not errors}
    if errors:
        row['errors']=[{'path':e.json_path,'schemaPath':list(e.absolute_schema_path),'message':e.message[:600]} for e in errors[:12]]
        failures.append(row)
    checks.append(row)
    required=schemas[root/schema].get('required',[])
    if not errors and isinstance(value,dict) and required:
        broken=copy.deepcopy(value);del broken[required[0]]
        if not list(Draft202012Validator(schemas[root/schema],registry=registry).iter_errors(broken)):raise RuntimeError('Required field control accepted: '+label)
        negative+=1
data=json.loads(args.data.read_text(encoding='utf-8-sig'),parse_float=decimal_number)
for item in data['documents']:
    value=item['value'] if 'value' in item else json.loads((root/item['file']).read_text(encoding='utf-8-sig'),parse_float=decimal_number)
    check(value,item['schema'],item['label'])
result={'ok':not failures,'validator':'jsonschema','version':importlib.metadata.version('jsonschema'),'draft':'2020-12','offlineRegistry':True,'schemas':len(schemas),'documents':len(checks),'negativeControls':negative,'modes':data['modes'],'failures':failures,'checks':checks}
args.report.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:v for k,v in result.items() if k!='checks'}))
raise SystemExit(0 if result['ok'] else 1)
