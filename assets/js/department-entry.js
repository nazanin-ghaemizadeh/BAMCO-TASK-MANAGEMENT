/* Workspace identity is fixed until a full page reload clears every module/cache. */
(()=>{'use strict';
 const catalog=Object.freeze({product:{title:'مهندسی توسعه و تکوین محصول',schema:'public'},process:{title:'مدیریت فرآیند',schema:'bamco_process'},quality:{title:'کنترل کیفیت',schema:'bamco_quality'}});
 let key='product';try{const stored=sessionStorage.getItem('bamco.department.selected');if(catalog[stored])key=stored}catch{}
 const selected=()=>catalog[key];
 const choose=value=>{if(!catalog[value])throw Error('مدیریت معتبر نیست.');if(window.Bamco?.state?.token)throw Error('برای تغییر مدیریت ابتدا خارج شوید.');key=value;try{sessionStorage.setItem('bamco.department.selected',key)}catch{}document.documentElement.dataset.department=key;document.dispatchEvent(new CustomEvent('bamco:department-selected',{detail:{key,...selected()}}));};
 window.BamcoWorkspace=Object.freeze({key:()=>key,schema:()=>selected().schema,title:()=>selected().title,bucket:name=>key==='product'?name:key+'-'+name,transport,catalog,select:choose});
 const buckets=new Set(['stickers','vehicle-forms','avatars','group-avatars','letters-private','chat-attachments','documents-private','petty-cash-private','test-reports-private','invoices-private']);
 function transport(input,init,next){
  if(key==='product')return next(input,init);
  const asRequest=typeof input==='object'&&input!==null&&'url' in input;
  const url=new URL(asRequest?input.url:String(input),document.baseURI);
  if(!['zhhongjhhbvpmoquvkhl.supabase.co','lsfqjjynrajthxnhmjyj.supabase.co'].includes(url.hostname))return next(input,init);
  const headers=new Headers(init?.headers||(asRequest?input.headers:undefined));
  if(url.pathname.startsWith('/rest/v1/')){headers.set('Accept-Profile',selected().schema);headers.set('Content-Profile',selected().schema)}
  if(url.pathname.startsWith('/functions/v1/'))url.pathname=url.pathname.replace('/functions/v1/',`/functions/v1/${key}-`);
  if(url.pathname.startsWith('/storage/v1/'))url.pathname=url.pathname.split('/').map(part=>buckets.has(part)?`${key}-${part}`:part).join('/');
  // Preserve multipart bodies and keepalive strings without rewrapping a stream.
  if(!asRequest)return next(url.href,{...init,headers});
  const request=new Request(input,{...init,headers});
  if(request.keepalive&&request.body)return request.arrayBuffer().then(body=>next(url.href,{method:request.method,headers,body,keepalive:true,signal:request.signal,credentials:request.credentials}));
  return next(new Request(url,request));
 };

 const sync=()=>{
  const login=document.querySelector('#loginView .brand-lockup>div');
  if(login){let label=login.querySelector('[data-workspace-label]');if(!label){label=document.createElement('p');label.dataset.workspaceLabel='';login.append(label)}label.textContent=selected().title;}
  const side=document.querySelector('.sidebar .side-brand');
  if(side){let switcher=document.querySelector('#workspaceSwitch');if(!switcher){switcher=document.createElement('button');switcher.id='workspaceSwitch';switcher.className='ghost workspace-switch';switcher.type='button';switcher.addEventListener('click',async()=>{switcher.disabled=true;try{await window.bamcoAuth?.signOut?.()}finally{location.reload()}});side.after(switcher)}switcher.textContent=selected().title+' · تغییر مدیریت';}
 };
 document.addEventListener('bamco:department-selected',sync);
 document.addEventListener('DOMContentLoaded',sync,{once:true});
})();

