(()=>{
'use strict';
const q=s=>document.querySelector(s),months=['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
const faDigits=value=>String(value??'').replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);
const requestTypes={create:'تعریف فعالیت جدید',update:'ویرایش وظیفه',status:'تغییر وضعیت',priority:'تغییر اولویت',description:'تغییر توضیحات',complete:'اعلام انجام',delete:'درخواست حذف',due_date:'تغییر تاریخ پایان'};
const requestStatuses={pending:'در انتظار بررسی',in_review:'در زنجیره تأیید',needs_revision:'در انتظار اصلاح',approved:'تأیید',rejected:'رد',cancelled:'لغوشده'};
function important(el,name,value){el?.style?.setProperty(name,value,'important')}
function fixFilterSelects(){
 document.querySelectorAll('#kanbanView .column-filters select,#archiveView .column-filters select,#kanbanView .suite-filters select,#archiveView .suite-filters select').forEach(select=>{
  select.setAttribute('dir','rtl');
  important(select,'font-family',"'BamcoTablePersian','Times New Roman',Times,serif");important(select,'direction','rtl');important(select,'text-align','right');important(select,'text-align-last','right');important(select,'padding-right','10px');important(select,'padding-left','28px');
  [...select.options].forEach(option=>{option.setAttribute('dir','rtl');important(option,'font-family',"'BamcoTablePersian','Times New Roman',Times,serif");important(option,'direction','rtl');important(option,'text-align','right')});
 });
}
function mixedFontCell(cell){
 if(!cell)return;const text=cell.textContent||'';if(cell.dataset.bamcoMixedSource===text)return;
 const hasFa=/[\u0600-\u06ff]/.test(text);cell.dataset.bamcoMixedSource=text;
 important(cell,'text-align','justify');important(cell,'text-align-last',hasFa?'right':'left');important(cell,'direction',hasFa?'rtl':'ltr');important(cell,'unicode-bidi','plaintext');
 // Character-scoped CSS handles mixed text without replacing children/listeners.
 important(cell,'font-family',"'BamcoTablePersian','Times New Roman',Times,serif");
}
function polishTaskText(){document.querySelectorAll('#kanbanBody tr[data-task-id],#archiveBody tr[data-task-id]').forEach(row=>{mixedFontCell(row.cells?.[1]);mixedFontCell(row.cells?.[2])})}
function widenTaskOptions(){
 const view=q('#systemOptionsView');if(!view)return;important(view,'width','100%');important(view,'max-width','none');important(view,'margin','0');important(view,'padding','0');important(view,'box-sizing','border-box');
 const panel=view.querySelector('.workspace-panel,.panel');if(panel){important(panel,'width','100%');important(panel,'max-width','none');important(panel,'margin','0');important(panel,'padding','0');important(panel,'box-sizing','border-box')}
 view.querySelectorAll('.catalog-section').forEach(section=>{important(section,'width','100%');important(section,'max-width','none');important(section,'margin','0');important(section,'padding','0');important(section,'box-sizing','border-box')});
 view.querySelectorAll('.catalog-section .table-wrap').forEach(wrap=>{important(wrap,'width','100%');important(wrap,'max-width','none');important(wrap,'margin','0');important(wrap,'padding','0');important(wrap,'box-sizing','border-box')});
 view.querySelectorAll('.catalog-table').forEach(table=>{important(table,'width','100%');important(table,'min-width','100%');important(table,'max-width','none');important(table,'margin','0');important(table,'box-sizing','border-box')});
}
function install(){
 const dialog=q('#calendarDialog');
 if(dialog){
  const board=document.createElement('div');board.className='day-picker';board.innerHTML='<div class="day-picker-nav"><button type="button" data-month="-1" aria-label="ماه قبل">‹</button><strong></strong><button type="button" data-month="1" aria-label="ماه بعد">›</button></div><div class="day-picker-grid"></div>';dialog.querySelector('.calendar-selects').after(board);
  function render(){const y=Number(q('#calYear').value),m=Number(q('#calMonth').value);if(!y||!m)return;board.querySelector('strong').textContent=months[m-1]+' '+fa(y);const iso=jalaliToISO(y,m,1),offset=(new Date(iso+'T12:00:00').getDay()+1)%7,max=daysInJalaliMonth(y,m),selected=Number(q('#calDay').value);board.querySelector('.day-picker-grid').innerHTML=['ش','ی','د','س','چ','پ','ج'].map(x=>'<span>'+x+'</span>').join('')+'<i></i>'.repeat(offset)+Array.from({length:max},(_,i)=>`<button type="button" data-day="${i+1}" class="${selected===i+1?'selected':''}" aria-label="${fa(i+1)} ${months[m-1]} ${fa(y)}">${fa(i+1)}</button>`).join('')}
  board.addEventListener('click',e=>{const day=e.target.closest('[data-day]');if(day){q('#calDay').value=day.dataset.day;q('#setDateBtn').click();return}const shift=e.target.closest('[data-month]');if(shift){let y=Number(q('#calYear').value),m=Number(q('#calMonth').value)+Number(shift.dataset.month);if(m<1){m=12;y--}if(m>12){m=1;y++}if(![...q('#calYear').options].some(o=>Number(o.value)===y))q('#calYear').add(new Option(fa(y),String(y)));q('#calYear').value=y;q('#calMonth').value=m;fillCalendarDays();render()}});
  new MutationObserver(()=>{if(dialog.open)render()}).observe(dialog,{attributes:true,attributeFilter:['open']});
 }
 let externalDate=null;
 document.addEventListener('click',e=>{const field=e.target.closest('#responseFrom,#responseTo,[data-day-grid]');if(!field)return;e.preventDefault();e.stopImmediatePropagation();externalDate=field;const nums=String(field.value||'').replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).split('/').map(Number),now=currentJalali(),p=nums.length===3&&jalaliToISO(...nums)?{y:nums[0],m:nums[1],d:nums[2]}:now;q('#calYear').replaceChildren(...Array.from({length:16},(_,i)=>new Option(fa(now.y-5+i),String(now.y-5+i))));if(![...q('#calYear').options].some(o=>Number(o.value)===p.y))q('#calYear').add(new Option(fa(p.y),String(p.y)));q('#calMonth').replaceChildren(...months.map((m,i)=>new Option(m,String(i+1))));q('#calYear').value=p.y;q('#calMonth').value=p.m;fillCalendarDays();q('#calDay').value=p.d;q('#calendarLabel').textContent=field.placeholder||'انتخاب تاریخ';dialog.showModal()},true);
 for(const [selector,clear]of [['#setDateBtn',false],['#clearDateBtn',true]])q(selector)?.addEventListener('click',e=>{if(!externalDate)return;e.preventDefault();e.stopImmediatePropagation();const field=externalDate;field.value=clear?'':fa(q('#calYear').value+'/'+q('#calMonth').value.padStart(2,'0')+'/'+q('#calDay').value.padStart(2,'0'));externalDate=null;dialog.close();field.dispatchEvent(new Event('input',{bubbles:true}))},true);
 dialog?.addEventListener('close',()=>externalDate=null);
 const tip=document.createElement('div');tip.className='task-preview-tip';tip.hidden=true;tip.setAttribute('role','tooltip');document.body.append(tip);
 function preview(el){const title=el.getAttribute('title')||el.dataset.preview;if(!title)return;el.dataset.preview=title;el.removeAttribute('title');tip.replaceChildren();title.split('\n').forEach((raw,i)=>{const line=faDigits(raw),part=document.createElement(i?'div':'strong');if(!/[\u0600-\u06ff]/.test(line)&&/[A-Za-z]/.test(line)){part.lang='en';part.dir='ltr'}let end=0;for(const match of line.matchAll(/[\p{Script=Latin}][\p{Script=Latin} \t@._%+\-/:;#&()'"]*/gu)){const text=match[0].trimEnd();part.append(document.createTextNode(line.slice(end,match.index)));const latin=document.createElement('bdi');latin.className='latin-run';latin.lang='en';latin.dir='ltr';latin.textContent=text;part.append(latin);end=match.index+text.length}part.append(document.createTextNode(line.slice(end)));tip.append(part)});tip.hidden=false;const r=el.getBoundingClientRect();tip.style.left=Math.max(8,Math.min(innerWidth-tip.offsetWidth-8,r.left))+'px';tip.style.top=Math.max(8,r.top-tip.offsetHeight-9)+'px'}
 document.addEventListener('pointerover',e=>{const b=e.target.closest('.tt-dot,.tt-bar,.conversation-task-tile,[data-task-preview]');if(b)preview(b)});document.addEventListener('focusin',e=>{if(e.target.matches('.tt-dot,.tt-bar,.conversation-task-tile,[data-task-preview]'))preview(e.target)});document.addEventListener('pointerout',e=>{if(e.target.closest('.tt-dot,.tt-bar,.conversation-task-tile,[data-task-preview]'))tip.hidden=true});document.addEventListener('focusout',()=>tip.hidden=true);document.addEventListener('click',()=>tip.hidden=true);document.addEventListener('scroll',()=>tip.hidden=true,true);
 // Use the same close glyph without altering any close handler.
 const root=q('#appView');const patch=()=>document.querySelectorAll('dialog button,.modal-head button,.panel-head button').forEach(b=>{if(b.dataset.cleanClose||!/^[×✕✖xX]$/.test(b.textContent.trim()))return;b.dataset.cleanClose='1';b.classList.add('clean-close');b.setAttribute('aria-label','بستن پنجره');b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>'});patch();let queued=false;new MutationObserver(()=>{if(!queued){queued=true;queueMicrotask(()=>{queued=false;patch()})}}).observe(document.body,{subtree:true,childList:true});

 async function openTaskHistory(taskId){return window.bamcoTaskHistory.open(state.tasks.find(t=>String(t.id)===String(taskId))||{id:taskId})}
 function selectedKanbanTaskId(){try{const task=typeof selectedTask==='function'?selectedTask('kanban'):null;if(task?.id)return task.id}catch{}return q('#kanbanBody .task-pick:checked')?.value||q('#kanbanBody tr.task-selected')?.dataset.taskId||null}
 document.addEventListener('click',e=>{const button=e.target.closest('#kanbanView .task-toolbar button,#kanbanView .bamco-command-bar button');if(!button||!/تاریخچه\s*وظیفه/.test(button.textContent||''))return;e.preventDefault();e.stopImmediatePropagation();const taskId=selectedKanbanTaskId();if(!taskId)return toast('ابتدا یک وظیفه را انتخاب کنید.',true);void openTaskHistory(taskId)},true);
 // Remove the older per-row "سوابق" shortcut; the unified toolbar history is the single entry point.
 document.querySelectorAll('.task-history-link').forEach(x=>x.remove());

 let polishFrame=0;const applyRequestedFixes=()=>{polishFrame=0;fixFilterSelects();polishTaskText();widenTaskOptions()};applyRequestedFixes();
 new MutationObserver(()=>{if(!polishFrame)polishFrame=requestAnimationFrame(applyRequestedFixes)}).observe(root||document.body,{childList:true,subtree:true});
 document.addEventListener('bamco:task-options',()=>requestAnimationFrame(applyRequestedFixes));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
