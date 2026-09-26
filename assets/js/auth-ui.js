(()=>{
'use strict';
const VERSION='20260922-login-core-readiness-1';
if(window.__bamcoAuthUiInstalled===VERSION)return;
window.__bamcoAuthUiInstalled=VERSION;

const q=s=>document.querySelector(s);
const USER_ICON=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5.58-8-5.58Z"/></svg>`;
const LOCK_ICON=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 8h-1V6a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2Zm-7-2a2 2 0 1 1 4 0v2h-4V6Zm3 9.73V18h-2v-2.27a2 2 0 1 1 2 0Z"/></svg>`;
const EYE_ICON=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5c5.2 0 9.3 4.6 10.5 6.1a1.4 1.4 0 0 1 0 1.8C21.3 14.4 17.2 19 12 19S2.7 14.4 1.5 12.9a1.4 1.4 0 0 1 0-1.8C2.7 9.6 6.8 5 12 5Zm0 2C8 7 4.6 10.4 3.5 12c1.1 1.6 4.5 5 8.5 5s7.4-3.4 8.5-5C19.4 10.4 16 7 12 7Zm0 2.2a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6Z"/></svg>`;
const EYE_OFF_ICON=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3.3 2 18.7 18.7-1.3 1.3-3.4-3.4A11.8 11.8 0 0 1 12 20C6.8 20 2.7 15.4 1.5 13.9a1.4 1.4 0 0 1 0-1.8 20.5 20.5 0 0 1 4.1-4.2L2 3.3 3.3 2Zm3.8 7.4A18.5 18.5 0 0 0 3.5 13c1.1 1.6 4.5 5 8.5 5 1.3 0 2.6-.4 3.7-1l-1.8-1.8a4 4 0 0 1-5.1-5.1L7.1 9.4ZM12 6c5.2 0 9.3 4.6 10.5 6.1a1.4 1.4 0 0 1 0 1.8 18.2 18.2 0 0 1-2.2 2.4l-1.4-1.4a17.2 17.2 0 0 0 1.6-1.9c-1.1-1.6-4.5-5-8.5-5-.8 0-1.5.1-2.2.3L8.2 6.7A12 12 0 0 1 12 6Z"/></svg>`;
const REFRESH_ICON=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 8a7 7 0 1 0 1 4h-2a5 5 0 1 1-1.45-3.54L14 11h7V4l-2 2v2Z" fill="currentColor"/></svg>`;
const toLatinDigits=v=>String(v||'').replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d));
const makeCode=()=>String(1000+crypto.getRandomValues(new Uint32Array(1))[0]%9000);

function injectCss(){
  if(q('#bamcoLoginSafetyCss'))return;
  const style=document.createElement('style');style.id='bamcoLoginSafetyCss';style.textContent=`
  #loginView{position:relative!important;z-index:2147483000!important;pointer-events:auto!important}
  #loginView .login-card,#loginForm,#loginForm *{pointer-events:auto!important}
  #loginVerifyCode.login-verify-native{position:static!important;inset:auto!important;width:100%!important;height:40px!important;border:1px solid #bdcdc6!important;border-radius:8px!important;background:#fff!important;color:#174f3e!important;caret-color:#174f3e!important;opacity:1!important;direction:ltr!important;text-align:center!important;padding:6px 10px!important;margin:0!important;font-family:"Times New Roman",Times,serif!important;font-size:18px!important;font-weight:700!important;letter-spacing:5px!important;outline:none!important;z-index:3!important;appearance:auto!important;-webkit-text-fill-color:#174f3e!important;user-select:text!important}
  #loginVerifyCode.login-verify-native:focus{border-color:#218764!important;box-shadow:0 0 0 3px #21876416!important}
  #loginView .login-submit[disabled]{pointer-events:none!important;opacity:.75}
  `;document.head.appendChild(style);
}

function buildLogin(){
  const form=q('#loginForm');if(!form)return null;
  const email=q('#email')?.value||'',password=q('#password')?.value||'';
  form.innerHTML=`<div class="login-fields">
  <label class="login-field" for="email"><span class="login-field-title bamco-fa">نام کاربری</span><span class="login-input-shell"><input id="email" class="english" type="text" autocomplete="username" required placeholder="name@bamco.ir" dir="ltr"><span class="login-leading-icon">${USER_ICON}</span></span></label>
  <label class="login-field" for="password"><span class="login-field-title bamco-fa">رمز عبور</span><span class="login-input-shell"><input id="password" class="english" type="password" autocomplete="current-password" required placeholder="••••••" dir="ltr"><span class="login-leading-icon">${LOCK_ICON}</span><button type="button" class="login-password-toggle" aria-label="نمایش رمز عبور" title="نمایش رمز عبور">${EYE_ICON}</button></span></label>
  <div class="login-field login-verification-field"><span class="login-field-title bamco-fa">تأیید عددی</span><div id="loginVerification" class="login-verification-box"><div id="loginVerifyDisplay" class="login-code-display" aria-label="کد تأیید"></div><input id="loginVerifyCode" type="hidden"><div class="verification-digits" role="group" aria-label="کد تأیید چهار رقمی" dir="ltr">${[0,1,2,3].map(i=>`<input class="verification-digit english" type="text" inputmode="numeric" autocomplete="off" maxlength="4" aria-label="رقم ${i+1} کد تأیید" required>`).join('')}</div><button type="button" id="refreshLoginVerify" class="login-refresh-code" title="ساخت کد جدید" aria-label="ساخت کد جدید">${REFRESH_ICON}</button></div><div id="loginVerifyError" class="login-code-error bamco-fa" aria-live="polite"></div></div>
  </div><button class="primary wide login-submit" type="submit">ورود به سامانه</button>
  <div class="login-secondary-actions" aria-label="روش‌های دیگر ورود"><button class="department-back" type="button">بازگشت به انتخاب مدیریت</button><button class="login-otp" type="button" disabled aria-disabled="true" title="این روش ورود به‌زودی فعال می‌شود">ورود با رمز یکبارمصرف</button></div>
  <p id="loginError" class="form-error" aria-live="polite"></p>`;
  q('#email').value=email;q('#password').value=password;return form;
}

