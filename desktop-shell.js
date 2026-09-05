(()=>{
  function applyDesktopShell(){
    const app=document.querySelector('#appView');
    const nav=document.querySelector('#nav');
    const sidebar=document.querySelector('#sidebar');
    if(!app||!nav||!sidebar)return;

    if(!document.querySelector('.desktop-topbar')){
      const bar=document.createElement('div');
      bar.className='desktop-topbar';
      bar.innerHTML='<div class="desktop-brand"><div><strong>سامانه مدیریت، پایش و پیگیری امور</strong><small>BAMCO TASK MANAGEMENT</small></div><img src="bamco-logo.png" alt="BAMCO"></div>';
      document.body.appendChild(bar);
    }

    const labels={
      mailsettings:'تنظیمات ایمیل',dashboard:'داشبورد',people:'افراد و رونوشت‌ها',send:'انتخاب و ارسال',templates:'متن ایمیل‌ها',stickers:'مدیریت استیکرها',followup:'پیگیری پاسخ‌ها',kanban:'کانبان',archive:'آرشیو',approvals:'تأیید درخواست‌ها'
    };
    const order=['mailsettings','dashboard','people','send','templates','stickers','followup','kanban','archive','approvals'];
    order.forEach(view=>{
      const btn=nav.querySelector(`[data-view="${view}"]`);
      if(btn){
        const span=btn.querySelector('span'); if(span)span.textContent=labels[view];
        nav.appendChild(btn);
      }
    });

    const role=document.querySelector('#userRole')?.textContent;
    if(role==='متولی'){
      ['mailsettings','people','send','templates','stickers','followup','approvals'].forEach(v=>nav.querySelector(`[data-view="${v}"]`)?.classList.add('hidden'));
    }

    const collapse=document.querySelector('#collapseBtn');
    if(collapse){
      const sync=()=>collapse.textContent=sidebar.classList.contains('collapsed')?'▶':'جمع‌کردن منو   ◀';
      sync(); collapse.addEventListener('click',()=>setTimeout(sync,0));
    }
  }
  document.addEventListener('DOMContentLoaded',()=>{setTimeout(applyDesktopShell,0);setTimeout(applyDesktopShell,700)});
})();
