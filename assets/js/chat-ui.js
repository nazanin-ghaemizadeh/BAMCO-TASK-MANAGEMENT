/* Live chat UI, using the existing thread/message APIs. Files use a private bucket. */
(()=>{
'use strict';
const qa=(s,r=document)=>[...r.querySelectorAll(s)],LIMIT=5*1024*1024,FILE='BAMCO_ATTACHMENT_V1:',STICKER='BAMCO_STICKER_V1:',esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const avatar='<span class="chat-avatar" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></svg></span>';
const fileAllowed=file=>!!file&&file.size>0&&file.size<=LIMIT;
if(typeof module!=='undefined'&&module.exports)module.exports={fileAllowed,LIMIT};
if(typeof document==='undefined')return;
let active=null;
let emojiCatalog=null;
const loadEmoji=()=>emojiCatalog||(emojiCatalog=fetch(new URL('assets/data/chat-emoji.json?v=17',document.baseURI).href).then(r=>{if(!r.ok)throw Error('دریافت شکلک‌ها انجام نشد.');return r.json()}).then(data=>{if(!Array.isArray(data.groups))throw Error('فهرست شکلک‌ها معتبر نیست.');return data.groups}).catch(error=>{emojiCatalog=null;throw error}));
function renderText(node,text){
 const parts=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)].map(x=>x.segment).filter(x=>x.trim()):[];
 if(parts.length&&parts.every(x=>/[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\u20e3]/u.test(x))){node.classList.add('chat-emoji-message');node.dir='ltr';for(const glyph of parts){const span=document.createElement('span');span.className='chat-emoji-glyph';span.textContent=glyph;node.append(span)}}else node.textContent=text;
 window.bamcoEmoji?.render(node);
}
const directory=async()=>{try{return await rpc('chat_directory_v2',{})}catch{return await rpc('chat_directory',{})}};
function summary(body){if(body?.startsWith(FILE)){try{return JSON.parse(body.slice(FILE.length)).name}catch{return'فایل'}}if(body?.startsWith(STICKER))return'استیکر';return body||''}
async function mount(host,{id,title,subtitle='',actions=[],personId=null,groupPhoto='',companyLogo=false,readOnly=false}){
 if(active)active.close();
 if(!host)throw Error('پنل گفتگو آماده نیست.');
 const stateUI={id,reply:null,editing:null,pending:null,files:new Map(),busy:false,closed:false,urls:[],messages:[],loaded:false,loadRun:0};
 active=stateUI;stateUI.close=()=>{stateUI.closed=true;clearTimeout(stateUI.timer);stateUI.urls.forEach(URL.revokeObjectURL);stateUI.urls=[];stateUI.pending=null;stateUI.reply=null;stateUI.messages=[];document.querySelector('#chatMediaDialog[open]')?.close()};
 host.classList.add('messenger-host');host.innerHTML=`<div class="messenger-head">${companyLogo?'<span class="chat-avatar company-chat-logo"><img src="assets/images/bamco-icon-192.png" alt="لوگوی شرکت"></span>':personId?`<span class="chat-avatar" data-profile-photo="${esc(personId)}">${esc(title[0])}</span>`:avatar}<div><strong>${esc(title)}</strong><small>${esc(subtitle||'گفتگو')}</small></div><button type="button" class="chat-search-toggle bamco-icon-button" aria-label="جست‌وجو در پیام‌ها">⌕</button><button type="button" class="chat-refresh bamco-icon-button" aria-label="تازه‌سازی پیام‌ها">↻</button></div><div class="chat-search-bar hidden"><input type="search" aria-label="جست‌وجو در پیام‌ها" placeholder="جست‌وجو در این گفت‌وگو…"><span class="chat-search-count"></span><button type="button" class="ghost" aria-label="بستن جست‌وجو">×</button></div><div class="messenger-messages" role="log" aria-live="polite"><div class="chat-empty">در حال دریافت پیام‌ها…</div></div><div class="chat-error" role="status"></div><div class="chat-reply hidden"><span></span><button type="button" aria-label="لغو پاسخ">×</button></div><div class="chat-pending hidden"><span></span><button type="button" aria-label="حذف پیوست">×</button></div><div class="chat-stickers hidden" aria-label="انتخاب شکلک و استیکر"></div><form class="messenger-compose"><button type="button" class="chat-attach bamco-icon-button" title="عکس یا فایل تا ۵ مگابایت" aria-label="پیوست عکس یا فایل">＋</button><button type="button" class="chat-sticker-toggle bamco-icon-button" title="شکلک و استیکر" aria-label="انتخاب شکلک و استیکر">☺</button><textarea rows="1" aria-label="متن پیام" placeholder="پیام بنویسید…"></textarea><button type="submit" class="chat-send bamco-icon-button" aria-label="ارسال پیام">➤</button><input type="file" hidden></form>`;
 if(groupPhoto&&!companyLogo)bamcoMedia.get('group-avatars',groupPhoto).then(src=>{if(stateUI.closed)return;const el=host.querySelector('.chat-avatar');if(el){const img=document.createElement('img');img.src=src;img.alt='عکس گروه';el.replaceChildren(img)}}).catch(()=>{});
 const q=s=>host.querySelector(s),error=message=>{if(stateUI.closed||!q('.chat-error'))return;q('.chat-error').textContent=message;if(message)toast(message,true)},box=q('.messenger-messages'),input=q('textarea');
 if(readOnly){q('.messenger-compose').hidden=true;q('.messenger-compose').classList.add('hidden');}
 function reply(message){stateUI.editing=null;stateUI.reply=message;q('.chat-reply').classList.toggle('hidden',!message);q('.chat-reply span').textContent=message?'پاسخ به: '+summary(message.body).slice(0,160):'';input.focus()}
 async function storage(path,options={}){const res=await fetch(SB_URL+'/storage/v1/object/'+path,{...options,headers:{apikey:SB_KEY,Authorization:'Bearer '+state.token,...options.headers}});if(!res.ok){const info=await res.json().catch(()=>({}));throw new Error('دریافت یا ارسال فایل انجام نشد: '+(info.message||info.error||'دسترسی یا اتصال را بررسی کنید.'))}return res}
 async function attach(message,node){let meta;try{meta=JSON.parse(message.body.slice(FILE.length))}catch{node.textContent='اطلاعات فایل معتبر نیست.';return}
 if(typeof meta.path!=='string'||!meta.path.startsWith(id+'/')||meta.path.includes('..')||!Number.isFinite(meta.size)||meta.size>LIMIT){node.textContent='پیوست نامعتبر';return}
 const button=document.createElement('button');button.type='button';button.className='chat-file';button.textContent='↓ '+String(meta.name||'فایل')+' · '+Math.ceil(meta.size/1024).toLocaleString('fa-IR')+' کیلوبایت';node.append(button);
 const retrieve=async()=>{if(stateUI.files.has(meta.path))return stateUI.files.get(meta.path);const res=await storage('authenticated/chat-attachments/'+meta.path.split('/').map(encodeURIComponent).join('/'));const blob=await res.blob();if(blob.size>LIMIT)throw Error('اندازه فایل بیش از ۵ مگابایت است.');const url=URL.createObjectURL(blob);stateUI.urls.push(url);stateUI.files.set(meta.path,url);return url};
 button.onclick=async()=>{try{button.disabled=true;const url=await retrieve(),a=document.createElement('a');a.href=url;a.download=String(meta.name||'attachment');a.click()}catch(err){error(err.message)}finally{button.disabled=false}};
 if(['image/png','image/jpeg','image/webp','image/gif'].includes(meta.mime)){try{const url=await retrieve();if(stateUI.closed)return;const img=document.createElement('img');img.className='chat-photo';img.src=url;img.alt=String(meta.name||'تصویر پیوست');node.prepend(img)}catch(err){error(err.message)}}
 if(meta.caption){const caption=document.createElement('div');caption.textContent=meta.caption;node.append(caption)}
 }
 async function load(manual=false){
  if(stateUI.closed)return;const run=++stateUI.loadRun;try{const [messages,people]=await Promise.all([selectAll('chat_messages',`select=*&thread_id=eq.${encodeURIComponent(id)}&deleted_at=is.null&order=created_at.asc`,200),directory()]);if(stateUI.closed||!host.isConnected||run!==stateUI.loadRun)return;
   const nearBottom=box.scrollHeight-box.scrollTop-box.clientHeight<90,oldTop=box.scrollTop,signature=JSON.stringify(messages);if(signature===stateUI.signature)return;stateUI.signature=signature;stateUI.messages=messages;
   const names=Object.fromEntries(people.map(p=>[p.id,p.display_name||p.full_name||'کاربر'])),profiles=Object.fromEntries(people.map(p=>[p.id,p]));box.replaceChildren();let date='';
   for(const m of messages){const day=new Date(m.created_at).toLocaleDateString('fa-IR');if(day!==date){const divider=document.createElement('div');divider.className='chat-date';divider.textContent=day;box.append(divider);date=day}
    const mine=!m.is_system&&m.sender_id===state.user.id,item=document.createElement('article');item.className='chat-bubble'+(mine?' mine':'');item.dataset.messageId=m.id;
    item.innerHTML=`<div class="chat-author"><span class="chat-avatar" data-profile-photo="${esc(m.sender_id)}">${esc((names[m.sender_id]||m.sender_name_snapshot||'ک').slice(0,1))}</span><b class="chat-sender">${esc(m.is_system?'سامانه':names[m.sender_id]||m.sender_name_snapshot||'کاربر')}</b></div><div class="chat-body"></div><div class="chat-bubble-meta"><time>${m.edited_at?'ویرایش‌شده · ' :''}${new Date(m.created_at).toLocaleTimeString('fa-IR',{hour:'2-digit',minute:'2-digit'})}</time><button type="button" class="message-reply">پاسخ</button>${mine&&!m.body?.startsWith(FILE)&&!m.body?.startsWith(STICKER)?'<button type="button" class="message-edit">ویرایش</button>':''}${isManager()?'<button type="button" class="message-delete">حذف</button>':''}</div>`;
    const parent=messages.find(x=>String(x.id)===String(m.reply_to||m.reply_to_id));if(parent){const quote=document.createElement('blockquote');quote.textContent=summary(parent.body).slice(0,180);item.querySelector('.chat-body').before(quote)}
    const body=item.querySelector('.chat-body');body.dir=/[A-Za-z]/.test(m.body||'')&&!/[\u0600-\u06ff]/.test(m.body||'')?'ltr':'rtl';if(m.body?.startsWith(FILE))attach(m,body);else if(m.body?.startsWith(STICKER)){const key=m.body.slice(STICKER.length),src=window.BAMCO_DESKTOP_ASSETS?.[key];if(src){const img=document.createElement('img');img.className='chat-sticker';img.src=src;img.alt='استیکر';body.append(img)}else body.textContent='استیکر'}else renderText(body,m.body||'');
    item.querySelector('.message-reply').onclick=()=>reply(m);const edit=item.querySelector('.message-edit');if(edit)edit.onclick=()=>{stateUI.reply=null;stateUI.editing=m;stateUI.pending=null;q('.chat-pending').classList.add('hidden');q('.chat-reply').classList.remove('hidden');q('.chat-reply span').textContent='ویرایش پیام';input.value=m.body;input.focus()};const del=item.querySelector('.message-delete');if(del)del.onclick=async()=>{if(!await window.bamcoConfirm('این پیام حذف شود؟'))return;try{del.disabled=true;await rpc('chat_delete_message',{p_message_id:Number(m.id)});await load(true)}catch(err){error(err.message);del.disabled=false}};
    if(readOnly){item.querySelector('.message-reply')?.remove();item.querySelector('.message-edit')?.remove();}
    box.append(item);
   }
   bamcoMedia.avatars(host,people);filterMessages();
   if(!messages.length)box.innerHTML='<div class="chat-empty">'+avatar+'<strong>گفتگو از اینجا شروع می‌شود</strong><span>پیام، استیکر، عکس یا فایل تا ۵ مگابایت ارسال کنید.</span></div>';
   if(!stateUI.loaded||nearBottom||manual)box.scrollTop=box.scrollHeight;else box.scrollTop=oldTop;stateUI.loaded=true;await rpc('chat_mark_read',{p_thread_id:id});if(stateUI.closed||run!==stateUI.loadRun)return;error('');document.dispatchEvent(new CustomEvent('bamco-messages-changed'));
  }catch(err){if(stateUI.closed||run!==stateUI.loadRun)return;error(err.message||'پیام‌ها بارگذاری نشدند.');if(!stateUI.loaded)box.innerHTML='<div class="chat-empty">دریافت پیام‌ها انجام نشد. دکمه تازه‌سازی را بزنید.</div>'}
 }
 async function send(sticker){if(stateUI.busy||stateUI.closed)return;let text=input.value.trim(),uploaded=null;if(!sticker&&!text&&!stateUI.pending)return;stateUI.busy=true;q('.chat-send').disabled=true;error('');
  try{if(stateUI.editing&&(sticker||stateUI.pending))throw Error('هنگام ویرایش، فقط متن پیام را تغییر دهید.');if(sticker)text=STICKER+sticker;
   else if(stateUI.pending){const file=stateUI.pending;if(!fileAllowed(file))throw Error('فایل باید حداکثر ۵ مگابایت باشد.');const extension=/\.([a-z0-9]{1,10})$/i.exec(file.name),path=id+'/'+state.user.id+'/'+crypto.randomUUID()+(extension?'.'+extension[1].toLowerCase():'');await storage('chat-attachments/'+path.split('/').map(encodeURIComponent).join('/'),{method:'POST',headers:{'Content-Type':file.type||'application/octet-stream','x-upsert':'false'},body:file});uploaded=path;text=FILE+JSON.stringify({path,name:file.name,size:file.size,mime:file.type,caption:text})}
   if(stateUI.editing){await rpc('chat_edit_message',{p_message_id:Number(stateUI.editing.id),p_body:text})}else await rpc('chat_send_message',{p_thread_id:id,p_body:text,p_reply_to:stateUI.reply?.id||null});input.value='';reply(null);stateUI.pending=null;q('.chat-pending').classList.add('hidden');q('.chat-stickers').classList.add('hidden');await load(true);await window.bamcoConversations?.refresh?.();
  }catch(err){error(err.message||'ارسال انجام نشد.');if(uploaded)fetch(SB_URL+'/storage/v1/object/chat-attachments',{method:'DELETE',headers:{apikey:SB_KEY,Authorization:'Bearer '+state.token,'Content-Type':'application/json'},body:JSON.stringify({prefixes:[uploaded]})}).catch(()=>{})}
  finally{stateUI.busy=false;if(host.isConnected)q('.chat-send').disabled=false}
 }
 function filterMessages(){const term=q('.chat-search-bar input').value.trim().toLowerCase();let count=0;qa('.chat-bubble',box).forEach(el=>{el.hidden=!!term&&!el.textContent.toLowerCase().includes(term);if(!el.hidden)count++});qa('.chat-date',box).forEach(el=>el.hidden=!!term);q('.chat-search-count').textContent=term?count.toLocaleString('fa-IR')+' نتیجه':''}
 q('.chat-search-toggle').onclick=()=>{q('.chat-search-bar').classList.toggle('hidden');if(!q('.chat-search-bar').classList.contains('hidden'))q('.chat-search-bar input').focus()};q('.chat-search-bar input').oninput=filterMessages;q('.chat-search-bar button').onclick=()=>{q('.chat-search-bar input').value='';filterMessages();q('.chat-search-bar').classList.add('hidden')};
 async function mediaLibrary(){
  let dialog=document.querySelector('#chatMediaDialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='chatMediaDialog';dialog.className='modal bamco-dialog chat-media-dialog';document.body.append(dialog)}
  dialog.innerHTML='<div class="modal-head"><h3>رسانه‌ها و لینک‌های گفت‌وگو</h3><button type="button" class="ghost" data-media-close>بستن</button></div><div class="chat-media-tabs"><button type="button" class="ghost" data-media-tab="photos">عکس‌ها</button><button type="button" class="ghost" data-media-tab="files">فایل‌ها</button><button type="button" class="ghost" data-media-tab="links">لینک‌ها</button></div><div class="chat-media-content"></div>';
  const paint=kind=>{const area=dialog.querySelector('.chat-media-content');area.replaceChildren();dialog.querySelectorAll('[data-media-tab]').forEach(b=>b.classList.toggle('active',b.dataset.mediaTab===kind));for(const m of stateUI.messages){
   if(m.body?.startsWith(FILE)){let meta;try{meta=JSON.parse(m.body.slice(FILE.length))}catch{continue}if((kind==='photos'&&String(meta.mime).startsWith('image/'))||(kind==='files'&&!String(meta.mime).startsWith('image/'))){const item=document.createElement('article');item.className='chat-media-item';area.append(item);attach(m,item)}}
   let linkText=m.body||'';if(linkText.startsWith(FILE)){try{linkText=JSON.parse(linkText.slice(FILE.length)).caption||''}catch{linkText=''}}if(kind==='links'&&!linkText.startsWith(STICKER))for(const link of linkText.match(/https?:\/\/[^\s<>"']+/g)||[]){try{const url=new URL(link);if(!['https:','http:'].includes(url.protocol))continue;const a=document.createElement('a');a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';a.dir='ltr';a.textContent=url.href;area.append(a)}catch{}}
  }if(!area.childElementCount)area.innerHTML='<p class="conversation-empty">موردی در این بخش ثبت نشده است.</p>'};
  dialog.querySelector('[data-media-close]').onclick=()=>dialog.close();dialog.querySelectorAll('[data-media-tab]').forEach(b=>b.onclick=()=>paint(b.dataset.mediaTab));dialog.showModal();paint('photos');
 }
 actions=[{label:'عکس‌ها، فایل‌ها و لینک‌ها',run:mediaLibrary},...actions];
 const controls=document.createElement('div');controls.className='messenger-head-actions';
 for(const action of actions){const button=document.createElement('button');button.type='button';button.className=action.danger?'danger':'ghost';button.textContent=action.label;button.onclick=async()=>{if(button.disabled)return;button.disabled=true;try{await action.run()}catch(err){error(err.message||'عملیات انجام نشد.')}finally{if(button.isConnected)button.disabled=false}};controls.append(button)}
 q('.messenger-head').append(controls);
 q('form').onsubmit=e=>{e.preventDefault();send()};input.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&!matchMedia('(pointer:coarse)').matches){e.preventDefault();send()}};
 q('.chat-reply button').onclick=()=>{if(stateUI.editing)input.value='';reply(null)};q('.chat-pending button').onclick=()=>{stateUI.pending=null;q('.chat-pending').classList.add('hidden')};q('.chat-refresh').onclick=()=>load(true);
 q('.chat-attach').onclick=()=>{if(stateUI.editing)return error('ابتدا ویرایش پیام را ذخیره یا لغو کنید.');q('input[type=file]').click()};q('input[type=file]').onchange=e=>{const file=e.target.files[0];e.target.value='';if(!file)return;if(!fileAllowed(file)){error('فایل خالی یا بزرگ‌تر از ۵ مگابایت پذیرفته نمی‌شود.');return}stateUI.pending=file;q('.chat-pending span').textContent=file.name;q('.chat-pending').classList.remove('hidden');error('')};
 q('.chat-sticker-toggle').onclick=async()=>{
  const panel=q('.chat-stickers');panel.classList.toggle('hidden');if(panel.classList.contains('hidden')||panel.dataset.ready)return;
  panel.textContent='در حال دریافت شکلک‌ها…';
  try{const groups=await loadEmoji();if(stateUI.closed)return;
   panel.innerHTML='<div class="chat-emoji-tools"><select aria-label="دسته شکلک"></select><input type="search" aria-label="جست‌وجوی شکلک" placeholder="جست‌وجو…"><button type="button" class="chat-emoji-close" aria-label="بستن شکلک‌ها">×</button></div><div class="chat-sticker-grid"></div>';
   const select=panel.querySelector('select'),search=panel.querySelector('input'),grid=panel.querySelector('.chat-sticker-grid');let limit=120;
   groups.forEach((g,i)=>select.add(new Option(g.label,String(i))));select.add(new Option('استیکرها','stickers'));
   const paint=()=>{grid.replaceChildren();const term=search.value.trim().toLowerCase();
    if(select.value==='stickers'&&!term){Object.entries(window.BAMCO_DESKTOP_ASSETS||{}).forEach(([key,src])=>{const b=document.createElement('button');b.type='button';b.className='chat-sticker-choice';b.title='ارسال استیکر';const img=document.createElement('img');img.src=src;img.alt=key;b.append(img);b.onclick=()=>send(key);grid.append(b)});return}
    const items=term?groups.flatMap(g=>g.items.filter(x=>(g.label+' '+x.join(' ')).toLowerCase().includes(term))):groups[Number(select.value)]?.items||[];
    items.slice(0,limit).forEach(([glyph,name])=>{const b=document.createElement('button');b.type='button';b.className='chat-emoji-choice';b.textContent=glyph;window.bamcoEmoji?.render(b);b.title=name;b.setAttribute('aria-label','انتخاب '+name);b.onclick=()=>{input.setRangeText(glyph,input.selectionStart??input.value.length,input.selectionEnd??input.value.length,'end');input.dispatchEvent(new Event('input',{bubbles:true}));panel.classList.add('hidden');input.focus()};grid.append(b)});
    if(items.length>limit){const more=document.createElement('button');more.type='button';more.className='chat-emoji-more';more.textContent='نمایش بیشتر';more.onclick=()=>{limit+=120;paint()};grid.append(more)}
    if(!items.length)grid.textContent='شکلکی پیدا نشد.';
   };
   select.onchange=search.oninput=()=>{limit=120;paint()};panel.querySelector('.chat-emoji-close').onclick=()=>panel.classList.add('hidden');panel.dataset.ready='true';paint();
  }catch(err){panel.textContent='دریافت شکلک‌ها انجام نشد؛ دوباره انتخابگر را باز کنید.';error(err.message)}
 };
 await load();
 async function tick(){if(stateUI.closed||!host.isConnected)return;if(!document.hidden&&!host.closest('.view')?.classList.contains('hidden'))await load();if(!stateUI.closed&&host.isConnected)stateUI.timer=setTimeout(tick,5000)}stateUI.timer=setTimeout(tick,5000);
}
window.bamcoChat={mount,close(){active?.close();active=null}};
})();
