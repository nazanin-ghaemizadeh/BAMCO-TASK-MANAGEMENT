(()=>{
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function open({id,title,table,filter='',save,description}){
 if(!state?.token||state.profile?.role!=='manager'||state.profile.active===false)return;
 const token=state.token;
 let dialog=document.getElementById(id);if(dialog?.open)return;
 if(!dialog){dialog=document.createElement('dialog');dialog.id=id;dialog.className='permission-dialog';document.body.append(dialog)}
 let busy=false;dialog.innerHTML=`<form><header><h3>${esc(title)}</h3><button type="button" class="ghost" data-close aria-label="بستن">×</button></header><p>${esc(description||'مدیران دسترسی دارند. انتخاب افراد فقط دسترسی همین بخش را تغییر می‌دهد.')}</p><input type="search" data-search placeholder="جست‌وجوی نام…" aria-label="جست‌وجوی افراد"><div class="permission-list" role="group" aria-label="افراد مجاز"><p role="status">در حال دریافت افراد…</p></div><p class="permission-error" role="alert"></p><footer><button class="primary" type="submit" disabled>ذخیره دسترسی‌ها</button><button class="ghost" type="button" data-close>انصراف</button></footer></form>`;
 const form=dialog.querySelector('form'),list=dialog.querySelector('.permission-list'),error=dialog.querySelector('.permission-error'),submit=form.querySelector('[type=submit]');
 dialog.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>{if(!busy)dialog.close()});dialog.oncancel=e=>{if(busy)e.preventDefault()};dialog.showModal();
 try{const [people,grants]=await Promise.all([selectAll('profiles','select=id,display_name,full_name,email,role&active=eq.true'),selectAll(table,'select=user_id'+filter)]);if(!dialog.open)return;if(state.token!==token||state.profile?.role!=='manager'){dialog.close();return}
 const selected=new Set(grants.map(g=>g.user_id));list.innerHTML=people.filter(p=>p.role!=='manager').map(p=>`<label class="permission-person"><input type="checkbox" value="${esc(p.id)}" ${selected.has(p.id)?'checked':''}><span>${esc(p.display_name||p.full_name||p.email)}</span></label>`).join('')||'<p>متولی فعالی وجود ندارد.</p>';submit.disabled=false;
 dialog.querySelector('[data-search]').oninput=e=>{const query=e.target.value.trim();list.querySelectorAll('label').forEach(label=>{label.hidden=!label.textContent.includes(query)})};
 }catch(e){error.textContent=e.message;list.innerHTML=''}
 form.onsubmit=async e=>{e.preventDefault();if(busy||submit.disabled)return;if(state.token!==token||state.profile?.role!=='manager'){dialog.close();return}busy=true;submit.disabled=true;error.textContent='';try{await save([...list.querySelectorAll('input:checked')].map(x=>x.value));dialog.close();toast('دسترسی‌ها ذخیره شدند.');window.dispatchEvent(new Event('bamco-access-changed'))}catch(e){error.textContent=e.message}finally{busy=false;submit.disabled=false}};
}
window.bamcoAccessEditor={open};
})();
