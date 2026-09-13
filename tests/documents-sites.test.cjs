const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const ROOT=path.resolve(__dirname,'..');
const featurePath=path.join(ROOT,'assets/js/documents-sites.js');
const credentialPath=path.join(ROOT,'supabase/functions/credential-vault/index.ts');
const documentPath=path.join(ROOT,'supabase/functions/document-library/index.ts');
const migrationPath=path.join(ROOT,'supabase/migrations/20260912154000_documents_sites_secure_features.sql');
const hardeningPath=path.join(ROOT,'supabase/migrations/20260912154100_documents_write_consistency_hardening.sql');

test('safe site URL validator accepts only http(s) and rejects credentials/scripting schemes',()=>{
  const {safeHttpUrl}=require(featurePath);
  assert.equal(safeHttpUrl('https://portal.example.com/path'),true);
  assert.equal(safeHttpUrl('http://intranet.local:8080/login'),true);
  assert.equal(safeHttpUrl('javascript:alert(1)'),false);
  assert.equal(safeHttpUrl('data:text/html,x'),false);
  assert.equal(safeHttpUrl('ftp://example.com'),false);
  assert.equal(safeHttpUrl('https://user:pass@example.com'),false);
});

test('frontend never persists credentials in browser storage or URL',()=>{
  const src=fs.readFileSync(featurePath,'utf8');
  assert.doesNotMatch(src,/localStorage|sessionStorage/);
  assert.doesNotMatch(src,/URLSearchParams\([^)]*password/i);
  assert.match(src,/credential-vault/);
  assert.match(src,/type=\\?"password\\?"/);
});

