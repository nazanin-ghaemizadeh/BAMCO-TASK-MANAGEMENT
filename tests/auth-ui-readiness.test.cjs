const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');

const source=fs.readFileSync(path.join(__dirname,'../assets/js/auth-ui.js'),'utf8');

function fixture(){
  const dom=new JSDOM('<!doctype html><div id="loginView"><form id="loginForm"><input id="email"><input id="password"></form></div>',{url:'https://bamco.test/',runScripts:'outside-only',pretendToBeVisual:true});
  const {window}=dom,{document}=window;
  window.fetch=()=>{throw Error('auth-ui must not make a direct authentication request')};
  window.eval(source);
  if(!document.querySelector('#loginVerification'))document.dispatchEvent(new window.Event('DOMContentLoaded'));
  return{dom,window,document};
}

function enterCaptcha(document){
  document.querySelector('#loginVerifyCode').value=document.querySelector('#loginVerification').dataset.code;
}

test('login visual preflight waits for the canonical app runtime and delegates one valid submit',t=>{
  const {dom,window,document}=fixture();t.after(()=>dom.window.close());
  const form=document.querySelector('#loginForm'),button=form.querySelector('[type="submit"]'),error=document.querySelector('#loginError');
  let appSubmits=0;
  form.addEventListener('submit',event=>{appSubmits++;event.preventDefault()});

  assert.equal(button.disabled,true);
  assert.match(error.textContent,/در حال آماده‌سازی سامانه/);
  enterCaptcha(document);
  const beforeReady=new window.Event('submit',{bubbles:true,cancelable:true});
  assert.equal(form.dispatchEvent(beforeReady),false);
  assert.equal(beforeReady.defaultPrevented,true);
  assert.equal(appSubmits,0);
  assert.match(error.textContent,/هستهٔ ورود آماده نشد/);

  // These are the only public readiness dependencies.  In production all
  // three are installed by app.js/auth-session before the page load event.
  window.bamcoAuth={accept(){}};
  window.loginEmail=()=>'';
  window.enterApp=async()=>{};
  window.dispatchEvent(new window.Event('load'));
  assert.equal(button.disabled,false);
  assert.equal(error.textContent,'');

  enterCaptcha(document);
  const ready=new window.Event('submit',{bubbles:true,cancelable:true});
  assert.equal(form.dispatchEvent(ready),false);
  assert.equal(appSubmits,1);
  assert.equal(ready.defaultPrevented,true);
});

test('auth-ui contains no direct request path into app lexical bindings',()=>{
  assert.doesNotMatch(source,/\bSB_(?:URL|KEY)\b/);
  assert.doesNotMatch(source,/(?<![.$\w])state\s*(?:\.|\[)/);
  assert.doesNotMatch(source,/(?<![.$\w])loginEmail\s*\(/);
  assert.doesNotMatch(source,/(?<![.$\w])enterApp\s*\(/);
});
