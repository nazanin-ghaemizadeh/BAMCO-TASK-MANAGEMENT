const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');

function harness(){
 const dom=new JSDOM(`<section><div class="assistant-messages"></div><form class="assistant-composer"><textarea></textarea></form><button class="assistant-mic"></button><span class="assistant-status"></span><button data-assistant-history></button><button data-assistant-live></button><button data-assistant-play></button><button data-assistant-new></button><button data-personal-home></button></section>`,{url:'https://example.test',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,view=w.document.querySelector('section');let starts=0,stops=0;
 w.BamcoAssistantPuppet={create:()=>({start(){starts++},stop(){stops++}})};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
 w.eval(fs.readFileSync('assets/js/assistant-runtime.js','utf8'));
 const runtime=w.BamcoAssistantRuntime.create(view,{session:()=>({token:'token',userId:'u1'}),loadSticker:async()=>{}});
 return{dom,w,view,runtime,get starts(){return starts},get stops(){return stops}};
}

test('restoring history resumes avatar animation and tab hiding stops it',()=>{
 const h=harness();try{
 h.runtime.activate();assert.equal(h.starts,1);
 h.w.localStorage.setItem('bamco.assistant.conversations.v1.u1',JSON.stringify([{id:'old',summary:'قبلی',messages:[{role:'user',text:'سلام قدیمی'}]}]));
 h.view.querySelector('[data-assistant-history]').click();h.w.document.querySelector('.assistant-history-entry').click();
 assert.equal(h.starts,2,'restoring a transcript must restart the disposed puppet');
 assert.match(h.view.querySelector('.assistant-messages').textContent,/سلام قدیمی/);
 Object.defineProperty(h.w.document,'hidden',{configurable:true,value:true});
 const stops=h.stops;h.w.document.dispatchEvent(new h.w.Event('visibilitychange'));assert.equal(h.stops,stops+1);
 Object.defineProperty(h.w.document,'hidden',{configurable:true,value:false});h.w.document.dispatchEvent(new h.w.Event('visibilitychange'));assert.equal(h.starts,3);
 }finally{h.runtime.dispose();h.dom.window.close()}
});

test('opening live voice preserves prior roles and cancels a pending text response',async()=>{
 const h=harness();try{
 const sent=[];let signal,peer;
 h.w.SB_URL='https://example.test';h.w.SB_KEY='public';
 h.w.fetch=async(url,options)=>{
  if(url.endsWith('/realtime/calls'))return{ok:true,text:async()=> 'v=0'};
  const body=JSON.parse(options.body);
  if(body.action==='realtime_session')return{ok:true,json:async()=>({value:'ephemeral'})};
  signal=options.signal;
  return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new h.w.DOMException('Aborted','AbortError'))));
 };
 Object.defineProperty(h.w.navigator,'mediaDevices',{value:{getUserMedia:async()=>({getTracks:()=>[],getAudioTracks:()=>[]})}});
 h.w.HTMLMediaElement.prototype.pause=function(){};
 h.w.RTCPeerConnection=class{
  constructor(){peer=this}
  addTrack(){}
  createDataChannel(){this.channel={readyState:'open',send:value=>sent.push(JSON.parse(value)),close(){}};return this.channel}
  async createOffer(){return{sdp:'v=0'}}
  async setLocalDescription(value){this.localDescription=value}
  async setRemoteDescription(){this.channel.onopen()}
  close(){}
 };
 h.runtime.activate();
 h.w.localStorage.setItem('bamco.assistant.conversations.v1.u1',JSON.stringify([{id:'old',messages:[{role:'user',text:'سؤال قبلی'},{role:'assistant',text:'پاسخ قبلی'}]}]));
 h.view.querySelector('[data-assistant-history]').click();h.w.document.querySelector('.assistant-history-entry').click();
 h.view.querySelector('textarea').value='سؤال تازه';h.view.querySelector('form').dispatchEvent(new h.w.Event('submit',{cancelable:true}));
 assert(signal&&!signal.aborted);assert(h.view.querySelector('.pending'));
 h.view.querySelector('[data-assistant-live]').click();
 for(let i=0;i<30&&!sent.length;i++)await new Promise(resolve=>setTimeout(resolve,5));
 assert(signal.aborted);assert.equal(h.runtime.busy,false);assert.equal(h.view.querySelector('.pending'),null);
 const items=sent.filter(event=>event.type==='conversation.item.create').map(event=>event.item);
 assert.equal(items.length,3);assert.equal(items[0].content[0].type,'input_text');assert.equal(items[1].content[0].type,'output_text');
 assert.equal(items[1].content[0].text,'پاسخ قبلی');assert(peer);
 }finally{h.runtime.dispose();h.dom.window.close()}
});