/* Department entry: one stable startup owner, no repeated layout repair loop. */
(()=>{'use strict';
const wait=(promise,ms)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('timeout')),ms);Promise.resolve(promise).then(resolve,reject).finally(()=>clearTimeout(timer))});
async function prepareEntry(view){
 const body=document.body,logo=view.querySelector(':scope>header>img');
 let fontOk=false;
 try{
  if(document.fonts?.load){
   const sample='سامانه مدیریت، پایش و پیگیری امور مهندسی توسعه و تکوین محصول';
   await wait(Promise.all([400,700].map(weight=>document.fonts.load(`${weight} 22px "BamcoEntry"`,sample))),2200);
   fontOk=[400,700].every(weight=>document.fonts.check(`${weight} 22px "BamcoEntry"`,sample));
  }
 }catch{}
 if(!fontOk)body.classList.add('department-entry-font-fallback');
 try{if(logo&&!logo.complete)await wait(new Promise((resolve,reject)=>{logo.addEventListener('load',resolve,{once:true});logo.addEventListener('error',reject,{once:true})}),2200);if(logo?.decode)await wait(logo.decode().catch(()=>{}),800)}catch{}
 requestAnimationFrame(()=>requestAnimationFrame(()=>body.classList.add('department-entry-ready')));
}
function boot(){
 const login=document.querySelector('#loginView'),app=document.querySelector('#appView'),view=document.querySelector('#departmentEntry');
 if(!login||!app||!view)return;
 void prepareEntry(view);
 const dedupeLogo=()=>{const logos=[...view.querySelectorAll(':scope>header>img')];logos.slice(1).forEach(node=>node.remove())};
 dedupeLogo();
 let selected=false,lastSignedIn=null;
 const showLogin=()=>{
  selected=true;view.hidden=true;document.body.classList.remove('department-pending');login.classList.remove('hidden');login.style.removeProperty('display');app.classList.add('hidden');lastSignedIn=false;
  requestAnimationFrame(()=>document.querySelector('#email')?.focus());
 };
 const showDepartments=()=>{
  selected=false;view.hidden=false;document.body.classList.add('department-pending');login.classList.remove('hidden');login.style.removeProperty('display');app.classList.add('hidden');lastSignedIn=false;
 };
 const sync=()=>{
  const signedIn=!app.classList.contains('hidden');
  if(signedIn){if(!view.hidden)view.hidden=true;document.body.classList.remove('department-pending');lastSignedIn=true;return}
  if(selected){if(!view.hidden)view.hidden=true;document.body.classList.remove('department-pending');login.classList.remove('hidden');lastSignedIn=false;return}
  if(view.hidden)view.hidden=false;document.body.classList.add('department-pending');lastSignedIn=false;
 };
 view.querySelectorAll('[data-department]').forEach(button=>{if(button.dataset.entryBound)return;button.dataset.entryBound='1';button.addEventListener('click',()=>{window.BamcoWorkspace.select(button.dataset.department);showLogin()})});
 const bindBack=()=>{
  let back=login.querySelector('.department-back');
  if(!back){back=document.createElement('button');back.type='button';back.className='department-back';back.textContent='بازگشت به انتخاب مدیریت';login.querySelector('#loginForm')?.append(back)}
  if(back&&!back.dataset.entryBound){back.dataset.entryBound='1';back.addEventListener('click',showDepartments)}
 };
 bindBack();document.addEventListener('bamco:login-ui-ready',bindBack);
 new MutationObserver(()=>{const signedIn=!app.classList.contains('hidden');if(signedIn!==lastSignedIn)sync()}).observe(app,{attributes:true,attributeFilter:['class']});
 new MutationObserver(()=>{if(view.hidden&&!app.classList.contains('hidden'))return;if(view.hidden&&document.body.classList.contains('department-pending'))showLogin()}).observe(view,{attributes:true,attributeFilter:['hidden']});
 sync();
 const password=document.querySelector('#passwordDialog');password?.addEventListener('cancel',e=>{if(typeof state!=='undefined'&&state.profile?.must_change_password)e.preventDefault()});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
