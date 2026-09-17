(()=>{
'use strict';
try{
 for(const key of ['bamco.app.pending-version','bamco.app.update-attempts','bamco.app.dismissed-version'])localStorage.removeItem(key);
 document.querySelectorAll('.bamco-update-notice').forEach(node=>node.remove());
}catch{}
if(window.__bamcoAppUpdateV2)return;
const script=document.createElement('script');
script.src=`assets/js/app-update-v2.js?bridge=${Date.now()}`;
script.defer=true;
document.head.append(script);
})();
