// Import the complete static app from its canonical repository without edits.
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,writeFile,cp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const repository='https://github.com/nazanin-ghaemizadeh/BAMCO-PAINT-SHOP.git';
const local=process.argv.indexOf('--source');
let temporary;
try{
 const source=local>=0?resolve(process.argv[local+1]):join(temporary=await mkdtemp(join(tmpdir(),'bamco-paint-')),'source');
 if(local<0)execFileSync('git',['clone','--depth','1',repository,source],{stdio:'inherit'});
 if(execFileSync('git',['status','--porcelain'],{cwd:source,encoding:'utf8'}).trim())throw Error('Source must be a clean checkout');
 const revision=execFileSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'}).trim();
 const files=execFileSync('git',['ls-files','-z'],{cwd:source,encoding:'utf8'}).split('\0').filter(p=>p&&!p.startsWith('.')&&!p.includes('..')&&(p.startsWith('assets/')||/^[^/]+\.(html|css|js)$/.test(p)));
 if(!files.includes('index.html')||!files.includes('app.js'))throw Error('Static Paint Shop entry points missing');
 const destination=join(root,'tools/paint-shop');await rm(destination,{recursive:true,force:true});await mkdir(destination,{recursive:true});
 const hashes={};
 for(const file of files){await mkdir(dirname(join(destination,file)),{recursive:true});await cp(join(source,file),join(destination,file));hashes[file]=createHash('sha256').update(await readFile(join(destination,file))).digest('hex')}
 await writeFile(join(destination,'source.json'),JSON.stringify({repository,revision,files:hashes},null,2)+'\n');
 console.log(`Imported ${files.length} files from Paint Shop ${revision}`);
}finally{if(temporary)await rm(temporary,{recursive:true,force:true})}