function install(){
  injectCss();
  // The login logo is already declared in index.html. Do not rewrite its src here;
  // assigning the same src again forces a second image load/decode and causes a flash.
  const form=buildLogin();if(!form)return;
  const password=q('#password'),toggle=q('.login-password-toggle'),box=q('#loginVerification'),display=q('#loginVerifyDisplay'),verify=q('#loginVerifyCode'),verifyError=q('#loginVerifyError'),refreshCode=q('#refreshLoginVerify'),btn=form.querySelector('button[type="submit"]'),error=q('#loginError');
  const digits=[...form.querySelectorAll('.verification-digit')];
  const focusDigit=()=>digits[0].focus({preventScroll:true});
  const syncDigits=()=>{verify.value=digits.map(x=>x.value).join('');verifyError.textContent=''};
  digits.forEach((input,i)=>{
    input.addEventListener('input',()=>{const value=toLatinDigits(input.value).replace(/\D/g,'');input.value=value.slice(0,1);if(value.length>1){[...value].slice(0,4-i).forEach((d,j)=>digits[i+j].value=d)}syncDigits();if(value&&i<3)digits[Math.min(3,i+value.length)].focus()});
    input.addEventListener('paste',e=>{e.preventDefault();const value=toLatinDigits(e.clipboardData.getData('text')).replace(/\D/g,'').slice(0,4);if(!value)return;const start=value.length===4?0:i;[...value].slice(0,4-start).forEach((d,j)=>digits[start+j].value=d);syncDigits();digits[Math.min(3,start+value.length)].focus()});
    input.addEventListener('keydown',e=>{if(e.key==='Backspace'&&!input.value&&i>0){e.preventDefault();digits[i-1].value='';digits[i-1].focus();syncDigits()}else if(e.key==='ArrowLeft'&&i>0){e.preventDefault();digits[i-1].focus()}else if(e.key==='ArrowRight'&&i<3){e.preventDefault();digits[i+1].focus()}});
  });
  const renew=(clear=true)=>{box.dataset.code=makeCode();display.textContent=box.dataset.code;verify.value='';digits.forEach(x=>x.value='');if(clear)verifyError.textContent=''};renew();
  const normalize=()=>{const v=toLatinDigits(verify.value).replace(/\D/g,'').slice(0,4);if(verify.value!==v)verify.value=v;return v};
  // auth-ui intentionally owns only the visual preflight.  App.js owns the
  // actual authentication request and session transition.  The controls load
  // before the bundle, so never reach into its lexical bindings here.
  const coreReady=()=>typeof window.bamcoAuth?.accept==='function'&&typeof window.loginEmail==='function'&&typeof window.enterApp==='function';
  let coreTimer=null,delegatedBusy=false;
  const setCoreMessage=(message,state)=>{error.textContent=message;error.dataset.bamcoCoreState=state};
  const clearCoreMessage=()=>{if(error.dataset.bamcoCoreState){error.textContent='';delete error.dataset.bamcoCoreState}};
  const syncCoreReadiness=(final=false)=>{
    const ready=coreReady();form.dataset.bamcoCoreReady=ready?'1':'0';btn.disabled=!ready;
    if(ready){if(coreTimer)clearTimeout(coreTimer);coreTimer=null;clearCoreMessage();return true}
    if(final)setCoreMessage('هستهٔ ورود آماده نشد. صفحه را تازه‌سازی کنید و دوباره تلاش کنید.','failed');
    else setCoreMessage('در حال آماده‌سازی سامانه…','loading');
    return false;
  };
  const observer=typeof MutationObserver==='function'?new MutationObserver(()=>{if(!btn.disabled)delegatedBusy=false}):null;
  observer?.observe(btn,{attributes:true,attributeFilter:['disabled']});
  syncCoreReadiness();
  window.addEventListener('load',()=>syncCoreReadiness(true),{once:true});
  coreTimer=window.setTimeout(()=>syncCoreReadiness(true),15000);
  verify.addEventListener('input',()=>{normalize();verifyError.textContent=''});verify.addEventListener('paste',()=>setTimeout(normalize,0));
  refreshCode.addEventListener('click',()=>{renew();focusDigit()});
  toggle.addEventListener('click',()=>{const showing=password.type==='text';password.type=showing?'password':'text';toggle.innerHTML=showing?EYE_ICON:EYE_OFF_ICON;toggle.title=showing?'نمایش رمز عبور':'مخفی کردن رمز عبور';toggle.setAttribute('aria-label',toggle.title);password.focus()});
  form.addEventListener('submit',event=>{
    if(delegatedBusy){event.preventDefault();event.stopImmediatePropagation();return}
    const entered=normalize();if(entered!==box.dataset.code){event.preventDefault();event.stopImmediatePropagation();renew(false);verifyError.textContent='کد تأیید صحیح نیست. کد جدید را وارد کنید.';focusDigit();return}
    if(!syncCoreReadiness(true)){event.preventDefault();event.stopImmediatePropagation();renew(false);return}
    // Let the canonical app.js bubble handler perform the one real sign-in.
    // The capture handler has only validated the CAPTCHA and must not make a
    // parallel request with a duplicate session/profile path.
    delegatedBusy=true;verifyError.textContent='';error.textContent='';
  },true);
  document.dispatchEvent(new CustomEvent('bamco:login-ui-ready'));
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
