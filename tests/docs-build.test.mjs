import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('generated documentation tables show content without Markdown separator rows',async()=>{
 for(const page of ['guide','llm']){const html=await readFile(new URL('../Web/HTML/'+page+'.html',import.meta.url),'utf8');assert.ok(!/<td>\s*:?-{3,}:?\s*<\/td>/.test(html),page+': Markdown separator rendered as a data cell');}
});
