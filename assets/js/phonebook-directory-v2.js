/* Phonebook: category → unit card → unit contact table. */
(()=>{'use strict';
const q=(s,r=document)=>r?.querySelector(s),qa=(s,r=document)=>[...(r?.querySelectorAll(s)||[])],esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),fa=v=>String(v??'').replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]),digit=v=>fa(String(v??'').replace(/[۰-۹]/g,c=>'0123456789'['۰۱۲۳۴۵۶۷۸۹'.indexOf(c)]));
const labels={office:'اداری',factory:'کارخانه',external:'خارج از سازمان'};
const icons={
 office:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21V5.5L12 2l8 3.5V21M8 21v-4h8v4M8 8h.01M12 8h.01M16 8h.01M8 12h.01M12 12h.01M16 12h.01"/></svg>',
 factory:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21V11l6 3V9l6 3V5l6 3v13M7 21v-3M12 21v-3M17 21v-3M18 5V2"/></svg>',
 external:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.4 3.7 5.4 3.7 9S14.5 18.6 12 21c-2.5-2.4-3.7-5.4-3.7-9S9.5 5.4 12 3"/></svg>'
};
const handset='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 3.08 5.18 2 2 0 0 1 5.07 3h3a2 2 0 0 1 2 1.72c.12.9.33 1.77.62 2.6a2 2 0 0 1-.45 2.11L9.1 10.57a16 16 0 0 0 4.33 4.33l1.14-1.14a2 2 0 0 1 2.11-.45c.83.29 1.7.5 2.6.62A2 2 0 0 1 22 16.92z"/></svg>';
let active='office',rows=[],units=[],search='',loading=false,activeUnitId=null,selectedContactId=null;
const appState=()=>window.Bamco?.state||window.state||{},data=()=>window.BamcoData,access=a=>window.BamcoAccess?.can?.('phonebook',a)===true,empty=v=>String(v??'').trim()||'—';
const activeUnit=()=>units.find(x=>String(x.id)===String(activeUnitId))||null;
const contact=()=>rows.find(x=>String(x.id)===String(selectedContactId))||null;
const contactsForUnit=id=>rows.filter(x=>x.category===active&&String(x.unit_id)===String(id));
const matches=(value,terms)=>!terms.length||terms.every(term=>String(value??'').toLocaleLowerCase('fa').includes(term));
const terms=()=>search.trim().toLocaleLowerCase('fa').split(/\s+/).filter(Boolean);
const visibleContacts=()=>contactsForUnit(activeUnitId).filter(x=>matches([x.full_name,x.role_title,x.internal_extension,x.mobile_phone,x.email,x.address].join(' '),terms()));
const visibleUnits=()=>units.filter(x=>x.category===active).filter(x=>matches(x.title,terms()));
const actionTarget=()=>contact()||activeUnit();
function toolbar(){
 const unit=activeUnit(),target=actionTarget(),canCreate=access('create'),canEdit=access('edit')&&!!target,canDelete=access('delete')&&!!target;
 const placeholder=unit?'جست‌وجوی نام، سمت یا شماره':'جست‌وجوی واحد';
 return `<div class="phonebook-command bamco-command-bar" aria-label="ابزارهای دفتر تلفن"><button type="button" class="ghost" data-phonebook-home>بازگشت به خانه</button><button type="button" class="ghost" data-phonebook-unit ${canCreate?'':'disabled'}>ایجاد واحد</button><button type="button" class="primary" data-phonebook-new ${canCreate&&unit?'':'disabled'} title="${unit?'':'ابتدا یک واحد را باز کنید'}">ثبت مخاطب</button><button type="button" class="danger" data-phonebook-delete ${canDelete?'':'disabled'}>حذف</button><button type="button" class="ghost" data-phonebook-edit ${canEdit?'':'disabled'}>ویرایش</button><input type="search" data-phonebook-search placeholder="${placeholder}" value="${esc(search)}" aria-label="${placeholder}"></div>`;
}
function tabs(){return `<div class="phonebook-tabs" role="tablist" aria-label="بخش‌های دفتر تلفن">${Object.entries(labels).map(([key,label])=>`<button type="button" role="tab" aria-selected="${key===active}" class="${key===active?'active':''}" data-phonebook-tab="${key}"><span class="phonebook-tab-icon">${icons[key]}</span><strong>${label}</strong></button>`).join('')}</div>`}
function unitCards(){
 const all=visibleUnits();
 return `<section class="phonebook-units" aria-label="واحدهای ${labels[active]}"><div class="phonebook-units-title"><span class="phonebook-section-icon">${icons[active]}</span><strong>واحدهای ${labels[active]}</strong></div><div class="phonebook-unit-grid">${all.length?all.map(item=>`<button type="button" class="phonebook-unit-card" data-phonebook-unit-select="${esc(item.id)}"><span class="phonebook-unit-card-icon">${icons[active]}</span><strong>${esc(item.title)}</strong><small>${fa(contactsForUnit(item.id).length)} مخاطب</small></button>`).join(''):`<div class="phonebook-unit-empty">هنوز واحدی در بخش «${labels[active]}» تعریف نشده است. از «ایجاد واحد» استفاده کنید.</div>`}</div></section>`;
}
function table(){
 const all=visibleContacts();
 return `<div class="phonebook-table-wrap"><table class="workspace-table phonebook-table"><thead><tr><th>نام</th><th>سمت</th><th>داخلی</th><th>شماره همراه</th><th>ایمیل سازمانی</th><th>آدرس</th></tr></thead><tbody>${all.length?all.map(item=>`<tr tabindex="0" data-phonebook-contact-select="${esc(item.id)}" class="${String(selectedContactId)===String(item.id)?'selected':''}"><td><b>${esc(item.full_name)}</b></td><td>${esc(empty(item.role_title))}</td><td dir="ltr">${esc(digit(empty(item.internal_extension)))}</td><td dir="ltr">${esc(digit(empty(item.mobile_phone)))}</td><td dir="ltr">${esc(empty(item.email))}</td><td>${esc(empty(item.address))}</td></tr>`).join(''):`<tr><td colspan="6" class="empty">مخاطبی در این واحد ثبت نشده است.</td></tr>`}</tbody></table></div>`;
}
function unitWorkspace(){
 const unit=activeUnit();
 if(!unit)return unitCards();
 return `<section class="phonebook-unit-workspace" aria-label="${esc(unit.title)}"><div class="phonebook-unit-heading"><span class="phonebook-section-icon">${icons[active]}</span><div><strong>${esc(unit.title)}</strong><small>${labels[active]} · جدول مخاطبان واحد</small></div></div>${table()}</section>`;
}
function contactDialog(row){
 const unit=activeUnit();
 return `<dialog class="modal enterprise-modal phonebook-dialog"><form><div class="modal-head"><h3>${row?'ویرایش مخاطب':'ثبت مخاطب'}</h3><button type="button" data-phonebook-close aria-label="بستن">×</button></div><p class="phonebook-dialog-context">واحد: <b>${esc(unit?.title||'')}</b></p><div class="form-grid"><label>نام و نام خانوادگی<input name="full_name" maxlength="160" required value="${esc(row?.full_name||'')}"></label><label>سمت<input name="role_title" maxlength="160" value="${esc(row?.role_title||'')}"></label><label>داخلی<input name="internal_extension" inputmode="numeric" maxlength="16" value="${esc(row?.internal_extension||'')}"></label><label>شماره همراه<input name="mobile_phone" inputmode="tel" maxlength="32" value="${esc(row?.mobile_phone||'')}"></label><label>ایمیل سازمانی<input name="email" type="email" maxlength="254" dir="ltr" value="${esc(row?.email||'')}"></label><label class="span-2">آدرس<textarea name="address" rows="3" maxlength="1200">${esc(row?.address||'')}</textarea></label></div><div class="modal-actions"><button type="button" class="ghost" data-phonebook-close>انصراف</button><button type="submit" class="primary">${row?'ذخیره تغییرات':'ذخیره مخاطب'}</button></div></form></dialog>`;
}
function unitDialog(row){return `<dialog class="modal enterprise-modal phonebook-unit-dialog"><form><div class="modal-head"><h3>${row?'ویرایش واحد':'ایجاد واحد'}</h3><button type="button" data-phonebook-unit-close aria-label="بستن">×</button></div><p>واحد در بخش «<b>${labels[active]}</b>» ثبت می‌شود.</p><div class="form-grid"><label class="span-2">نام واحد<input name="title" maxlength="160" required value="${esc(row?.title||'')}"></label></div><div class="modal-actions"><button type="button" class="ghost" data-phonebook-unit-close>انصراف</button><button type="submit" class="primary">${row?'ذخیره تغییرات':'ذخیره واحد'}</button></div></form></dialog>`}
function render(){
 const root=q('#phoneBookView');if(!root)return;
 root.innerHTML=`<span class="phonebook-v2-marker" hidden></span><section class="phonebook-shell enterprise-feature-root">${toolbar()}${tabs()}<div class="phonebook-status" role="status">${loading?'در حال دریافت دفتر تلفن…':''}</div>${activeUnit()?unitWorkspace():unitCards()}</section>${contactDialog(contact())}${unitDialog(activeUnit())}`;
 bind(root);
}
async function load(){
 const current=appState();if(!current.token||!current.user?.id||!data())return;
 loading=true;render();
 try{
  const [directory,unitRows]=await Promise.all([data().select('contact_directory','select=id,category,unit_id,full_name,role_title,mobile_phone,internal_extension,email,address&order=full_name.asc'),data().select('phonebook_units','select=id,category,title&order=title.asc')]);
  rows=directory||[];units=unitRows||[];
  if(activeUnitId&&!activeUnit())activeUnitId=null;
  if(selectedContactId&&!contact())selectedContactId=null;
 }catch(error){window.toast?.(error.message||'دریافت دفتر تلفن انجام نشد.',true)}finally{loading=false;render()}
}
async function saveContact(form,row){
 const current=appState(),unit=activeUnit();if(!unit)throw Error('ابتدا واحد موردنظر را باز کنید.');
 const record={category:active,unit_id:unit.id,full_name:form.elements.full_name.value.trim(),role_title:form.elements.role_title.value.trim()||null,mobile_phone:form.elements.mobile_phone.value.trim()||null,internal_extension:form.elements.internal_extension.value.trim()||null,email:form.elements.email.value.trim()||null,address:form.elements.address.value.trim()||null,created_by:current.user.id,updated_by:current.user.id};
 if(!record.full_name)throw Error('نام مخاطب را وارد کنید.');
 if(row)await data().update('contact_directory',`id=eq.${encodeURIComponent(row.id)}`,record);else if(!(await data().insert('contact_directory',record))?.length)throw Error('ذخیره مخاطب تأیید نشد.');
 selectedContactId=null;await load();q('#phoneBookView .phonebook-dialog')?.close();window.toast?.(row?'تغییرات مخاطب ذخیره شد.':'مخاطب ذخیره شد.');
}
async function saveUnit(form,row){
 const current=appState(),title=form.elements.title.value.trim();if(!title)throw Error('نام واحد را وارد کنید.');
 if(units.some(item=>item.category===active&&item.title.trim()===title&&String(item.id)!==String(row?.id)))throw Error('این واحد قبلاً ثبت شده است.');
 if(row)await data().update('phonebook_units',`id=eq.${encodeURIComponent(row.id)}`,{title,updated_by:current.user.id});else if(!(await data().insert('phonebook_units',{category:active,title,created_by:current.user.id,updated_by:current.user.id}))?.length)throw Error('ذخیره واحد تأیید نشد.');
 await load();q('#phoneBookView .phonebook-unit-dialog')?.close();window.toast?.(row?'تغییرات واحد ذخیره شد.':'واحد به‌صورت کارت ایجاد شد.');
}
async function remove(){
 const picked=actionTarget();if(!picked)return;
 const pickedContact=contact();
 if(!pickedContact&&contactsForUnit(picked.id).length)throw Error('ابتدا مخاطبان این واحد را حذف یا منتقل کنید.');
 const type=pickedContact?'مخاطب':'واحد';if(!await window.bamcoConfirm?.(`«${picked.full_name||picked.title}» حذف شود؟`))return;
 await data().remove(pickedContact?'contact_directory':'phonebook_units',`id=eq.${encodeURIComponent(picked.id)}`);
 if(pickedContact)selectedContactId=null;else activeUnitId=null;
 await load();window.toast?.(`${type} حذف شد.`);
}
function openDialog(selector){const dialog=q(selector);if(dialog&&!dialog.open)dialog.showModal()}
function openSection(category='office'){
 if(!Object.hasOwn(labels,category))category='office';
 active=category;search='';activeUnitId=null;selectedContactId=null;
 const opened=window.BamcoNavigation?.navigate?.('phoneBook');if(opened===false)return false;
 render();void load();return true;
}
function bind(root){
 const currentContact=contact(),currentUnit=activeUnit();
 q('[data-phonebook-home]',root).onclick=()=>window.bamcoShowHome?.();
 q('[data-phonebook-new]',root).onclick=()=>{if(!activeUnit())return;selectedContactId=null;render();openDialog('#phoneBookView .phonebook-dialog')};
 q('[data-phonebook-unit]',root).onclick=()=>{render();openDialog('#phoneBookView .phonebook-unit-dialog')};
 q('[data-phonebook-edit]',root).onclick=()=>openDialog(currentContact?'#phoneBookView .phonebook-dialog':'#phoneBookView .phonebook-unit-dialog');
 q('[data-phonebook-delete]',root).onclick=()=>void remove().catch(error=>window.toast?.(error.message||'حذف انجام نشد.',true));
 q('[data-phonebook-search]',root).oninput=event=>{const cursor=event.currentTarget.selectionStart;search=event.currentTarget.value;render();const input=q('[data-phonebook-search]');input?.focus({preventScroll:true});input?.setSelectionRange(cursor,cursor)};
 qa('[data-phonebook-tab]',root).forEach(button=>button.onclick=()=>{active=button.dataset.phonebookTab;search='';activeUnitId=null;selectedContactId=null;render()});
 qa('[data-phonebook-unit-select]',root).forEach(button=>button.onclick=()=>{activeUnitId=button.dataset.phonebookUnitSelect;selectedContactId=null;search='';render()});
 qa('[data-phonebook-contact-select]',root).forEach(row=>{const pick=()=>{selectedContactId=row.dataset.phonebookContactSelect;render()};row.onclick=pick;row.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();pick()}}});
 qa('[data-phonebook-close]',root).forEach(button=>button.onclick=()=>q('.phonebook-dialog',root)?.close());
 qa('[data-phonebook-unit-close]',root).forEach(button=>button.onclick=()=>q('.phonebook-unit-dialog',root)?.close());
 q('.phonebook-dialog form',root).onsubmit=event=>{event.preventDefault();void saveContact(event.currentTarget,currentContact).catch(error=>window.toast?.(error.message,true))};
 q('.phonebook-unit-dialog form',root).onsubmit=event=>{event.preventDefault();void saveUnit(event.currentTarget,currentUnit).catch(error=>window.toast?.(error.message,true))};
}
function install(){
 const nav=q('#nav'),workspace=q('.workspace');if(!nav||!workspace||q('#phoneBookView')||!window.BamcoData)return;
 const button=document.createElement('button');button.type='button';button.dataset.view='phoneBook';button.innerHTML=`<b class="phonebook-nav-icon">${handset}</b><span>دفتر تلفن</span>`;nav.append(button);
 const view=document.createElement('section');view.id='phoneBookView';view.className='view hidden';view.dataset.featureKey='phonebook';workspace.append(view);
 window.BamcoNavigation?.configure?.({state:appState(),titles:{phoneBook:'دفتر تلفن'}});
 window.BamcoNavigation?.registerView?.('phoneBook',{activate:()=>void load()});
 window.bamcoPhonebook=Object.freeze({open:openSection,refresh:load,active:()=>active});render();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
