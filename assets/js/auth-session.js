/* One in-memory authentication session for all application requests. */
(()=>{
 'use strict';
 const network=window.BamcoNetwork,transport=network?.raw?.bind(network)||window.fetch.bind(window);let refreshToken='',expiresAt=0,refreshing=null,timer=null,ending=false,generation=0;
 function accept(data){
  if(!data?.access_token)throw Error('پاسخ ورود معتبر نیست.');
  state.token=data.access_token;if(data.user)state.user=data.user;
  if(data.refresh_token)refreshToken=data.refresh_token;
  expiresAt=Number(data.expires_at||0)*1000||Date.now()+Number(data.expires_in||3600)*1000;
  clearTimeout(timer);if(refreshToken)timer=setTimeout(()=>ensureFresh(true).catch(()=>expire()),Math.max(1000,expiresAt-Date.now()-60000));
 }
 function snapshot(){return {generation,userId:state.user?.id}}
 function isCurrent(value){return !!value&&value.generation===generation&&value.userId===state.user?.id&&!!state.token}
 function clear(){generation++;clearTimeout(timer);timer=null;refreshToken='';expiresAt=0;refreshing=null;window.bamcoMedia?.clear()}
 function expire(){clear();if(typeof showLogin==='function')showLogin()}
 async function ensureFresh(force=false){
  if(!refreshToken||(!force&&expiresAt-Date.now()>60000))return;
  if(!refreshing)refreshing=(async()=>{
   const started=generation;
   const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
   try{const response=await transport(SB_URL+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:SB_KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:refreshToken}),signal:controller.signal}),data=await response.json();if(started!==generation)return;if(!response.ok){expire();throw Error('اعتبار ورود پایان یافته است؛ دوباره وارد شوید.')}accept(data)}
   finally{clearTimeout(timeout);if(started===generation)refreshing=null}
  })();
  return refreshing;
 }
 const request=async(input,init={},next)=>{
  const url=typeof input==='string'?input:input.url,headers=new Headers(init.headers||(input instanceof Request?input.headers:undefined));
  if(typeof SB_URL==='undefined'||!url.startsWith(SB_URL+'/')||!state.token)return next(input,init);
  if(headers.get('Authorization')&&headers.get('Authorization')!=='Bearer '+state.token)return next(input,init);
  const session=snapshot();await ensureFresh();if(!isCurrent(session))throw Error('حساب ورود تغییر کرده است.');if(!state.token)throw Error('دوباره وارد شوید.');headers.set('Authorization','Bearer '+state.token);const sentToken=state.token;
  let response=await next(input,{...init,headers});
  if(!isCurrent(session))throw Error('حساب ورود تغییر کرده است.');
  if(response.status===401&&refreshToken&&!ending){if(state.token===sentToken)await ensureFresh(true);if(!isCurrent(session))throw Error('حساب ورود تغییر کرده است.');if(!state.token)throw Error('دوباره وارد شوید.');headers.set('Authorization','Bearer '+state.token);response=await next(input,{...init,headers})}
  return response;
 };
 if(network?.use)network.use('auth-session',request);
 async function signOut(){
  if(ending)return;ending=true;
  let auditError=null,logoutError=null;
  try{
   try{await window.bamcoPush?.unsubscribe()}catch{}
   try{await window.bamcoSession?.end('logout')}catch(error){auditError=error}
   if(state.token){
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
    try{const response=await transport(SB_URL+'/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:SB_KEY,Authorization:'Bearer '+state.token},signal:controller.signal});if(!response.ok)throw Error('خروج در سرور تأیید نشد.')}
    catch(error){logoutError=error}
    finally{clearTimeout(timeout)}
   }
  }finally{clear();ending=false;showLogin()}
  if(auditError&&logoutError)toast('خروج از این دستگاه انجام شد؛ به‌دلیل قطع ارتباط، ثبت پایان نشست در سرور تأیید نشد.',true);
  else if(logoutError)toast('پایان نشست ثبت شد؛ ارتباط با سرویس خروج برقرار نشد.',true);
 }
 async function changePassword(password){
  if(password.length<12)throw Error('رمز عبور باید حداقل ۱۲ کاراکتر باشد.');
  if(/^(.)\1+$/.test(password)||/^(123456|password|qwerty)/i.test(password))throw Error('رمز عبور قابل حدس است؛ یک عبارت طولانی‌تر و متفاوت انتخاب کنید.');
  await api('/auth/v1/user',{method:'PUT',body:{password}});
  await update('profiles',`id=eq.${state.profile.id}`,{must_change_password:false,updated_at:new Date().toISOString()});
  state.profile.must_change_password=false;return state.profile;
 }
 window.bamcoAuth={snapshot,isCurrent,accept,ensureFresh,clear,signOut,changePassword};
 if(typeof document!=='undefined')document.dispatchEvent(new Event('bamco:auth-core-ready'));
})();
