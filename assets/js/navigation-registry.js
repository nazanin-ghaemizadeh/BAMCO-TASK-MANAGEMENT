/* Canonical navigation catalog.  Sidebar, runtime and the home workspace read
   this one structure; domain modules only register views, never menu groups. */
(() => {
  'use strict';
  if (window.BamcoNavigationCatalog) return;

  const groups = Object.freeze([
    { key: 'people', title: 'مدیریت افراد', icon: '♙', routes: ['people', 'organization', 'activeSessions', 'loginActivity'] },
    { key: 'messages', title: 'مدیریت پیام', icon: '✉', routes: ['messages', 'messageCenter', 'sentMessages', 'responseTracking', 'templates', 'stickers'] },
    { key: 'reports', title: 'گزارش‌ها', icon: '▦', routes: ['dashboard', 'performanceReport', 'responseReport', 'pettyCash', 'invoices'] },
    { key: 'configuration', title: 'تنظیمات', icon: '⚙', routes: ['systemOptions', 'settings', 'alertSettings', 'emailSettings'] },
    { key: 'tasks', title: 'مدیریت وظایف', icon: '☑', routes: ['kanban', 'archive', 'taskTimeline', 'approvals', 'requestHistory'] },
    { key: 'delivery', title: 'مدیریت پروژه‌ها', icon: '▰', routes: ['projects'] },
    { key: 'vehicle', title: 'مدیریت منابع', icon: '◇', routes: ['vehiclePermanent', 'vehicleTemporary', 'parts'] },
    { key: 'conversations', title: 'گفتگوها', icon: '☵', routes: ['groupChat', 'directMessages', 'taskChats'] },
    { key: 'resources', title: 'منابع و دسترسی‌ها', icon: '▧', routes: ['documents', 'letters', 'sitesAccess', 'userGuide'] }
  ]);
  const byKey = Object.freeze(Object.fromEntries(groups.map(group => [group.key, group])));
  const routeGroup = Object.freeze(Object.fromEntries(groups.flatMap(group => group.routes.map(route => [route, group.key]))));
  const noHomeReturnRoutes = Object.freeze(new Set(['projects', 'parts', 'invoices', 'organization']));
  window.BamcoNavigationCatalog = Object.freeze({ groups, byKey, routeGroup, noHomeReturnRoutes });
})();