test('credential vault uses server-only key and AES-GCM with user/site binding',()=>{
  const src=fs.readFileSync(credentialPath,'utf8');
  assert.match(src,/credential_server_key/);
  assert.match(src,/AES-GCM/g);
  assert.match(src,/additionalData/);
  assert.match(src,/SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(src,/localStorage|sessionStorage/);
  assert.doesNotMatch(src,/console\.(log|debug|info).*password/i);
  assert.match(src,/user_site_credentials\?user_id=eq\.\$\{encodeURIComponent\(user\.id\)\}/);
});

test('document edge enforces manager and compensates failed metadata insert',()=>{
  const src=fs.readFileSync(documentPath,'utf8');
  assert.match(src,/role\s*!==\s*"manager"/);
  assert.match(src,/documents-private/);
  assert.match(src,/await\s+deleteObjects\(url,\s*service,\s*\[path\]\)\.catch/);
  assert.match(src,/document_upload/);
  assert.match(src,/document_delete/);
});

test('database migration keeps documents private, RLS protected and credentials opaque',()=>{
  const sql=fs.readFileSync(migrationPath,'utf8');
  const hard=fs.readFileSync(hardeningPath,'utf8');
  assert.match(sql,/document_categories.*enable row level security/is);
  assert.match(sql,/user_site_credentials.*enable row level security/is);
  assert.match(sql,/documents-private','documents-private',false/);
  assert.match(sql,/vault\.create_secret/);
  assert.match(sql,/revoke all on public\.user_site_credentials from anon,authenticated/);
  assert.match(hard,/revoke insert, update, delete on public\.documents from authenticated/);
  assert.match(hard,/revoke delete on public\.document_categories from authenticated/);
});

test('feature uses local XLSX loader and no public preview service or unsafe eval',()=>{
  const src=fs.readFileSync(featurePath,'utf8');
  assert.match(src,/ensureBamcoXLSX/);
  assert.doesNotMatch(src,/docs\.google|officeapps\.live|view\.officeapps|iframe[^\n]+https?:\/\//i);
  assert.doesNotMatch(src,/eval\(|new Function/);
  assert.match(src,/window\.docx\?\.renderAsync/);
  assert.match(src,/documentPreviewSheet/);
  assert.match(src,/documentPreviewDialog/);
});

test('index wires both feature views and source files after integration',()=>{
  const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
  assert.match(html,/data-view="documents"/);
  assert.match(html,/data-view="sitesAccess"/);
  assert.match(html,/id="documentsView"/);
  assert.match(html,/id="sitesAccessView"/);
  assert.match(html,/assets\/js\/documents-sites\.js/);
  assert.match(html,/assets\/css\/documents-sites\.css/);
});

test('feature runtime boots without console error and exposes both views for a normal user',async()=>{
  const dom=new JSDOM('<!doctype html><body><nav id="nav"></nav><div class="workspace"></div></body>',{url:'https://example.test/',runScripts:'outside-only'});
  const ctx=dom.getInternalVMContext();
  Object.assign(ctx,{
    state:{token:'token',user:{id:'user-a'},profile:{id:'user-a',role:'owner',active:true},profiles:[]},
    SB_URL:'https://example.supabase.co',SB_KEY:'publishable',titles:{},
    toast:()=>{},selectAll:async()=>[],select:async()=>[],insert:async()=>[],update:async()=>[],rpc:async()=>{},api:async()=>{},
    fetch:async()=>({ok:true,text:async()=>'{"items":[]}',blob:async()=>new dom.window.Blob(['x'])})
  });
  const errors=[];ctx.console={...console,error:(...x)=>errors.push(x.join(' ')),warn:()=>{}};
  vm.runInContext(fs.readFileSync(featurePath,'utf8'),ctx,{filename:'documents-sites.js'});
  assert.ok(ctx.document.querySelector('[data-view="documents"]'));
  assert.ok(ctx.document.querySelector('[data-view="sitesAccess"]'));
  assert.ok(ctx.document.querySelector('#documentsView'));
  assert.ok(ctx.document.querySelector('#sitesAccessView'));
  assert.ok(ctx.document.querySelector('#docCategoryDialog'));
  assert.equal(ctx.document.querySelector('#addDocumentCategory').classList.contains('hidden'),true);
  assert.equal(ctx.document.querySelector('#addOrganizationSite').classList.contains('hidden'),true);
  assert.deepEqual(errors,[]);
  dom.window.close();
});

test('manager controls become visible on entering feature tabs',async()=>{
  const dom=new JSDOM('<!doctype html><body><nav id="nav"><button data-view="documents"></button><button data-view="sitesAccess"></button></nav><div class="workspace"><section id="documentsView" class="view hidden"><button id="addDocumentCategory" class="hidden"></button><input id="documentsSearch"><button id="documentsRefresh"></button><div id="documentsFeatureBody"></div></section><section id="sitesAccessView" class="view hidden"><input id="sitesSearch"><select id="sitesFilter"><option value="all">all</option></select><button id="sitesRefresh"></button><button id="addPersonalSite"></button><button id="addOrganizationSite" class="hidden"></button><button id="sitesExcel"></button><button id="sitesManagerExcel" class="hidden"></button><div id="sitesFeatureBody"></div></section></div></body>',{url:'https://example.test/',runScripts:'outside-only'});
  const ctx=dom.getInternalVMContext();
  Object.assign(ctx,{state:{token:'token',user:{id:'manager'},profile:{id:'manager',role:'manager',active:true},profiles:[]},SB_URL:'https://example.supabase.co',SB_KEY:'publishable',titles:{},toast:()=>{},selectAll:async()=>[],select:async()=>[],insert:async()=>[],update:async()=>[],rpc:async()=>{},api:async()=>{},fetch:async()=>({ok:true,text:async()=>'{"items":[]}'})});
  vm.runInContext(fs.readFileSync(featurePath,'utf8'),ctx,{filename:'documents-sites.js'});
  ctx.document.querySelector('[data-view="documents"]').dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));
  ctx.document.querySelector('[data-view="sitesAccess"]').dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));
  await new Promise(r=>setTimeout(r,5));
  assert.equal(ctx.document.querySelector('#addDocumentCategory').classList.contains('hidden'),false);
  assert.equal(ctx.document.querySelector('#addOrganizationSite').classList.contains('hidden'),false);
  assert.equal(ctx.document.querySelector('#sitesManagerExcel').classList.contains('hidden'),false);
  dom.window.close();
});

test('feature CSS includes dedicated mobile layouts',()=>{
  const css=fs.readFileSync(path.join(ROOT,'assets/css/documents-sites.css'),'utf8');
  assert.match(css,/@media\(max-width:760px\)/);
  assert.match(css,/\.feature-site-grid\{grid-template-columns:1fr\}/);
  assert.match(css,/\.feature-toolbar\{align-items:stretch;flex-direction:column\}/);
});


