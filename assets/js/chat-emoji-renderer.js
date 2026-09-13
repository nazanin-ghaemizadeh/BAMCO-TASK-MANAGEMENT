/* Consistent Unicode emoji artwork; text remains Unicode in the database. */
(()=>{
'use strict';
function code(glyph){return Array.from(glyph.includes('\u200d')?glyph:glyph.replace(/\ufe0f/g,'')).map(c=>c.codePointAt(0).toString(16)).join('-')}
function segments(text){return typeof Intl.Segmenter==='function'?[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)].map(x=>x.segment):Array.from(text)}
function isEmoji(s){return /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(s)&&!s.includes('\ufe0e')}
if(typeof module!=='undefined')module.exports={code,segments,isEmoji};
if(typeof document==='undefined')return;
function render(root){
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),nodes=[];
 while(walker.nextNode()){const n=walker.currentNode;if(!n.parentElement?.closest('textarea,input,script,style,select,[data-emoji-fallback]')&&isEmoji(n.data))nodes.push(n)}
 for(const n of nodes){const f=document.createDocumentFragment();for(const g of segments(n.data)){
  if(!isEmoji(g)){f.append(document.createTextNode(g));continue}
  const image=document.createElement('img');image.className='bamco-emoji';image.alt=g;image.draggable=false;image.referrerPolicy='no-referrer';image.loading='lazy';image.decoding='async';
  image.src='https://cdn.jsdelivr.net/gh/jdecked/twemoji@v17.0.3/assets/svg/'+code(g)+'.svg';
  image.onerror=()=>{const fallback=document.createElement('span');fallback.dataset.emojiFallback='';fallback.className='bamco-emoji-fallback';fallback.textContent=g;image.replaceWith(fallback)};f.append(image);
 }n.replaceWith(f)}
}
window.bamcoEmoji={render};
})();
