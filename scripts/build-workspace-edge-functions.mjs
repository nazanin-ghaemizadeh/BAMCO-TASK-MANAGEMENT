// Keep a verified production source snapshot; generate fixed-namespace variants.
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const root=new URL('../',import.meta.url);
const runtime=await readFile(new URL('supabase/functions/_shared/workspace-runtime.ts',root),'utf8');
const directory=new URL('supabase/workspace-edge-sources/',root);
const packages=[];
for(const key of ['process','quality'])for(const slug of await readdir(directory)){
 const source=new URL(slug+'/',directory),files=[];
 for(const name of await readdir(source)){
  let content=await readFile(new URL(name,source),'utf8');
  if(name==='index.ts')content=`import {installWorkspaceRuntime} from './workspace-runtime.ts';\ninstallWorkspaceRuntime('${key}',${slug==='web-push-worker'});\n`+content;
  files.push({name,content});
 }
 files.push({name:'workspace-runtime.ts',content:runtime});
 packages.push({name:key+'-'+slug,entrypoint_path:'index.ts',verify_jwt:!['web-push','web-push-worker'].includes(slug),files});
}
const out=process.argv[2]||'/tmp/bamco-workspace-edge-packages.json';
await writeFile(out,JSON.stringify(packages));
console.log(`${packages.length} fixed-workspace functions prepared.`);
