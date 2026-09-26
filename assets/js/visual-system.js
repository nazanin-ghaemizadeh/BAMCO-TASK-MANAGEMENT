/* Consistent interface icons; leave existing actions and permissions intact. */
(()=>{
'use strict';
const paths={
 help:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M9.5 9a2.5 2.5 0 1 1 4.2 1.8c-1.2 1-1.7 1.5-1.7 3.2M12 18h.01',
 guide:'M12 5v16M12 5C8 2 4 3 2 4v16c4-2 7-1 10 1 3-2 6-3 10-1V4c-2-1-6-2-10 1',
 resources:'M3 7h7l2 2h9v12H3zM3 7V3h7l2 4',
 documents:'M6 2h8l4 4v16H6zM14 2v5h4M9 11h6M9 15h6M9 19h4',
 letters:'M3 6h18v14H3zM3 7l9 7 9-7M7 3h10',
 letterIncoming:'M3 7h18v14H3zM3 8l9 7 9-7M12 3v8M8 7l4 4 4-4',
 letterOutgoing:'M3 7h18v14H3zM3 8l9 7 9-7M12 11V3M8 7l4-4 4 4',
 sitesAccess:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M3 12h18M12 3c-5 5-5 13 0 18M12 3c5 5 5 13 0 18',
 tasks:'M8 5H5v16h14V5h-3M9 3h6v4H9zM8 12l2 2 4-4M8 18h8',
 people:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M17 4a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-4',
 accessMatrix:'M4 4h16v16H4zM4 10h16M10 4v16M13 7l1.5 1.5L18 5M13 14l1.5 1.5L18 12',
 messages:'M3 5h18v14H3zM3 6l9 7 9-7',
 conversations:'M21 4H3v13h5v4l5-4h8zM7 9h10M7 13h6',
 vehicle:'M4 10l2-6h12l2 6M3 10h18v8H3zM6 18v3M18 18v3M6 14h2M16 14h2',
 reports:'M4 3v18h17M8 17v-5M13 17V7M18 17v-9',
 configuration:'M4 7h6M14 7h6M4 17h10M18 17h2M10 4v6M14 14v6',
 kanban:'M3 4h18v16H3zM9 4v16M15 4v16M5 8h2M11 8h2M17 8h2M5 12h2M11 12h2',
 archive:'M3 4h18v4H3zM5 8v13h14V8M9 12h6',
 calendar:'M4 5h16v16H4zM8 2v6M16 2v6M4 10h16M8 14h2M14 14h2M8 18h2',
 check:'M20 6 9 17l-5-5',
 history:'M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v5l3 2',
 chain:'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2',
 send:'m3 3 18 9-18 9 4-9-4-9M7 12h14',
 reply:'m9 5-6 6 6 6M3 11h11a7 7 0 0 1 7 7',
 text:'M4 4h16M12 4v16M8 20h8',
 sticker:'M20 14V4H4v16h10l6-6M14 20v-6h6M8 8h.01M16 8h.01M8 11c2 3 6 3 8 0',
 login:'M9 4H3v16h6M13 7l5 5-5 5M6 12h12',
 screen:'M3 4h18v13H3zM8 21h8M12 17v4M7 8h10',
 dashboard:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
 bell:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
 user:'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M4 21v-2a8 8 0 0 1 16 0v2',
 temporary:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7v5l4 2',
 projects:'M4 5h6l2 2h8v13H4zM8 11h8M8 15h5',
 parts:'M9 3h6v4h4v6h-4v8H9v-8H5V7h4z',
 tools:'M14 6a4 4 0 0 0 4 4L9 19l-4-4 9-9M14 6l4-3 3 3-3 4',
 invoices:'M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h4',
 cash:'M3 7h18v12H3zM3 10h18M16 14h2M5 7V5h13',
 delivery:'M3 9l9-6 9 6M5 10v9M9 10v9M15 10v9M19 10v9M3 21h18',
 sentLog:'M4 3h16v18H4zM8 8h8M8 12h5M8 16l2 2 5-5',
 logout:'M10 4H4v16h6M15 8l4 4-4 4M9 12h10',
 personal:'M12 3 13.8 8.2 19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z',
 notes:'M4 3h16v18H4zM8 8h8M8 12h8M8 16h5M16 3v5h4',
 voiceAssistant:'M12 3a4 4 0 0 0-4 4v3a4 4 0 0 0 8 0V7a4 4 0 0 0-4-4ZM5 10a7 7 0 0 0 14 0M12 17v4M8 21h8'
};
const views={userGuide:'guide',documents:'documents',letters:'letters',lettersIncoming:'letterIncoming',lettersOutgoing:'letterOutgoing',sitesAccess:'sitesAccess',projects:'projects',parts:'parts',invoices:'invoices',pettyCash:'cash',organization:'organization',tools:'tools',kanban:'kanban',archive:'archive',taskTimeline:'calendar',approvals:'check',requestHistory:'history',people:'people',accessMatrix:'accessMatrix',loginActivity:'login',activeSessions:'screen',messages:'messages',messageCenter:'send',sentMessages:'sentLog',responseTracking:'reply',templates:'text',stickers:'sticker',vehiclePermanent:'vehicle',vehicleTemporary:'temporary',dashboard:'dashboard',performanceReport:'reports',messageReport:'messages',responseReport:'reply',requestReport:'tasks',loginReport:'login',systemOptions:'configuration',alertSettings:'bell',emailSettings:'messages',settings:'user',groupChat:'people',directMessages:'messages',taskChats:'conversations',notes:'notes',voiceAssistant:'voiceAssistant'};
const svg=key=>`<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${paths[key]||paths.configuration}"/></svg>`;
function install(){
 const nav=document.querySelector('#nav');if(!nav)return;
 let pending=false;const observer=new MutationObserver(()=>{if(!pending){pending=true;queueMicrotask(refresh)}});
 function refresh(){
  pending=false;observer.disconnect();
  nav.querySelectorAll('.nav-group').forEach(group=>{const icon=group.querySelector('.nav-group-icon'),key=group.dataset.navIcon||group.dataset.group||group.dataset.navGroup;if(icon&&paths[key]&&icon.dataset.lineIcon!==key){icon.innerHTML=svg(key);icon.dataset.lineIcon=key}});
  nav.querySelectorAll('[data-view]').forEach(button=>{
   const key=views[button.dataset.view]||'configuration';let icon=button.querySelector(':scope>b');if(!icon){icon=document.createElement('b');button.prepend(icon)}
   if(icon.dataset.lineIcon!==key){icon.innerHTML=svg(key);icon.dataset.lineIcon=key}
   if(button.dataset.view==='settings'){const label=button.querySelector('span');if(label&&label.textContent!=='تنظیمات کاربری')label.textContent='تنظیمات کاربری';button.title='تنظیمات کاربری';button.setAttribute('aria-label','تنظیمات کاربری')}
  });
  observer.observe(nav,{childList:true,subtree:true,characterData:true});
 }
 refresh();
 for(const [id,key,label] of [['logoutBtn','logout','خروج از حساب'],['notificationBell','bell','پیام‌ها و اعلان‌ها'],['headerSettingsBtn','user','تنظیمات کاربری']]){
  const button=document.getElementById(id);if(!button)continue;const old=button.querySelector('svg');if(old)old.outerHTML=svg(key);button.title=label;if(id!=='notificationBell')button.setAttribute('aria-label',label);
 }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
