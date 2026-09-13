(()=>{
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const digits=v=>String(v??'').replace(/\d/g,c=>'۰۱۲۳۴۵۶۷۸۹'[c]);
let rows=[],query='',loading=false,saving=false,run=0;
const q=s=>document.querySelector(s);
async function edge(body){const form=body instanceof FormData;const response=await fetch(SB_URL+'/functions/v1/letters-library',{method:'POST',headers:{apikey:SB_KEY,Authorization:'Bearer '+state.token,...(!form?{'Content-Type':'application/json'}:{})},body:form?body:JSON.stringify(body),cache:'no-store'});const data=await response.json();if(!response.ok)throw Error(data.error||'عملیات نامه انجام نشد.');return data}
function render(){const host=q('#lettersBody');if(!host)return;const filtered=rows.filter(r=>[r.letter_number,r.letter_date,r.recipient,r.subject,r.file_name,r.source_file_name].some(v=>String(v||'').toLowerCase().includes(query)));host.innerHTML=loading?'<p role="status">در حال دریافت نامه‌ها…</p>':`<p>${digits(filtered.length)} نامه</p><div class="letters-scroll"><table class="letters-table"><thead><tr>${['ردیف','شماره نامه','تاریخ نامه','گیرنده','موضوع نامه','فایل','عملیات'].map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${filtered.map((r,i)=>`<tr><td>${digits(i+1)}</td><td>${esc(digits(r.letter_number))}</td><td>${esc(digits(r.letter_date))}</td><td>${esc(r.recipient)}</td><td>${esc(r.subject)}</td><td>${esc(r.file_name||r.source_file_name||'—')}${!r.storage_path?'<small> · فایل بارگذاری نشده</small>':''}</td><td><div class="letter-actions"><button class="ghost" data-letter-download="${r.id}" ${r.storage_path?'':'disabled'}>دانلود</button><button class="ghost" data-letter-edit="${r.id}">ویرایش</button></div></td></tr>`).join('')||'<tr><td colspan="7">نامه‌ای مطابق جست‌وجو پیدا نشد.</td></tr>'}</tbody></table></div>`}
async function load(){if(!state?.token||!await access())return;const serial=++run;loading=true;render();try{const result=await selectAll('letters','select=*&order=letter_date.desc,letter_number.desc');if(serial===run)rows=result||[]}catch(e){if(serial===run)q('#lettersError').textContent=e.message}finally{if(serial===run){loading=false;render()}}}
function form(row=null){let dialog=q('#letterDialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='letterDialog';dialog.className='letters-dialog';document.body.append(dialog)}
 dialog.innerHTML=`<h3>${row?'ویرایش نامه':'افزودن نامه'}</h3><form><label>شماره نامه<input name="letter_number" required maxlength="120" dir="ltr" value="${esc(row?.letter_number||'')}"></label><label>تاریخ نامه<input name="letter_date" required dir="ltr" placeholder="1405/06/22" value="${esc(row?.letter_date||'')}"></label><label>گیرنده<input name="recipient" required maxlength="300" value="${esc(row?.recipient||'')}"></label><label>موضوع نامه<input name="subject" required maxlength="1000" value="${esc(row?.subject||'')}"></label><label>${row?'فایل جدید؛ برای حفظ فایل فعلی خالی بگذارید':'فایل نامه'}<input type="file" name="file" accept=".pdf,.docx,.png,.jpg,.jpeg" ${row?'':'required'}></label><p>حداکثر ۲۵ مگابایت. ویرایش متن فایل با دانلود، اصلاح در نرم‌افزار مربوط و بارگذاری نسخه جدید انجام می‌شود.</p><p class="letter-error" role="alert"></p><div class="letter-actions"><button class="primary" type="submit">ذخیره</button><button class="ghost" type="button" data-cancel>انصراف</button></div></form>`;
 dialog.querySelector('[data-cancel]').onclick=()=>{if(!saving)dialog.close()};dialog.oncancel=e=>{if(saving)e.preventDefault()};
 dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();if(saving)return;saving=true;const button=dialog.querySelector('[type=submit]');button.disabled=true;const fd=new FormData(e.currentTarget);fd.set('action','save');if(row){fd.set('id',row.id);fd.set('version',row.version)}
 try{await edge(fd);dialog.close();toast('نامه ذخیره شد.');await load()}catch(error){dialog.querySelector('.letter-error').textContent=error.message}finally{saving=false;button.disabled=false}};dialog.showModal();
}
const manager=()=>state?.profile?.active!==false&&state?.profile?.role==='manager';
let accessJob=null;
async function access(){
 if(accessJob)return accessJob;
 const token=state?.token;
 accessJob=(async()=>{let allowed=false;try{allowed=!!token&&await rpc('can_access_letters',{})===true}catch{}
 if(state?.token!==token)return false;
 const nav=q('#lettersNav');if(nav&&nav.classList.contains('hidden')===allowed)nav.classList.toggle('hidden',!allowed);
 const control=q('#lettersAccess');if(control&&control.classList.contains('hidden')===manager())control.classList.toggle('hidden',!manager());
 if(!allowed){++run;rows=[];loading=false;render();q('#letterDialog')?.close();q('#letterAccessDialog')?.close();if(state?.view==='letters'&&typeof showView==='function')showView('home')}
 return allowed})().finally(()=>accessJob=null);return accessJob;
}
async function manageAccess(){
 if(!manager())return;
 const button=q('#lettersAccess');button.disabled=true;
 try{const [people,grants]=await Promise.all([selectAll('profiles','select=id,display_name,full_name,email,role&active=eq.true'),selectAll('letter_access','select=user_id')]);
 const selected=new Set(grants.map(g=>g.user_id));let dialog=q('#letterAccessDialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='letterAccessDialog';dialog.className='letters-dialog';document.body.append(dialog)}
 dialog.innerHTML=`<h3>دسترسی به نامه‌ها</h3><p>مدیران دسترسی دارند. افراد انتخاب‌شده فقط به تب نامه‌ها دسترسی می‌گیرند؛ نقش و سایر دسترسی‌ها تغییر نمی‌کند.</p><form>${people.filter(p=>p.role!=='manager').map(p=>`<label class="letter-access-option"><input type="checkbox" name="users" value="${esc(p.id)}" ${selected.has(p.id)?'checked':''}>${esc(p.display_name||p.full_name||p.email)}</label>`).join('')}<p class="letter-error" role="alert"></p><div class="letter-actions"><button type="submit" class="primary">ذخیره دسترسی‌ها</button><button type="button" data-close class="ghost">انصراف</button></div></form>`;
 let busy=false;dialog.querySelector('[data-close]').onclick=()=>{if(!busy)dialog.close()};dialog.oncancel=e=>{if(busy)e.preventDefault()};
 dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;const save=dialog.querySelector('[type=submit]');save.disabled=true;try{await rpc('set_letters_access',{p_user_ids:[...dialog.querySelectorAll('input:checked')].map(x=>x.value)});dialog.close();toast('دسترسی نامه‌ها ذخیره شد.')}catch(error){dialog.querySelector('.letter-error').textContent=error.message}finally{busy=false;save.disabled=false}};dialog.showModal();
 }catch(error){q('#lettersError').textContent=error.message}finally{button.disabled=false}
}
function init(){const view=q('#lettersView');if(!view||q('#lettersPanel'))return;try{titles.letters='نامه‌ها'}catch{}
 const panel=document.createElement('section');panel.className='letters-panel';panel.id='lettersPanel';panel.innerHTML='<h3>نامه‌ها</h3><div class="letter-toolbar"><input type="search" id="lettersSearch" placeholder="جست‌وجوی شماره، تاریخ، گیرنده یا موضوع…" aria-label="جست‌وجوی نامه"><button class="primary" id="addLetter">افزودن نامه</button><button class="ghost" id="refreshLetters">تازه‌سازی</button><button class="ghost hidden" id="lettersAccess">مدیریت دسترسی</button></div><p class="letter-error" id="lettersError" role="alert"></p><div id="lettersBody"></div>';view.append(panel);
 q('#lettersAccess').onclick=manageAccess;
 q('#lettersSearch').oninput=e=>{query=e.target.value.trim().toLowerCase();render()};q('#addLetter').onclick=()=>form();q('#refreshLetters').onclick=()=>{q('#lettersError').textContent='';load()};
 panel.onclick=async e=>{const edit=e.target.closest('[data-letter-edit]'),download=e.target.closest('[data-letter-download]');if(edit){const row=rows.find(r=>r.id===edit.dataset.letterEdit);if(row)form(row)}if(download){download.disabled=true;try{const result=await edge({action:'download',id:download.dataset.letterDownload});const a=document.createElement('a');a.href=result.url;a.rel='noopener';a.download='';document.body.append(a);a.click();a.remove()}catch(error){q('#lettersError').textContent=error.message}finally{download.disabled=false}}};
 let visible=!view.classList.contains('hidden');new MutationObserver(()=>{const next=!view.classList.contains('hidden');if(next===visible)return;visible=next;if(next)load()}).observe(view,{attributes:true,attributeFilter:['class']});
 const app=q('#appView');if(app)new MutationObserver(()=>access()).observe(app,{attributes:true,attributeFilter:['class']});
 q('#nav')?.addEventListener('click',()=>access());window.addEventListener('focus',()=>{access();if(!view.classList.contains('hidden'))load()});access();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
