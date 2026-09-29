/* Personal notes and the task-aware smart voice assistant. */
(()=>{
'use strict';
const q=(s,r=document)=>r?.querySelector(s),qa=(s,r=document)=>[...(r?.querySelectorAll(s)||[])];
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const fa=value=>String(value??'').replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);
const noteColors=['sun','rose','mint','sky','lavender','peach'];
let notes=[],selectedNote='',inactiveMode=false,notesReady=false,notesBusy=false,notesGeneration=0;

function icon(path){return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`}
const ICONS={
 note:'M4 3h16v18H4zM8 8h8M8 12h8M8 16h5M16 3v5h4',
 assistant:'M12 3a4 4 0 0 0-4 4v3a4 4 0 0 0 8 0V7a4 4 0 0 0-4-4ZM5 10a7 7 0 0 0 14 0M12 17v4M8 21h8',
 home:'M3 11 12 3l9 8v10h-6v-6H9v6H3z',plus:'M12 5v14M5 12h14',edit:'M4 20h4L19 9l-4-4L4 16v4ZM13 7l4 4',trash:'M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14',archive:'M4 5h16v4H4zM6 9v11h12V9M9 13h6',active:'M20 12a8 8 0 1 1-2.35-5.65M20 4v6h-6M8 12l2.3 2.3L16 8.6',mic:'M12 3a4 4 0 0 0-4 4v4a4 4 0 0 0 8 0V7a4 4 0 0 0-4-4ZM5 11a7 7 0 0 0 14 0M12 18v3M8 21h8',send:'m3 3 18 9-18 9 4-9-4-9M7 12h14',refresh:'M20 11a8 8 0 1 0-2 5M20 4v7h-7'
};

function installNavigation(){
 const nav=q('#nav'),workspace=q('.workspace');if(!nav||!workspace||q('#notesView'))return;
 const noteButton=document.createElement('button');noteButton.type='button';noteButton.dataset.view='notes';noteButton.innerHTML=`<b>${icon(ICONS.note)}</b><span>یادداشت‌ها</span>`;
 const assistantButton=document.createElement('button');assistantButton.type='button';assistantButton.dataset.view='voiceAssistant';assistantButton.innerHTML=`<b>${icon(ICONS.assistant)}</b><span>دستیار هوشمند</span>`;
 nav.append(noteButton,assistantButton);
 const notesView=document.createElement('section');notesView.id='notesView';notesView.className='view hidden personal-notes-view';notesView.dataset.featureKey='notes';notesView.innerHTML=`
  <div class="personal-command-row bamco-command-bar">
   <button type="button" class="ghost" data-personal-home>بازگشت به خانه</button>
   <button type="button" class="primary" data-note-new>یادداشت جدید</button>
   <button type="button" class="ghost" data-note-edit disabled>ویرایش</button>
   <button type="button" class="danger" data-note-delete disabled>حذف</button>
   <div class="notes-state-tabs" aria-label="وضعیت یادداشت‌ها"><button type="button" class="ghost active" aria-pressed="true" data-note-tab="active">یادداشت‌های فعال</button><button type="button" class="ghost" aria-pressed="false" data-note-tab="inactive">یادداشت‌های غیرفعال</button></div>
  </div>
  <div class="personal-notes-status" role="status" hidden></div>
  <div class="sticky-note-board" aria-live="polite"></div>
  <dialog class="modal small personal-note-dialog"><form><div class="modal-head"><div><h3>یادداشت جدید</h3><p>عنوان کوتاه و متن یادداشت را وارد کنید.</p></div><button type="button" data-note-close>×</button></div><label>عنوان<input name="title" maxlength="120" required></label><label>متن<textarea name="body" rows="6" maxlength="4000" required></textarea></label><fieldset class="note-color-picker"><legend>رنگ یادداشت</legend>${noteColors.map((color,index)=>`<label class="note-color ${color}"><input type="radio" name="color" value="${color}" ${index===0?'checked':''}><span aria-label="رنگ ${fa(index+1)}"></span></label>`).join('')}</fieldset><div class="modal-actions"><button type="button" class="ghost" data-note-close>انصراف</button><button type="submit" class="primary">ذخیره یادداشت</button></div></form></dialog>`;
 const assistantView=document.createElement('section');assistantView.id='voiceAssistantView';assistantView.className='view hidden smart-assistant-view';assistantView.dataset.featureKey='voiceAssistant';assistantView.innerHTML=`
  <div class="personal-command-row bamco-command-bar"><button type="button" class="ghost" data-personal-home>بازگشت به خانه</button><button type="button" class="ghost" data-assistant-history>تاریخچه گفت‌وگو</button><button type="button" class="ghost" data-assistant-new>گفت‌وگوی جدید</button></div>
  <div class="assistant-stage">
   <aside class="assistant-character-panel">
    <div class="assistant-avatar-rig" role="img" aria-label="دستیار متحرک خانم وضعیت مطلوب">
     <div class="assistant-avatar-scene" data-avatar-scene>
      <img class="assistant-avatar-frame waiting-grounded" src="assets/images/assistant-female-waiting-grounded.png" alt="" width="1024" height="1280" decoding="async">
      <img class="assistant-avatar-frame waiting-tap" src="assets/images/assistant-female-waiting.png" alt="" width="1024" height="1280" decoding="async">
      <img class="assistant-avatar-frame listening" src="assets/images/assistant-female-listening.png" alt="" width="1024" height="1280" decoding="async">
      <img class="assistant-avatar-frame thinking" src="assets/images/assistant-female-thinking.png" alt="" width="1024" height="1280" decoding="async">
      <img class="assistant-avatar-frame speaking" src="assets/images/assistant-female-speaking.png" alt="" width="1024" height="1280" decoding="async">
      <img class="assistant-avatar-face mouth-rest" src="assets/images/assistant-speaking-mouth-closed.png" alt="" width="1122" height="1402" decoding="async">
      <img class="assistant-avatar-face eyes-blink" src="assets/images/assistant-speaking-blink.png" alt="" width="1122" height="1402" decoding="async">
      <img class="assistant-avatar-face brows-emphasis" src="assets/images/assistant-speaking-brows-raised.png" alt="" width="1122" height="1402" decoding="async">
      <span class="assistant-avatar-floor" aria-hidden="true"></span>
     </div>
    </div>
    <span class="assistant-avatar-error" hidden>تصویر دستیار بارگذاری نشد؛ گفت‌وگو همچنان در دسترس است.</span>
    <span class="assistant-voice-activity" role="status" aria-label="صدا غیرفعال است"></span>
   </aside>
   <section class="assistant-chat-panel">
    <header class="assistant-chat-head"><div><strong>دستیار صوتی هوشمند</strong><span class="assistant-status" role="status">آماده گفت‌وگو</span></div><button type="button" class="assistant-live-button" data-assistant-live aria-pressed="false">شروع مکالمه</button><button type="button" class="ghost assistant-play-button" data-assistant-play hidden>پخش صدا</button><button type="button" class="ghost" data-assistant-mute aria-label="بی‌صدا کردن دستیار" aria-pressed="false">بی‌صدا</button><button type="button" class="ghost" data-assistant-stop aria-label="توقف صدای دستیار">توقف صدا</button></header>
    <div class="assistant-messages" aria-live="polite"></div>
    <form class="assistant-composer"><button type="button" class="assistant-mic" aria-label="شروع مکالمهٔ زنده" title="شروع مکالمهٔ زنده" aria-pressed="false">${icon(ICONS.mic)}</button><textarea rows="1" maxlength="4000" placeholder="دربارهٔ هر چیزی بپرسید؛ یا دکمهٔ مکالمه را بزنید…" required></textarea><button type="submit" class="assistant-send" aria-label="ارسال پیام">${icon(ICONS.send)}</button></form>
   </section>
  </div>`;
 workspace.append(notesView,assistantView);
 window.BamcoNavigation?.configure?.({state,titles:{notes:'یادداشت‌ها',voiceAssistant:'دستیار هوشمند'}});
 bindNotes(notesView);
 const assistant=window.BamcoAssistantRuntime.create(assistantView,{session:()=>({token:state.token,userId:state.user?.id}),loadSticker:loadAssistantSticker});
 window.BamcoNavigation?.registerView?.('notes',{activate:()=>{inactiveMode=false;selectedNote='';void loadNotes()}});
 window.BamcoNavigation?.registerView?.('voiceAssistant',{activate:assistant.activate,dispose:assistant.dispose});
}

function noteStorageKey(){return`bamco.personal-notes.${state.user?.id||'anonymous'}`}
function readCachedNotes(){try{const data=JSON.parse(localStorage.getItem(noteStorageKey())||'[]');return Array.isArray(data)?data:[]}catch{return[]}}
function cacheNotes(){try{localStorage.setItem(noteStorageKey(),JSON.stringify(notes))}catch{}renderNotes()}
function fromRow(row){return{id:row.id,title:row.title,body:row.body,color:row.color,inactive:row.inactive,createdAt:row.created_at,updatedAt:row.updated_at}}
function notesStatus(message='',retry=false){const status=q('#notesView .personal-notes-status');if(!status)return;status.hidden=!message;status.innerHTML=message?`${esc(message)}${retry?' <button type="button" class="ghost" data-notes-retry>تلاش دوباره</button>':''}`:''}
async function loadNotes(){
 const actor=state.user?.id,generation=++notesGeneration;
 notesReady=false;notes=readCachedNotes();renderNotes();notesStatus('در حال دریافت یادداشت‌ها…');
 if(!actor||!state.token){notesStatus('برای دیدن یادداشت‌ها وارد حساب شوید.');return}
 try{
  const query=`select=id,title,body,color,inactive,created_at,updated_at&owner_id=eq.${encodeURIComponent(actor)}&order=updated_at.desc`;
  let rows=await select('personal_notes',query);
  if(generation!==notesGeneration||state.user?.id!==actor)return;
  const known=new Set(rows.map(row=>String(row.id)));
  // Bring notes saved by older versions on this browser into the account once.
  for(const note of notes){
   if(known.has(String(note.id)))continue;
   if(!String(note.title||'').trim()||!String(note.body||'').trim())continue;
   const id=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(note.id))?note.id:crypto.randomUUID();
   await insert('personal_notes',{id,owner_id:actor,title:String(note.title||'').slice(0,120),body:String(note.body||'').slice(0,4000),color:noteColors.includes(note.color)?note.color:'sun',inactive:!!note.inactive,created_at:note.createdAt||new Date().toISOString(),updated_at:note.updatedAt||new Date().toISOString()});
   note.id=id;cacheNotes();
   if(generation!==notesGeneration||state.user?.id!==actor)return;
  }
  if(notes.some(note=>!known.has(String(note.id))))rows=await select('personal_notes',query);
  if(generation!==notesGeneration||state.user?.id!==actor)return;
  notes=rows.map(fromRow);notesReady=true;notesStatus();cacheNotes();
 }catch(error){if(generation!==notesGeneration||state.user?.id!==actor)return;notesStatus(`یادداشت‌ها به‌روز نشدند: ${error.message}`,true);renderNotes()}
}
async function updateNote(note,changes){
 if(!notesReady||notesBusy)return;const actor=state.user?.id;notesBusy=true;
 try{const updatedAt=new Date().toISOString(),rows=await update('personal_notes',`id=eq.${encodeURIComponent(note.id)}&owner_id=eq.${encodeURIComponent(actor)}`,{...changes,updated_at:updatedAt});if(!rows?.length)throw Error('یادداشت در حساب شما یافت نشد.');Object.assign(note,fromRow(rows[0]));cacheNotes();return true}
 catch(error){window.toast?.(error.message,true);return false}finally{notesBusy=false}
}
function selected(){return notes.find(note=>String(note.id)===String(selectedNote))||null}
function noteDate(value){try{return new Date(value).toLocaleDateString('fa-IR',{year:'numeric',month:'long',day:'numeric'})}catch{return''}}
function renderNotes(){
 const view=q('#notesView');if(!view)return;const board=q('.sticky-note-board',view),rows=notes.filter(note=>!!note.inactive===inactiveMode).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
 board.innerHTML=rows.length?rows.map((note,index)=>`<article class="sticky-note ${esc(note.color||noteColors[index%noteColors.length])} ${String(note.id)===String(selectedNote)?'selected':''}" data-note-id="${esc(note.id)}"><button type="button" class="sticky-note-main"><span class="sticky-pin" aria-hidden="true">📌</span><strong>${esc(note.title)}</strong><p>${esc(note.body)}</p><small>${noteDate(note.updatedAt)}</small></button><button type="button" class="sticky-note-toggle" data-note-toggle="${esc(note.id)}" title="${note.inactive?'فعال‌سازی یادداشت':'غیرفعال‌سازی یادداشت'}" aria-label="${note.inactive?'فعال‌سازی یادداشت':'غیرفعال‌سازی یادداشت'}">${note.inactive?'↺':'○'}</button></article>`).join(''):`<div class="personal-empty"><span>${inactiveMode?'📂':'📝'}</span><b>${inactiveMode?'یادداشت غیرفعالی وجود ندارد.':'هنوز یادداشتی ثبت نشده است.'}</b><small>${inactiveMode?'یادداشت‌های غیرفعال‌شده در اینجا نگهداری می‌شوند.':'با «یادداشت جدید» اولین برگه را به میزتان سنجاق کنید.'}</small></div>`;
 const current=selected();q('[data-note-new]',view).disabled=!notesReady||notesBusy;q('[data-note-edit]',view).disabled=!notesReady||notesBusy||!current;q('[data-note-delete]',view).disabled=!notesReady||notesBusy||!current;
 qa('[data-note-tab]',view).forEach(button=>{const isCurrent=(button.dataset.noteTab==='inactive')===inactiveMode;button.classList.toggle('active',isCurrent);button.setAttribute('aria-pressed',String(isCurrent))});
}
function openNoteDialog(note=null){const dialog=q('#notesView .personal-note-dialog'),form=q('form',dialog);form.reset();q('h3',dialog).textContent=note?'ویرایش یادداشت':'یادداشت جدید';form.dataset.noteId=note?.id||'';if(note){form.elements.title.value=note.title;form.elements.body.value=note.body;form.elements.color.value=note.color||'sun'}dialog.showModal();setTimeout(()=>form.elements.title.focus(),20)}
function bindNotes(view){
 q('[data-personal-home]',view).onclick=()=>window.bamcoShowHome?.();q('[data-note-new]',view).onclick=()=>openNoteDialog();
 q('[data-note-edit]',view).onclick=()=>{const note=selected();if(note)openNoteDialog(note)};
 q('[data-note-delete]',view).onclick=async()=>{const note=selected();if(!note||!notesReady||notesBusy)return;const ok=window.bamcoConfirm?await window.bamcoConfirm(`یادداشت «${note.title}» حذف شود؟`):confirm(`یادداشت «${note.title}» حذف شود؟`);if(!ok)return;notesBusy=true;try{const rows=await api(`/rest/v1/personal_notes?id=eq.${encodeURIComponent(note.id)}&owner_id=eq.${encodeURIComponent(state.user.id)}`,{method:'DELETE',prefer:'return=representation'});if(!rows?.length)throw Error('یادداشت در حساب شما یافت نشد.');notes=notes.filter(item=>String(item.id)!==String(note.id));selectedNote='';cacheNotes();window.toast?.('یادداشت حذف شد.')}catch(error){window.toast?.(error.message,true)}finally{notesBusy=false;renderNotes()}};
 qa('[data-note-tab]',view).forEach(button=>button.onclick=()=>{inactiveMode=button.dataset.noteTab==='inactive';selectedNote='';renderNotes()});
 q('.sticky-note-board',view).onclick=async event=>{const toggle=event.target.closest('[data-note-toggle]');if(toggle){const note=notes.find(item=>String(item.id)===String(toggle.dataset.noteToggle));if(!note)return;const inactive=!note.inactive;if(await updateNote(note,{inactive})){selectedNote='';renderNotes();window.toast?.(inactive?'یادداشت غیرفعال شد.':'یادداشت دوباره فعال شد.')}return}const card=event.target.closest('[data-note-id]');if(!card)return;selectedNote=card.dataset.noteId;renderNotes()};
 q('.sticky-note-board',view).ondblclick=event=>{const card=event.target.closest('[data-note-id]');if(!card)return;selectedNote=card.dataset.noteId;openNoteDialog(selected())};
 qa('[data-note-close]',view).forEach(button=>button.onclick=()=>q('.personal-note-dialog',view).close());
 q('.personal-note-dialog form',view).onsubmit=async event=>{event.preventDefault();if(!notesReady||notesBusy)return;const form=event.currentTarget,id=form.dataset.noteId||crypto.randomUUID(),existing=notes.find(note=>String(note.id)===String(id)),now=new Date().toISOString(),fields={title:form.elements.title.value.trim(),body:form.elements.body.value.trim(),color:form.elements.color.value};notesBusy=true;const button=q('button[type="submit"]',form);button.disabled=true;try{const rows=existing?await update('personal_notes',`id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(state.user.id)}`,{...fields,updated_at:now}):await insert('personal_notes',{id,owner_id:state.user.id,...fields,inactive:false,created_at:now,updated_at:now});if(!rows?.length)throw Error('ذخیره یادداشت تأیید نشد.');if(existing)Object.assign(existing,fromRow(rows[0]));else notes.push(fromRow(rows[0]));selectedNote=id;cacheNotes();q('.personal-note-dialog',view).close();window.toast?.('یادداشت ذخیره شد.')}catch(error){window.toast?.(error.message,true)}finally{notesBusy=false;button.disabled=false;renderNotes()}};
 view.addEventListener('contextmenu',async event=>{const card=event.target.closest('[data-note-id]');if(!card)return;event.preventDefault();const note=notes.find(item=>String(item.id)===String(card.dataset.noteId));if(!note)return;const inactive=!note.inactive;if(await updateNote(note,{inactive})){selectedNote='';renderNotes();window.toast?.(inactive?'یادداشت غیرفعال شد.':'یادداشت دوباره فعال شد.')}});
 view.addEventListener('click',event=>{if(event.target.closest('[data-notes-retry]'))void loadNotes()});
}

async function loadAssistantSticker(){
 const images=qa('#voiceAssistantView .assistant-avatar-frame, #voiceAssistantView .assistant-avatar-face'),error=q('#voiceAssistantView .assistant-avatar-error');if(!images.length)return;
 for(const image of images)image.loading='eager';
 try{await Promise.all(images.map(image=>typeof image.decode==='function'?image.decode():Promise.resolve()));if(error)error.hidden=true}
 catch{if(error)error.hidden=false}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installNavigation,{once:true});else installNavigation();
})();
