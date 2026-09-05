window.BAMCO_DESKTOP_ASSETS = window.BAMCO_DESKTOP_ASSETS || {};
(function(){
  var l=document.createElement('link');l.rel='stylesheet';l.href='desktop-fixes.css';document.head.appendChild(l);
  setInterval(function(){
    var role=document.querySelector('#userRole')&&document.querySelector('#userRole').textContent;
    var manager=role==='مدیر سامانه';
    document.querySelectorAll('#nav [data-view="people"],#nav [data-view="send"],#nav [data-view="templates"],#nav [data-view="stickers"],#nav [data-view="followup"],#nav [data-view="approvals"]').forEach(function(el){el.classList.toggle('hidden',!manager);});
  },700);
})();