test('documents and sites join the standard home card and interior command bar',()=>{
  const sidebar=fs.readFileSync(path.join(ROOT,'assets/js/sidebar.js'),'utf8');
  const home=fs.readFileSync(path.join(ROOT,'assets/js/card-home.js'),'utf8');
  const interior=fs.readFileSync(path.join(ROOT,'assets/js/interior-ui.js'),'utf8');
  const css=fs.readFileSync(path.join(ROOT,'assets/css/documents-sites.css'),'utf8');
  assert.match(sidebar,/makeGroup\('منابع و دسترسی‌ها','resources',\['documents','letters','sitesAccess'\]/);
  assert.match(home,/\['resources',\['documents','letters','sitesAccess'\]\]/);
  assert.match(interior,/feature-toolbar-actions/);
  assert.match(css,/#documentsView,#sitesAccessView/);
  assert.match(css,/feature-toolbar-actions\.bamco-command-bar/);
  assert.match(css,/\.content-back\{order:-100/);
});


test('document preview is modal-first with MIME fallback and five renderer paths',()=>{
  const src=fs.readFileSync(featurePath,'utf8');
  assert.match(src,/function documentMime\(doc\)/);
  assert.match(src,/documentMime\(doc\)==='application\/pdf'/);
  assert.match(src,/mime\.startsWith\('image\/'\)/);
  assert.match(src,/mime==='text\/plain'/);
  assert.match(src,/window\.docx\?\.renderAsync/);
  assert.match(src,/ensureBamcoXLSX/);
  assert.match(src,/documentPreviewDialog/);
  assert.match(src,/documentPreviewOpenTab/);
  assert.match(src,/documentPreviewDownload/);
  assert.match(src,/storage\/v1\/object\/sign/);
  assert.doesNotMatch(src,/openDocumentPreviewTab/);
});

test('sites access buttons use the regular font face without synthetic bold',()=>{
  const css=fs.readFileSync(path.join(ROOT,'assets/css/documents-sites.css'),'utf8');
  assert.match(css,/#sitesAccessView button[^}]*font-weight:400!important/);
  assert.match(css,/#sitesAccessView button[^}]*font-synthesis:none!important/);
});


test('DOCX preview loads local JSZip before docx-preview',()=>{
  const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
  const zip=html.indexOf('assets/vendor/jszip.min.js'),docx=html.indexOf('assets/vendor/docx-preview.min.js');
  assert.ok(zip>=0&&docx>zip);
  assert.ok(fs.statSync(path.join(ROOT,'assets/vendor/jszip.min.js')).size>10000);
});

test('PDF opens a synchronous standalone Chrome tab, receives authenticated bytes and rejects invalid files',async()=>{
 const dom=new JSDOM('<nav id="nav"></nav><div class="workspace"></div>',{url:'https://example.test/',runScripts:'outside-only'}),w=dom.window,calls=[],blobs=[];
 let payload='%PDF-1.7\nfixture';const opened=[],notices=[];
 w.open=()=>{const v={document:{body:{}},location:{},closed:false,close(){this.closed=true}};opened.push(v);return v};
 Object.assign(w,{Blob,TextDecoder,state:{token:'test-token',profile:{role:'manager',active:true}},SB_URL:'https://example.supabase.co',SB_KEY:'test',titles:{},toast:(v)=>notices.push(v),selectAll:async t=>t==='document_categories'?[{id:1,title:'Forms'}]:[{id:1,category_id:1,title:'PDF',original_file_name:'form.pdf',storage_path:'private/form.pdf',mime_type:'application/pdf',file_size:100,version:1}],fetch:async(url,options)=>{calls.push({url,options});return{ok:true,blob:async()=>new Blob([payload],{type:'application/octet-stream'})}}});
 w.URL.createObjectURL=b=>{blobs.push(b);return 'blob:https://example.test/pdf'};w.URL.revokeObjectURL=()=>{};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};
 w.eval(fs.readFileSync(featurePath,'utf8'));
 try{
  await w.bamcoDocumentsSites.refreshDocuments();w.document.querySelector('[data-doc-preview]').click();await new Promise(r=>setTimeout(r,20));
  assert.match(calls[0].url,/object\/authenticated\/documents-private/);assert.equal(calls[0].options.headers.Authorization,'Bearer test-token');
  assert.equal(blobs[0].type,'application/pdf');assert.equal(opened[0].location.href,'blob:https://example.test/pdf');assert.equal(opened[0].opener,null);assert.equal(w.document.querySelector('.feature-pdf-preview'),null);assert.equal(w.document.querySelector('#documentPreviewDialog').open,false);
  payload='{"error":"not a PDF"}';w.document.querySelector('[data-doc-preview]').click();await new Promise(r=>setTimeout(r,20));
  assert.equal(w.document.querySelector('.feature-pdf-preview'),null);assert.equal(opened[1].closed,true);assert.match(notices.at(-1),/PDF معتبر نیست/);
 }finally{w.close()}
});
