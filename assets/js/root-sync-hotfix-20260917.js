/* Persian chat direction only. Request order and avatars are owned by their source modules. */
(()=>{'use strict';
const q=s=>document.querySelector(s);
function installBidiCss(){
  if(q('#bamcoPersianChatBidi20260917'))return;
  const style=document.createElement('style');style.id='bamcoPersianChatBidi20260917';
  style.textContent=`
  .chat-body[dir="rtl"]{direction:rtl!important;text-align:right!important;unicode-bidi:plaintext!important;white-space:pre-wrap!important}
  .chat-body[dir="ltr"]{direction:ltr!important;text-align:left!important;unicode-bidi:plaintext!important;white-space:pre-wrap!important}
  .chat-body .bamco-emoji,.chat-body .bamco-emoji-fallback,.chat-body .chat-emoji-glyph,
  .chat-bubble .bamco-emoji,.chat-bubble .bamco-emoji-fallback{
    display:inline-block!important;direction:ltr!important;unicode-bidi:isolate!important;vertical-align:-.25em!important
  }
  .chat-body .chat-sticker{display:block!important;direction:ltr!important;unicode-bidi:isolate!important;margin-inline:auto!important}
  .chat-bubble blockquote{unicode-bidi:plaintext!important}
  `;document.head.append(style);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installBidiCss,{once:true});else installBidiCss();
})();
