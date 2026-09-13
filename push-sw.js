/* Notifications only: never intercept requests or cache authentication/data. */
'use strict';
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
 let data={};try{data=event.data?.json()||{}}catch{data={body:event.data?.text()||''}}
 const base=new URL('./',self.location.href),target=new URL(data.url||'./',base);
 const url=target.origin===base.origin&&target.pathname.startsWith(base.pathname)?target.href:base.href;
 event.waitUntil(self.registration.showNotification(data.title||'BAMCO',{body:data.body||'اعلان جدید در سامانه',icon:new URL('assets/images/bamco-icon-192.png',base).href,badge:new URL('assets/images/bamco-icon-192.png',base).href,tag:'bamco-'+(data.id||'notification'),dir:'rtl',lang:'fa',data:{url}}));
});
self.addEventListener('notificationclick',event=>{event.notification.close();const url=event.notification.data?.url||self.registration.scope;event.waitUntil((async()=>{const tabs=await self.clients.matchAll({type:'window',includeUncontrolled:true});for(const tab of tabs){if(tab.url.startsWith(self.registration.scope)){await tab.navigate(url);return tab.focus()}}return self.clients.openWindow(url)})())});
