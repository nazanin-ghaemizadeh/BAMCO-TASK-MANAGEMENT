/* Phonebook: category → unit cards → unit contact table. */
(()=>{'use strict';
const q=(s,r=document)=>r?.querySelector(s),qa=(s,r=document)=>[...(r?.querySelectorAll(s)||[])],esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),fa=v=>String(v??'').replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]),digit=v=>fa(String(v??'').replace(/[۰-۹]/g,c=>'0123456789'['۰۱۲۳۴۵۶۷۸۹'.indexOf(c)]));
const labels={office:'اداری',factory:'کارخانه',external:'خارج از سازمان'};
const icons={
 office:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21V5.5L12 2l8 3.5V21M8 21v-4h8v4M8 8h.01M12 8h.01M16 8h.01M8 12h.01M12 12h.01M16 12h.01"/></svg>',
 factory:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21V11l6 3V9l6 3V5l6 3v13M7 21v-3M12 21v-3M17 21v-3M18 5V2"/></svg>',
 external:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.4 3.7 5.4 3.7 9S14.5 18.6 12 21c-2.5-2.4-3.7-5.4-3.7-9S9.5 5.4 12 3"/></svg>'
};
const handset='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 3.08 5.18 2 2 0 0 1 5.07 3h3a2 2 0 0 1 2 1.72c.12.9.33 1.77.62 2.6a2 2 0 0 1-.45 2.11L9.1 10.57a16 16 0 0 0 4.33 4.33l1.14-1.14a2 2 0 0 1 2.11-.45c.83.29 1.7.5 2.6.62A2 2 0 0 1 22 16.92z"/></svg>';
let active='office',rows=[],units=[],search='',searchOpen=false,loading=false,activeUnitId=null,selectedUnitId=null,selectedContactId=null,managingUnits=false,managedUnitId=null,page=1,pageSize=25;
const appState=()=>window.Bamco?.state||window.state||{},data=()=>window.BamcoData,access=a=>window.BamcoAccess?.can?.('phonebook',a)===true,empty=v=>String(v??'').trim()||'—';
const activeUnit=()=>units.find(x=>String(x.id)===String(activeUnitId))||null;
const selectedUnit=()=>units.find(x=>String(x.id)===String(selectedUnitId))||null;
const managedUnit=()=>units.find(x=>String(x.id)===String(managedUnitId))||null;
const contact=()=>rows.find(x=>String(x.id)===String(selectedContactId))||null;
const contactsForUnit=id=>rows.filter(x=>x.category===active&&String(x.unit_id)===String(id));
const matches=(value,terms)=>!terms.length||terms.every(term=>String(value??'').toLocaleLowerCase('fa').includes(term));
const terms=()=>search.trim().toLocaleLowerCase('fa').split(/\s+/).filter(Boolean);
const visibleContacts=()=>contactsForUnit(activeUnitId).filter(x=>matches([x.full_name,x.role_title,x.internal_extension,x.mobile_phone,x.email,x.address].join(' '),terms()));
const visibleUnits=()=>units.filter(x=>x.category===active).filter(x=>matches(x.title,terms()));
function currentPageSize(){return Math.max(1,Number(pageSize)||25)}
function range(total,size=currentPageSize(),current=page){const pages=Math.max(1,Math.ceil(total/size)),safe=Math.max(1,Math.min(pages,current));return{pages,page:safe,start:(safe-1)*size,end:Math.min(total,safe*size)}}
function searchControl(placeholder){
 const open=searchOpen||!!search;
 return `<button type="button" class="ghost phonebook-search-toggle ${open?'active':''}" data-phonebook-search-toggle aria-label="جست‌وجو" title="جست‌وجو" aria-pressed="${open?'true':'false'}">⌕</button><input class="phonebook-search ${open?'search-open':''}" type="search" data-phonebook-search placeholder="${placeholder}" value="${esc(search)}" aria-label="${placeholder}">`;
}
function toolbar(){
 const unit=activeUnit(),selected=contact(),canCreate=access('create');
 if(unit){
  const canEdit=access('edit')&&!!selected,canDelete=access('delete')&&!!selected;
  return `<div class="phonebook-command phonebook-table-command bamco-command-bar" aria-label="ابزارهای مخاطبان واحد"><button type="button" class="ghost" data-phonebook-home>بازگشت به واحدها</button><button type="button" class="danger" data-phonebook-contact-delete ${canDelete?'':'disabled'}>حذف مخاطب</button><button type="button" class="ghost" data-phonebook-contact-edit ${canEdit?'':'disabled'}>ویرایش مخاطب</button>${searchControl('جست‌وجوی نام، سمت یا شماره')}</div>`;
 }
 if(managingUnits){
  const label=managedUnit()?'بازگشت به انتخاب واحدها':'بازگشت به واحدها';
  return `<div class="phonebook-command bamco-command-bar" aria-label="ویرایش واحدهای دفتر تلفن"><button type="button" class="ghost" data-phonebook-manager-back>${label}</button>${searchControl('جست‌وجوی واحد')}</div>`;
 }
 return `<div class="phonebook-command bamco-command-bar" aria-label="ابزارهای واحدهای دفتر تلفن"><button type="button" class="ghost" data-phonebook-home>بازگشت به خانه</button><button type="button" class="primary" data-phonebook-unit ${canCreate?'':'disabled'}>ایجاد واحد</button><button type="button" class="ghost" data-phonebook-manage-units ${access('edit')?'':'disabled'}>ویرایش واحد</button>${searchControl('جست‌وجوی واحد')}</div>`;
}
function sectionHeading(){return `<header class="phonebook-section-heading"><h2>${labels[active]}</h2></header>`}
function unitHeading(unit){return `<header class="phonebook-unit-heading"><h2>${labels[active]}</h2><h3>${esc(unit.title)}</h3></header>`}
function unitCards({management=false}={}){
 const all=visibleUnits(),action=management?'data-phonebook-manage-unit-select':'data-phonebook-unit-select';
 return `<section class="phonebook-units" aria-label="واحدهای ${labels[active]}"><div class="phonebook-unit-grid">${all.length?all.map(item=>`<button type="button" class="phonebook-unit-card ${String(selectedUnitId)===String(item.id)?'selected':''}" ${action}="${esc(item.id)}"><span class="phonebook-unit-card-icon">${icons[active]}</span><strong>${esc(item.title)}</strong></button>`).join(''):`<div class="phonebook-unit-empty">هنوز واحدی در بخش «${labels[active]}» تعریف نشده است. از «ایجاد واحد» استفاده کنید.</div>`}</div></section>`;
}
function pager(total){
 const current=range(total),from=total?current.start+1:0;
 return `<footer class="phonebook-table-pagination table-pagination" role="navigation" aria-label="صفحه‌بندی مخاطبان"><span class="page-range">${fa(from)} تا ${fa(current.end)} از ${fa(total)} ردیف</span><div class="page-controls"><label>تعداد ردیف <select data-phonebook-page-size aria-label="تعداد ردیف در هر صفحه">${[10,25,50,100].map(size=>`<option value="${size}" ${currentPageSize()===size?'selected':''}>${fa(size)}</option>`).join('')}</select></label><button type="button" data-phonebook-page="first" ${current.page===1?'disabled':''}>اول</button><button type="button" data-phonebook-page="prev" ${current.page===1?'disabled':''}>قبل</button><span class="page-position">${fa(current.page)} / ${fa(current.pages)}</span><button type="button" data-phonebook-page="next" ${current.page===current.pages?'disabled':''}>بعد</button><button type="button" data-phonebook-page="last" ${current.page===current.pages?'disabled':''}>آخر</button></div></footer>`;
}
function table(){
 const all=visibleContacts(),windowed=range(all.length),items=all.slice(windowed.start,windowed.end);page=windowed.page;
 return `<div class="phonebook-table-area"><div class="phonebook-table-wrap"><table class="workspace-table phonebook-table" data-local-selection="true" data-table-suite="off" data-no-pagination="true"><thead><tr><th>نام</th><th>سمت</th><th>داخلی</th><th>شماره همراه</th><th>ایمیل سازمانی</th><th>آدرس</th></tr></thead><tbody>${items.length?items.map(item=>`<tr tabindex="0" data-phonebook-contact-select="${esc(item.id)}" class="${String(selectedContactId)===String(item.id)?'selected':''}"><td><b>${esc(item.full_name)}</b></td><td>${esc(empty(item.role_title))}</td><td dir="ltr">${esc(digit(empty(item.internal_extension)))}</td><td dir="ltr">${esc(digit(empty(item.mobile_phone)))}</td><td dir="ltr">${esc(empty(item.email))}</td><td>${esc(empty(item.address))}</td></tr>`).join(''):'<tr><td colspan="6" class="empty">مخاطبی در این واحد ثبت نشده است.</td></tr>'}</tbody></table></div>${pager(all.length)}</div>`;
}
function unitWorkspace(){const unit=activeUnit();if(!unit)return unitCards();return `<section class="phonebook-unit-workspace" aria-label="${esc(unit.title)}">${unitHeading(unit)}${toolbar()}${table()}</section>`}
function managedUnitEditor(unit){
 return `<section class="phonebook-unit-editor"><div class="phonebook-unit-editor-title"><h3>ویرایش واحد «${esc(unit.title)}»</h3><p>عنوان واحد را تغییر دهید یا خود واحد را حذف کنید. مخاطبان حذف نمی‌شوند.</p></div><form data-phonebook-managed-unit-form><label>نام واحد<input name="title" maxlength="160" required value="${esc(unit.title)}"></label><div class="phonebook-unit-editor-actions"><button type="submit" class="primary" ${access('edit')?'':'disabled'}>ذخیره تغییرات</button><button type="button" class="danger" data-phonebook-managed-unit-delete ${access('delete')?'':'disabled'}>حذف واحد</button></div></form></section>`;
}
function managementWorkspace(){const unit=managedUnit();return `<section class="phonebook-management-workspace">${sectionHeading()}${toolbar()}${unit?managedUnitEditor(unit):`<div class="phonebook-manager-intro"><h3>انتخاب واحد برای ویرایش</h3><p>واحد موردنظر را انتخاب کنید.</p></div>${unitCards({management:true})}`}</section>`}
function categoryWorkspace(){return `${sectionHeading()}${toolbar()}<div class="phonebook-status" role="status">${loading?'در حال دریافت دفتر تلفن…':''}</div>${unitCards()}`}
function contactDialog(row){
 const unit=activeUnit();
 return `<dialog class="modal enterprise-modal phonebook-dialog"><form><div class="modal-head"><h3>${row?'ویرایش مخاطب':'ثبت مخاطب'}</h3><button type="button" data-phonebook-close aria-label="بستن">×</button></div><p class="phonebook-dialog-context">واحد: <b>${esc(unit?.title||'')}</b></p><div class="form-grid"><label>نام و نام خانوادگی<input name="full_name" maxlength="160" required value="${esc(row?.full_name||'')}"></label><label>سمت<input name="role_title" maxlength="160" value="${esc(row?.role_title||'')}"></label><label>داخلی<input name="internal_extension" inputmode="numeric" maxlength="16" value="${esc(row?.internal_extension||'')}"></label><label>شماره همراه<input name="mobile_phone" inputmode="tel" maxlength="32" value="${esc(row?.mobile_phone||'')}"></label><label>ایمیل سازمانی<input name="email" type="email" maxlength="254" dir="ltr" value="${esc(row?.email||'')}"></label><label class="span-2">آدرس<textarea name="address" rows="3" maxlength="1200">${esc(row?.address||'')}</textarea></label></div><div class="modal-actions"><button type="button" class="ghost" data-phonebook-close>انصراف</button><button type="submit" class="primary">${row?'ذخیره تغییرات':'ذخیره مخاطب'}</button></div></form></dialog>`;
}
function unitDialog(){return `<dialog class="modal enterprise-modal phonebook-unit-dialog"><form><div class="modal-head"><h3>ایجاد واحد</h3><button type="button" data-phonebook-unit-close aria-label="بستن">×</button></div><p>واحد در بخش «<b>${labels[active]}</b>» ثبت می‌شود.</p><div class="form-grid"><label class="span-2">نام واحد<input name="title" maxlength="160" required></label></div><div class="modal-actions"><button type="button" class="ghost" data-phonebook-unit-close>انصراف</button><button type="submit" class="primary">ذخیره واحد</button></div></form></dialog>`}
function render(){const root=q('#phoneBookView');if(!root)return;const body=activeUnit()?unitWorkspace():managingUnits?managementWorkspace():categoryWorkspace();root.innerHTML=`<span class="phonebook-v2-marker" hidden></span><section class="phonebook-shell enterprise-feature-root">${body}</section>${contactDialog(contact())}${unitDialog()}`;bind(root)}
async function load(){
 const current=appState();if(!current.token||!current.user?.id||!data())return;loading=true;render();
 try{
  const [directory,unitRows]=await Promise.all([data().select('contact_directory','select=id,category,unit_id,full_name,role_title,mobile_phone,internal_extension,email,address&order=full_name.asc'),data().select('phonebook_units','select=id,category,title&order=title.asc')]);
  rows=directory||[];units=unitRows||[];
  if(activeUnitId&&!activeUnit())activeUnitId=null;if(selectedUnitId&&!selectedUnit())selectedUnitId=null;if(managedUnitId&&!managedUnit())managedUnitId=null;if(selectedContactId&&!contact())selectedContactId=null;
 }catch(error){window.toast?.(error.message||'دریافت دفتر تلفن انجام نشد.',true)}finally{loading=false;render()}
}
async function saveContact(form,row){
 const current=appState(),unit=activeUnit();if(!unit)throw Error('ابتدا واحد موردنظر را باز کنید.');
 const record={category:active,unit_id:unit.id,full_name:form.elements.full_name.value.trim(),role_title:form.elements.role_title.value.trim()||null,mobile_phone:form.elements.mobile_phone.value.trim()||null,internal_extension:form.elements.internal_extension.value.trim()||null,email:form.elements.email.value.trim()||null,address:form.elements.address.value.trim()||null,created_by:current.user.id,updated_by:current.user.id};
 if(!record.full_name)throw Error('نام مخاطب را وارد کنید.');
 if(row)await data().update('contact_directory',`id=eq.${encodeURIComponent(row.id)}`,record);else if(!(await data().insert('contact_directory',record))?.length)throw Error('ذخیره مخاطب تأیید نشد.');
 selectedContactId=null;await load();q('#phoneBookView .phonebook-dialog')?.close();window.toast?.(row?'تغییرات مخاطب ذخیره شد.':'مخاطب ذخیره شد.');
}
function validateUnitTitle(form,row){const title=form.elements.title.value.trim();if(!title)throw Error('نام واحد را وارد کنید.');if(units.some(item=>item.category===active&&item.title.trim()===title&&String(item.id)!==String(row?.id)))throw Error('این واحد قبلاً ثبت شده است.');return title}
async function saveNewUnit(form){
 const current=appState(),title=validateUnitTitle(form,null);
 if(!(await data().insert('phonebook_units',{category:active,title,created_by:current.user.id,updated_by:current.user.id}))?.length)throw Error('ذخیره واحد تأیید نشد.');
 await load();q('#phoneBookView .phonebook-unit-dialog')?.close();window.toast?.('واحد به‌صورت کارت ایجاد شد.');
}
async function saveManagedUnit(form){
 const current=appState(),unit=managedUnit();if(!unit)throw Error('ابتدا واحد را انتخاب کنید.');const title=validateUnitTitle(form,unit);
 await data().update('phonebook_units',`id=eq.${encodeURIComponent(unit.id)}`,{title,updated_by:current.user.id});await load();window.toast?.('تغییرات واحد ذخیره شد.');
}
async function removeContact(){
 const picked=contact();if(!picked)throw Error('ابتدا یک مخاطب را انتخاب کنید.');const ask=window.bamcoConfirm?await window.bamcoConfirm(`مخاطب «${picked.full_name}» حذف شود؟`):window.confirm(`مخاطب «${picked.full_name}» حذف شود؟`);if(!ask)return;
 await data().remove('contact_directory',`id=eq.${encodeURIComponent(picked.id)}`);selectedContactId=null;await load();window.toast?.('مخاطب حذف شد.');
}
async function removeManagedUnit(){
 const unit=managedUnit();if(!unit)throw Error('ابتدا واحد را انتخاب کنید.');const ask=window.bamcoConfirm?await window.bamcoConfirm(`واحد «${unit.title}» حذف شود؟ مخاطبان آن حذف نمی‌شوند.`):window.confirm(`واحد «${unit.title}» حذف شود؟ مخاطبان آن حذف نمی‌شوند.`);if(!ask)return;
 await data().remove('phonebook_units',`id=eq.${encodeURIComponent(unit.id)}`);managedUnitId=null;selectedUnitId=null;activeUnitId=null;await load();window.toast?.('واحد حذف شد؛ مخاطبان بدون حذف باقی ماندند.');
}
function openDialog(selector){const dialog=q(selector);if(dialog&&!dialog.open)dialog.showModal()}
function resetSearch(){search='';searchOpen=false;page=1}
function openSection(category='office'){
 if(!Object.hasOwn(labels,category))category='office';active=category;resetSearch();activeUnitId=null;selectedUnitId=null;selectedContactId=null;managingUnits=false;managedUnitId=null;
 const opened=window.BamcoNavigation?.navigate?.('phoneBook');if(opened===false)return false;render();void load();return true;
}
function bind(root){
 const currentContact=contact();
 q('[data-phonebook-home]',root)?.addEventListener('click',()=>{if(activeUnit()){activeUnitId=null;selectedContactId=null;resetSearch();render()}else window.bamcoShowHome?.()});
 q('[data-phonebook-unit]',root)?.addEventListener('click',()=>{render();openDialog('#phoneBookView .phonebook-unit-dialog')});
 q('[data-phonebook-manage-units]',root)?.addEventListener('click',()=>{managingUnits=true;managedUnitId=null;selectedUnitId=null;resetSearch();render()});
 q('[data-phonebook-manager-back]',root)?.addEventListener('click',()=>{if(managedUnit()){managedUnitId=null;resetSearch();render()}else{managingUnits=false;resetSearch();render()}});
 q('[data-phonebook-contact-edit]',root)?.addEventListener('click',()=>{if(currentContact)openDialog('#phoneBookView .phonebook-dialog')});
 q('[data-phonebook-contact-delete]',root)?.addEventListener('click',()=>void removeContact().catch(error=>window.toast?.(error.message||'حذف انجام نشد.',true)));
 q('[data-phonebook-managed-unit-delete]',root)?.addEventListener('click',()=>void removeManagedUnit().catch(error=>window.toast?.(error.message||'حذف انجام نشد.',true)));
 q('[data-phonebook-search-toggle]',root)?.addEventListener('click',()=>{searchOpen=!searchOpen;if(!searchOpen)search='';page=1;render();if(searchOpen)requestAnimationFrame(()=>q('[data-phonebook-search]')?.focus())});
 q('[data-phonebook-search]',root)?.addEventListener('input',event=>{const cursor=event.currentTarget.selectionStart;search=event.currentTarget.value;page=1;render();const input=q('[data-phonebook-search]');input?.focus({preventScroll:true});if(cursor!=null)input?.setSelectionRange(cursor,cursor)});
 q('[data-phonebook-search]',root)?.addEventListener('keydown',event=>{if(event.key==='Escape'){resetSearch();render()}});
 qa('[data-phonebook-unit-select]',root).forEach(button=>button.onclick=()=>{activeUnitId=button.dataset.phonebookUnitSelect;selectedUnitId=activeUnitId;selectedContactId=null;managingUnits=false;resetSearch();render()});
 qa('[data-phonebook-manage-unit-select]',root).forEach(button=>button.onclick=()=>{managedUnitId=button.dataset.phonebookManageUnitSelect;resetSearch();render()});
 qa('[data-phonebook-contact-select]',root).forEach(row=>{const pick=()=>{selectedContactId=row.dataset.phonebookContactSelect;render()};row.onclick=pick;row.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();pick()}}});
 qa('[data-phonebook-page]',root).forEach(button=>button.onclick=()=>{const total=visibleContacts().length,current=range(total);page=({first:1,prev:current.page-1,next:current.page+1,last:current.pages})[button.dataset.phonebookPage];render();q('.phonebook-table-wrap',root)?.scrollTo({top:0})});
 q('[data-phonebook-page-size]',root)?.addEventListener('change',event=>{pageSize=Number(event.currentTarget.value)||25;page=1;render()});
 qa('[data-phonebook-close]',root).forEach(button=>button.onclick=()=>q('.phonebook-dialog',root)?.close());
 qa('[data-phonebook-unit-close]',root).forEach(button=>button.onclick=()=>q('.phonebook-unit-dialog',root)?.close());
 q('.phonebook-dialog form',root)?.addEventListener('submit',event=>{event.preventDefault();void saveContact(event.currentTarget,currentContact).catch(error=>window.toast?.(error.message,true))});
 q('.phonebook-unit-dialog form',root)?.addEventListener('submit',event=>{event.preventDefault();void saveNewUnit(event.currentTarget).catch(error=>window.toast?.(error.message,true))});
 q('[data-phonebook-managed-unit-form]',root)?.addEventListener('submit',event=>{event.preventDefault();void saveManagedUnit(event.currentTarget).catch(error=>window.toast?.(error.message,true))});
}
function install(){
 const nav=q('#nav'),workspace=q('.workspace');if(!nav||!workspace||q('#phoneBookView')||!window.BamcoData)return;
 const button=document.createElement('button');button.type='button';button.dataset.view='phoneBook';button.innerHTML=`<b class="phonebook-nav-icon">${handset}</b><span>دفتر تلفن</span>`;nav.append(button);
 const view=document.createElement('section');view.id='phoneBookView';view.className='view hidden';view.dataset.featureKey='phonebook';workspace.append(view);
 window.BamcoNavigation?.configure?.({state:appState(),titles:{phoneBook:'دفتر تلفن'}});
 try{window.BamcoNavigation?.registerView?.('phoneBook',{activate:()=>void load()})}catch{}
 window.bamcoPhonebook=Object.freeze({open:openSection,refresh:load,active:()=>active});render();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
