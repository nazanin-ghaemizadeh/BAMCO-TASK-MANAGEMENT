/* Personal notes and the task-aware smart voice assistant. */
(()=>{
'use strict';
const q=(s,r=document)=>r?.querySelector(s),qa=(s,r=document)=>[...(r?.querySelectorAll(s)||[])];
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const fa=value=>String(value??'').replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);
const noteColors=['sun','rose','mint','sky','lavender','peach'];
let notes=[],selectedNote='',inactiveMode=false,recognition=null,previousResponseId='',assistantBusy=false;

function icon(path){return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`}
const ICONS={
 note:'M4 3h16v18H4zM8 8h8M8 12h8M8 16h5M16 3v5h4',
 assistant:'M12 3a4 4 0 0 0-4 4v3a4 4 0 0 0 8 0V7a4 4 0 0 0-4-4ZM5 10a7 7 0 0 0 14 0M12 17v4M8 21h8',
 home:'M3 11 12 3l9 8v10h-6v-6H9v6H3z',plus:'M12 5v14M5 12h14',edit:'M4 20h4L19 9l-4-4L4 16v4ZM13 7l4 4',trash:'M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14',archive:'M4 5h16v4H4zM6 9v11h12V9M9 13h6',mic:'M12 3a4 4 0 0 0-4 4v4a4 4 0 0 0 8 0V7a4 4 0 0 0-4-4ZM5 11a7 7 0 0 0 14 0M12 18v3M8 21h8',send:'m3 3 18 9-18 9 4-9-4-9M7 12h14',refresh:'M20 11a8 8 0 1 0-2 5M20 4v7h-7'
};

function installNavigation(){
 const nav=q('#nav'),workspace=q('.workspace');if(!nav||!workspace||q('#notesView'))return;
 const noteButton=document.createElement('button');noteButton.type='button';noteButton.dataset.view='notes';noteButton.innerHTML=`<b>${icon(ICONS.note)}</b><span>یادداشت‌ها</span>`;
 const assistantButton=document.createElement('button');assistantButton.type='button';assistantButton.dataset.view='voiceAssistant';assistantButton.innerHTML=`<b>${icon(ICONS.assistant)}</b><span>دستیار صوتی هوشمند</span>`;
 nav.append(noteButton,assistantButton);
 const notesView=document.createElement('section');notesView.id='notesView';notesView.className='view hidden personal-notes-view';notesView.dataset.featureKey='notes';notesView.innerHTML=`
  <div class="personal-command-row bamco-command-bar">
   <button type="button" class="ghost" data-personal-home>${icon(ICONS.home)}<span>بازگشت به خانه</span></button>
   <button type="button" class="primary" data-note-new>${icon(ICONS.plus)}<span>یادداشت جدید</span></button>
   <button type="button" class="ghost" data-note-edit disabled>${icon(ICONS.edit)}<span>ویرایش</span></button>
   <button type="button" class="danger" data-note-delete disabled>${icon(ICONS.trash)}<span>حذف</span></button>
   <button type="button" class="ghost" data-note-inactive>${icon(ICONS.archive)}<span>یادداشت‌های غیرفعال</span></button>
  </div>
  <div class="sticky-note-board" aria-live="polite"></div>
  <dialog class="modal small personal-note-dialog"><form><div class="modal-head"><div><h3>یادداشت جدید</h3><p>عنوان کوتاه و متن یادداشت را وارد کنید.</p></div><button type="button" data-note-close>×</button></div><label>عنوان<input name="title" maxlength="120" required></label><label>متن<textarea name="body" rows="6" maxlength="4000" required></textarea></label><fieldset class="note-color-picker"><legend>رنگ یادداشت</legend>${noteColors.map((color,index)=>`<label class="note-color ${color}"><input type="radio" name="color" value="${color}" ${index===0?'checked':''}><span aria-label="رنگ ${fa(index+1)}"></span></label>`).join('')}</fieldset><div class="modal-actions"><button type="button" class="ghost" data-note-close>انصراف</button><button type="submit" class="primary">ذخیره یادداشت</button></div></form></dialog>`;
 const assistantView=document.createElement('section');assistantView.id='voiceAssistantView';assistantView.className='view hidden smart-assistant-view';assistantView.dataset.featureKey='voiceAssistant';assistantView.innerHTML=`
  <div class="personal-command-row bamco-command-bar"><button type="button" class="ghost" data-personal-home>${icon(ICONS.home)}<span>بازگشت به خانه</span></button><button type="button" class="ghost" data-assistant-new>${icon(ICONS.refresh)}<span>گفت‌وگوی جدید</span></button></div>
  <div class="assistant-stage">
   <aside class="assistant-character-panel">
    <div class="assistant-halo"><div class="assistant-orbit one"></div><div class="assistant-orbit two"></div><div class="assistant-character" aria-label="دستیار هوشمند"><img alt="استیکر دستیار هوشمند"><span>👩🏻‍💼</span></div></div>
    <strong>دستیار هوشمند شما</strong><small data-assistant-state>آماده گفت‌وگو</small>
    <div class="assistant-task-glance"><span><b data-open-tasks>۰</b> کار باز</span><span><b data-urgent-tasks>۰</b> فوری</span><span><b data-overdue-tasks>۰</b> دیرکرد</span></div>
   </aside>
   <section class="assistant-chat-panel">
    <div class="assistant-messages" aria-live="polite"></div>
    <div class="assistant-prompts"><button type="button">الان اولویت با کدام کار است؟</button><button type="button">چه کارهایی دارم؟</button><button type="button">برای کارهای عقب‌افتاده چه برنامه‌ای بچینم؟</button></div>
    <form class="assistant-composer"><button type="button" class="assistant-mic" aria-label="گفت‌وگوی صوتی" title="گفت‌وگوی صوتی">${icon(ICONS.mic)}</button><textarea rows="1" maxlength="4000" placeholder="درباره وظایف و برنامه‌تان بپرسید…" required></textarea><button type="submit" class="assistant-send" aria-label="ارسال پیام">${icon(ICONS.send)}</button></form>
   </section>
  </div>`;
 workspace.append(notesView,assistantView);
 window.BamcoNavigation?.configure?.({state,titles:{notes:'یادداشت‌ها',voiceAssistant:'دستیار صوتی هوشمند'}});
 bindNotes(notesView);bindAssistant(assistantView);
 window.BamcoNavigation?.registerView?.('notes',{activate:()=>{loadNotes();renderNotes()}});
 window.BamcoNavigation?.registerView?.('voiceAssistant',{activate:()=>resetAssistant(),dispose:stopAssistantMedia});
}

function noteStorageKey(){return`bamco.personal-notes.${state.user?.id||'anonymous'}`}
function loadNotes(){try{const data=JSON.parse(localStorage.getItem(noteStorageKey())||'[]');notes=Array.isArray(data)?data:[]}catch{notes=[]}}
function saveNotes(){localStorage.setItem(noteStorageKey(),JSON.stringify(notes));renderNotes()}
function selected(){return notes.find(note=>String(note.id)===String(selectedNote))||null}
function noteDate(value){try{return new Date(value).toLocaleDateString('fa-IR',{year:'numeric',month:'long',day:'numeric'})}catch{return''}}
function renderNotes(){
 const view=q('#notesView');if(!view)return;const board=q('.sticky-note-board',view),rows=notes.filter(note=>!!note.inactive===inactiveMode).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
 board.innerHTML=rows.length?rows.map((note,index)=>`<article class="sticky-note ${esc(note.color||noteColors[index%noteColors.length])} ${String(note.id)===String(selectedNote)?'selected':''}" data-note-id="${esc(note.id)}"><button type="button" class="sticky-note-main"><span class="sticky-pin" aria-hidden="true">📌</span><strong>${esc(note.title)}</strong><p>${esc(note.body)}</p><small>${noteDate(note.updatedAt)}</small></button><button type="button" class="sticky-note-toggle" data-note-toggle="${esc(note.id)}" title="${note.inactive?'فعال‌سازی یادداشت':'غیرفعال‌سازی یادداشت'}" aria-label="${note.inactive?'فعال‌سازی یادداشت':'غیرفعال‌سازی یادداشت'}">${note.inactive?'↺':'○'}</button></article>`).join(''):`<div class="personal-empty"><span>${inactiveMode?'📂':'📝'}</span><b>${inactiveMode?'یادداشت غیرفعالی وجود ندارد.':'هنوز یادداشتی ثبت نشده است.'}</b><small>${inactiveMode?'یادداشت‌های غیرفعال‌شده در اینجا نگهداری می‌شوند.':'با «یادداشت جدید» اولین برگه را به میزتان سنجاق کنید.'}</small></div>`;
 const current=selected();q('[data-note-edit]',view).disabled=!current;q('[data-note-delete]',view).disabled=!current;
 const toggle=q('[data-note-inactive]',view);toggle.classList.toggle('active',inactiveMode);toggle.querySelector('span').textContent=inactiveMode?'یادداشت‌های فعال':'یادداشت‌های غیرفعال';
}
function openNoteDialog(note=null){const dialog=q('#notesView .personal-note-dialog'),form=q('form',dialog);form.reset();q('h3',dialog).textContent=note?'ویرایش یادداشت':'یادداشت جدید';form.dataset.noteId=note?.id||'';if(note){form.elements.title.value=note.title;form.elements.body.value=note.body;form.elements.color.value=note.color||'sun'}dialog.showModal();setTimeout(()=>form.elements.title.focus(),20)}
function bindNotes(view){
 q('[data-personal-home]',view).onclick=()=>window.bamcoShowHome?.();q('[data-note-new]',view).onclick=()=>openNoteDialog();
 q('[data-note-edit]',view).onclick=()=>{const note=selected();if(note)openNoteDialog(note)};
 q('[data-note-delete]',view).onclick=async()=>{const note=selected();if(!note)return;const ok=window.bamcoConfirm?await window.bamcoConfirm(`یادداشت «${note.title}» حذف شود؟`):confirm(`یادداشت «${note.title}» حذف شود؟`);if(!ok)return;notes=notes.filter(item=>String(item.id)!==String(note.id));selectedNote='';saveNotes();window.toast?.('یادداشت حذف شد.')};
 q('[data-note-inactive]',view).onclick=()=>{inactiveMode=!inactiveMode;selectedNote='';renderNotes()};
 q('.sticky-note-board',view).onclick=event=>{const toggle=event.target.closest('[data-note-toggle]');if(toggle){const note=notes.find(item=>String(item.id)===String(toggle.dataset.noteToggle));if(!note)return;note.inactive=!note.inactive;note.updatedAt=new Date().toISOString();selectedNote='';saveNotes();window.toast?.(note.inactive?'یادداشت غیرفعال شد.':'یادداشت دوباره فعال شد.');return}const card=event.target.closest('[data-note-id]');if(!card)return;selectedNote=card.dataset.noteId;renderNotes()};
 q('.sticky-note-board',view).ondblclick=event=>{const card=event.target.closest('[data-note-id]');if(!card)return;selectedNote=card.dataset.noteId;openNoteDialog(selected())};
 qa('[data-note-close]',view).forEach(button=>button.onclick=()=>q('.personal-note-dialog',view).close());
 q('.personal-note-dialog form',view).onsubmit=event=>{event.preventDefault();const form=event.currentTarget,id=form.dataset.noteId||crypto.randomUUID(),existing=notes.find(note=>String(note.id)===String(id)),now=new Date().toISOString(),record={id,title:form.elements.title.value.trim(),body:form.elements.body.value.trim(),color:form.elements.color.value,inactive:existing?.inactive||false,createdAt:existing?.createdAt||now,updatedAt:now};if(existing)Object.assign(existing,record);else notes.push(record);selectedNote=id;saveNotes();q('.personal-note-dialog',view).close();window.toast?.('یادداشت ذخیره شد.')};
 view.addEventListener('contextmenu',event=>{const card=event.target.closest('[data-note-id]');if(!card)return;event.preventDefault();const note=notes.find(item=>String(item.id)===String(card.dataset.noteId));if(!note)return;note.inactive=!note.inactive;note.updatedAt=new Date().toISOString();selectedNote='';saveNotes();window.toast?.(note.inactive?'یادداشت غیرفعال شد.':'یادداشت دوباره فعال شد.')});
}

function assistantStatus(text,mode=''){const view=q('#voiceAssistantView');q('[data-assistant-state]',view).textContent=text;view.classList.remove('is-listening','is-thinking','is-speaking');if(mode)view.classList.add(`is-${mode}`)}
function taskGlance(){const view=q('#voiceAssistantView'),today=new Date().toISOString().slice(0,10),rows=(state.tasks||[]).filter(task=>!task.archived),urgent=rows.filter(task=>String(task.priority||'').includes('فوری')).length,overdue=rows.filter(task=>task.due_date&&task.due_date<today&&!['انجام شده','تکمیل شده'].includes(task.status)).length;q('[data-open-tasks]',view).textContent=fa(rows.length);q('[data-urgent-tasks]',view).textContent=fa(urgent);q('[data-overdue-tasks]',view).textContent=fa(overdue)}
function appendMessage(role,text){const host=q('#voiceAssistantView .assistant-messages'),article=document.createElement('article');article.className=`assistant-message ${role}`;article.innerHTML=`<span>${role==='assistant'?'✦':'شما'}</span><p>${esc(text).replace(/\n/g,'<br>')}</p>`;host.append(article);host.scrollTop=host.scrollHeight;return article}
function resetAssistant(){previousResponseId='';assistantBusy=false;stopAssistantMedia();const host=q('#voiceAssistantView .assistant-messages');host.innerHTML='';appendMessage('assistant','سلام! من برای مرور وظایف، تعیین اولویت و برنامه‌ریزی کارها کنار شما هستم. از کجا شروع کنیم؟');q('#voiceAssistantView .assistant-composer textarea').value='';taskGlance();assistantStatus('آماده گفت‌وگو');void loadAssistantSticker()}
async function loadAssistantSticker(){try{await window.bamcoPrepareWelcomeStickers?.();const source=q('.home-welcome-dialog .home-sticker.female'),image=q('#voiceAssistantView .assistant-character img'),fallback=q('#voiceAssistantView .assistant-character span');if(source?.src){image.src=source.src;image.hidden=false;fallback.hidden=true}else{image.hidden=true;fallback.hidden=false}}catch{}}
function stopAssistantMedia(){try{recognition?.abort()}catch{}recognition=null;try{speechSynthesis.cancel()}catch{}q('#voiceAssistantView')?.classList.remove('is-listening','is-thinking','is-speaking')}
function speak(text){if(!('speechSynthesis'in window))return;speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(text.replace(/[*#_`]/g,''));utterance.lang='fa-IR';utterance.rate=.96;const voice=speechSynthesis.getVoices().find(item=>item.lang?.toLowerCase().startsWith('fa'));if(voice)utterance.voice=voice;utterance.onstart=()=>assistantStatus('در حال پاسخ‌گویی','speaking');utterance.onend=()=>assistantStatus('آماده گفت‌وگو');utterance.onerror=()=>assistantStatus('آماده گفت‌وگو');speechSynthesis.speak(utterance)}
async function askAssistant(text){
 if(assistantBusy||!text.trim())return;assistantBusy=true;appendMessage('user',text.trim());const waiting=appendMessage('assistant','در حال بررسی وظایف شما…');waiting.classList.add('pending');assistantStatus('در حال فکر کردن','thinking');
 try{const response=await fetch(`${SB_URL}/functions/v1/smart-assistant`,{method:'POST',headers:{apikey:SB_KEY,Authorization:`Bearer ${state.token}`,'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({message:text.trim(),previous_response_id:previousResponseId||null})}),data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.error||'دستیار هوشمند هنوز روی سرور فعال نشده است.');waiting.remove();appendMessage('assistant',data.text||'پاسخی دریافت نشد.');previousResponseId=data.response_id||previousResponseId;speak(data.text||'')}
 catch(error){waiting.classList.remove('pending');waiting.querySelector('p').textContent=error.message;waiting.classList.add('error');assistantStatus('اتصال دستیار آماده نیست')}
 finally{assistantBusy=false}
}
function startVoice(){const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;if(!Recognition)return window.toast?.('تشخیص گفتار در این مرورگر پشتیبانی نمی‌شود.',true);stopAssistantMedia();recognition=new Recognition();recognition.lang='fa-IR';recognition.interimResults=false;recognition.continuous=false;recognition.onstart=()=>assistantStatus('در حال شنیدن…','listening');recognition.onresult=event=>{const text=event.results?.[0]?.[0]?.transcript||'';q('#voiceAssistantView textarea').value=text;if(text)void askAssistant(text)};recognition.onerror=()=>assistantStatus('صدای شما دریافت نشد');recognition.onend=()=>{if(!assistantBusy)assistantStatus('آماده گفت‌وگو')};recognition.start()}
function bindAssistant(view){
 q('[data-personal-home]',view).onclick=()=>window.bamcoShowHome?.();q('[data-assistant-new]',view).onclick=resetAssistant;q('.assistant-mic',view).onclick=startVoice;
 q('.assistant-prompts',view).onclick=event=>{const button=event.target.closest('button');if(button)void askAssistant(button.textContent)};
 q('.assistant-composer',view).onsubmit=event=>{event.preventDefault();const input=q('textarea',event.currentTarget),text=input.value;input.value='';void askAssistant(text)};
 q('.assistant-composer textarea',view).onkeydown=event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();event.currentTarget.form.requestSubmit()}};
 if(!(window.SpeechRecognition||window.webkitSpeechRecognition)){const mic=q('.assistant-mic',view);mic.title='تشخیص گفتار در این مرورگر پشتیبانی نمی‌شود.'}
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installNavigation,{once:true});else installNavigation();
})();
