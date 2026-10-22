/* One organization-wide login resolves the authenticated user's workspace. */
(()=>{'use strict';
 const catalog=Object.freeze({product:{title:'مهندسی توسعه و تکوین محصول',schema:'public'},process:{title:'مدیریت فرآیند',schema:'bamco_process'},quality:{title:'کنترل کیفیت',schema:'bamco_quality'}});
 let key='product',resolved=false;
 const selected=()=>catalog[key];
 const activate=(value,authenticated=false)=>{
  if(!catalog[value])throw Error('محیط سازمانی معتبر نیست.');
  if(window.Bamco?.state?.token&&!authenticated)throw Error('محیط سازمانی فقط از حساب کاربری تعیین می‌شود.');
  key=value;resolved=authenticated;document.documentElement.dataset.department=key;
  document.dispatchEvent(new CustomEvent('bamco:department-selected',{detail:{key,...selected(),resolved}}));
  return selected();
 };
 async function identify(){
  if(!window.Bamco?.state?.token)throw Error('ابتدا وارد سامانه شوید.');
  const call=window.BamcoData?.rpc||window.rpc;if(typeof call!=='function')throw Error('سرویس تشخیص واحد آماده نیست.');
  const result=await call('resolve_my_workspace');
  if(!result||typeof result!=='object'||!catalog[result.key]||catalog[result.key].schema!==result.schema_name)throw Error('محیط این حساب معتبر نیست.');
  activate(result.key,true);return Object.freeze({...result});
 }
 function reset(){key='product';resolved=false;document.documentElement.dataset.department=key;document.dispatchEvent(new CustomEvent('bamco:department-selected',{detail:{key,...selected(),resolved}}))}
 const buckets=new Set(['stickers','vehicle-forms','avatars','group-avatars','letters-private','chat-attachments','documents-private','petty-cash-private','test-reports-private','invoices-private']);
 function transport(input,init,next){
  if(key==='product')return next(input,init);
  const asRequest=typeof input==='object'&&input!==null&&'url' in input,url=new URL(asRequest?input.url:String(input),document.baseURI);
  if(!['zhhongjhhbvpmoquvkhl.supabase.co','lsfqjjynrajthxnhmjyj.supabase.co'].includes(url.hostname))return next(input,init);
  const headers=new Headers(init?.headers||(asRequest?input.headers:undefined));
  if(url.pathname.startsWith('/rest/v1/')){headers.set('Accept-Profile',selected().schema);headers.set('Content-Profile',selected().schema)}
  if(url.pathname.startsWith('/functions/v1/'))url.pathname=url.pathname.replace('/functions/v1/',`/functions/v1/${key}-`);
  if(url.pathname.startsWith('/storage/v1/'))url.pathname=url.pathname.split('/').map(part=>buckets.has(part)?`${key}-${part}`:part).join('/');
  if(!asRequest)return next(url.href,{...init,headers});
  const request=new Request(input,{...init,headers});
  if(request.keepalive&&request.body)return request.arrayBuffer().then(body=>next(url.href,{method:request.method,headers,body,keepalive:true,signal:request.signal,credentials:request.credentials}));
  return next(new Request(url,request));
 }
 window.BamcoWorkspace=Object.freeze({key:()=>key,schema:()=>selected().schema,title:()=>selected().title,bucket:name=>key==='product'?name:key+'-'+name,transport,catalog,identify,reset,select:value=>activate(value,false)});
 const sync=()=>{
  const login=document.querySelector('#loginView .brand-lockup>div');
  if(login){let label=login.querySelector('[data-workspace-label]');if(!label){label=document.createElement('p');label.dataset.workspaceLabel='';login.append(label)}label.textContent=resolved?selected().title:'ورود یکپارچه سازمانی';}
  document.querySelector('#workspaceIdentity')?.remove();
  const side=document.querySelector('.sidebar .side-brand');
  if(side&&resolved){const label=document.createElement('span');label.id='workspaceIdentity';label.className='workspace-identity';label.textContent=selected().title;side.after(label)}
 };
 document.addEventListener('bamco:department-selected',sync);document.addEventListener('DOMContentLoaded',()=>{reset();sync();document.querySelector('#email')?.focus()},{once:true});
})();
