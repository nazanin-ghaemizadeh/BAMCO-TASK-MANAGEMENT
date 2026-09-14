/* App-owned confirmations and compact operation notices. */
(()=>{'use strict';let active=false;const queue=[];
function installToastStyles(){if(document.querySelector('#bamcoToastStyles'))return;const style=document.createElement('style');style.id='bamcoToastStyles';style.textContent=`
.bamco-toast-stack{position:fixed;z-index:2147483647;inset:18px auto auto 50%;transform:translateX(-50%);width:min(420px,calc(100vw - 32px));max-height:none;display:grid;gap:8px;pointer-events:none;direction:rtl;margin:0;padding:0;border:0;background:transparent;color:inherit;overflow:visible;box-sizing:border-box}
.bamco-toast{pointer-events:auto;display:grid;grid-template-columns:34px minmax(0,1fr) 38px;align-items:center;gap:10px;width:100%;min-width:0;max-height:min(34dvh,240px);padding:11px 12px;border:1px solid #91bca5;border-radius:13px;background:#f0fbf4;color:#173f35;box-shadow:0 8px 28px #143c3526;font:18px/1.55 BamcoScript,"B Nazanin",BNazanin,Tahoma,serif;text-align:right;box-sizing:border-box;overflow:auto;overscroll-behavior:contain}
.bamco-toast[data-kind=error]{border-color:#ce8b83;background:#fff4f2;color:#6f2722}
.bamco-toast-icon{display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:#d8eee1;color:#176b4d;font:700 20px/1 Tahoma,sans-serif}
.bamco-toast[data-kind=error] .bamco-toast-icon{background:#f8deda;color:#963e37}
.bamco-toast-copy{display:grid;min-width:0;gap:1px;overflow-wrap:anywhere;word-break:normal}
.bamco-toast-copy strong{font-size:1em;line-height:1.45}
.bamco-toast-copy>span{min-width:0}
.bamco-toast-close{display:grid;place-items:center;width:38px;height:38px;min-width:38px;padding:0;margin:0;border:0;border-radius:9px;background:transparent;color:inherit;cursor:pointer;font:24px/1 Tahoma,sans-serif}
.bamco-toast-close:hover,.bamco-toast-close:focus-visible{background:#173f3512;outline:2px solid #176b4d;outline-offset:1px}
@media(max-width:760px){
 .bamco-toast-stack{inset:auto 10px calc(10px + env(safe-area-inset-bottom,0px)) 10px;transform:none;width:auto;max-width:none;gap:6px}
 .bamco-toast{grid-template-columns:30px minmax(0,1fr) 42px;align-items:start;gap:8px;max-height:min(30dvh,190px);padding:10px;border-radius:11px;font-size:16px;line-height:1.5;box-shadow:0 5px 20px #143c3528}
 .bamco-toast-icon{width:30px;height:30px;font-size:18px}
 .bamco-toast-close{width:42px;height:42px;min-width:42px;margin:-6px -5px 0 0;font-size:22px}
 .bamco-toast-copy strong{font-size:17px}
}
`;document.head.append(style)}
function next(){if(active||!queue.length)return;active=true;const job=queue.shift();let d=document.querySelector('#bamcoNoticeDialog');if(!d){d=document.createElement('dialog');d.id='bamcoNoticeDialog';d.className='modal bamco-dialog bamco-notice';d.setAttribute('aria-labelledby','bamcoNoticeText');document.body.append(d)}
 d.replaceChildren();d.dataset.kind=job.options.error?'error':job.options.confirm?'confirm':'info';const icon=document.createElement('div');icon.className='notice-symbol';icon.textContent=job.options.error?'!':job.options.confirm?'؟':'✓';icon.setAttribute('aria-hidden','true');const text=document.createElement('p');text.id='bamcoNoticeText';text.textContent=job.message;const actions=document.createElement('div');actions.className='modal-actions';
 const finish=result=>{d.close();active=false;job.resolve(result);queueMicrotask(next)};const ok=document.createElement('button');ok.type='button';ok.dataset.noticeOk='';ok.className='primary';ok.textContent=job.options.confirm?'تأیید':'متوجه شدم';ok.onclick=()=>finish(true);actions.append(ok);
 if(job.options.confirm){const cancel=document.createElement('button');cancel.type='button';cancel.dataset.noticeCancel='';cancel.className='ghost';cancel.textContent='انصراف';cancel.onclick=()=>finish(false);actions.append(cancel)}d.append(icon,text,actions);d.oncancel=e=>{e.preventDefault();finish(false)};d.showModal();(job.options.confirm?actions.lastElementChild:ok).focus()}
// Operation results never wait for an acknowledgement or another notice.
window.bamcoToast=(message,error=false,options={})=>{
 if(error&&typeof error==='object'){options=error;error=!!options.error}
 installToastStyles();
 const popover=typeof HTMLElement.prototype.showPopover==='function',host=popover?document.body:([...document.querySelectorAll('dialog[open]')].at(-1)||document.body);
 let stack=host.querySelector(':scope > .bamco-toast-stack');
 if(!stack){stack=document.createElement('div');stack.className='bamco-toast-stack';if(popover)stack.setAttribute('popover','manual');host.append(stack);if(popover)stack.showPopover();else if(host.tagName==='DIALOG')host.addEventListener('close',()=>{if(stack.isConnected)document.body.append(stack)},{once:true})}
 const kind=options.kind||(error?'error':'success'),item=document.createElement('div');item.className='bamco-toast';item.dataset.kind=kind;item.setAttribute('role',error?'alert':'status');const icon=document.createElement('span');icon.className='bamco-toast-icon';icon.textContent=options.icon||(error?'!':kind==='download'?'↓':'✓');icon.setAttribute('aria-hidden','true');item.append(icon);
 const copy=document.createElement('span');copy.className='bamco-toast-copy';if(options.title){const title=document.createElement('strong');title.textContent=options.title;copy.append(title)}const text=document.createElement('span');text.textContent=String(message||'');copy.append(text);const close=document.createElement('button');close.type='button';close.className='bamco-toast-close';close.textContent='×';close.setAttribute('aria-label','بستن اعلان');let timer;
 const dismiss=()=>{clearTimeout(timer);item.remove();if(!stack.children.length)stack.remove()};close.onclick=dismiss;item.append(copy,close);stack.prepend(item);timer=setTimeout(dismiss,error?10000:Number(options.duration||5000));const limit=window.matchMedia?.('(max-width:760px)').matches?1:3;while(stack.children.length>limit)stack.lastElementChild.remove();
 return Promise.resolve(true);
};
window.bamcoNotice=(message,options={})=>new Promise(resolve=>{queue.push({message:String(message||''),options,resolve});next()});window.bamcoConfirm=message=>window.bamcoNotice(message,{confirm:true});
installToastStyles();
})();
