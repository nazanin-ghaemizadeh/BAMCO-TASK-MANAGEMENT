const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');

test('the assistant puppet renders a continuous character and follows speaking state and audio',async()=>{
 const dom=new JSDOM('<section data-avatar-state="idle"><div data-avatar-scene><img class="assistant-avatar-frame speaking"><img class="assistant-avatar-face mouth-rest"><img class="assistant-avatar-face eyes-blink"><img class="assistant-avatar-face brows-emphasis"></div></section>',{runScripts:'outside-only'});
 const {window:w}=dom,view=w.document.querySelector('section'),uniforms=new Map();let draws=0,scheduled=null;
 w.HTMLImageElement.prototype.decode=()=>Promise.resolve();
 const gl={VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,ARRAY_BUFFER:5,ELEMENT_ARRAY_BUFFER:6,STATIC_DRAW:7,FLOAT:8,TRIANGLES:9,UNSIGNED_SHORT:10,TEXTURE0:100,TEXTURE_2D:101,TEXTURE_WRAP_S:102,TEXTURE_WRAP_T:103,CLAMP_TO_EDGE:104,TEXTURE_MIN_FILTER:105,TEXTURE_MAG_FILTER:106,LINEAR:107,UNPACK_FLIP_Y_WEBGL:108,RGBA:109,UNSIGNED_BYTE:110,BLEND:111,SRC_ALPHA:112,ONE_MINUS_SRC_ALPHA:113,COLOR_BUFFER_BIT:114,
  createShader:()=>({}),shaderSource(){},compileShader(){},getShaderParameter:()=>true,createProgram:()=>({}),attachShader(){},linkProgram(){},deleteShader(){},getProgramParameter:()=>true,useProgram(){},getUniformLocation:(_,name)=>name,uniform1i(){},uniform1f:(name,value)=>uniforms.set(name,value),createBuffer:()=>({}),bindBuffer(){},bufferData(){},getAttribLocation:()=>0,enableVertexAttribArray(){},vertexAttribPointer(){},enable(){},blendFunc(){},createTexture:()=>({}),activeTexture(){},bindTexture(){},texParameteri(){},pixelStorei(){},texImage2D(){},viewport(){},clearColor(){},clear(){},drawElements(){draws++}};
 w.HTMLCanvasElement.prototype.getContext=()=>gl;
 w.requestAnimationFrame=callback=>{scheduled=callback;return 1};w.cancelAnimationFrame=()=>{scheduled=null};
 w.matchMedia=()=>({matches:false});
 w.eval(fs.readFileSync('assets/js/assistant-puppet.js','utf8'));
 const puppet=w.BamcoAssistantPuppet.create(view);await puppet.start();
 assert(view.classList.contains('assistant-avatar-puppet-ready'));
 assert(view.querySelector('canvas.assistant-avatar-canvas'));
 scheduled(2000);assert.equal(draws,1);assert.equal(uniforms.get('uMouth'),0);
 view.dataset.avatarState='speaking';view.dataset.avatarViseme='aa';view.style.setProperty('--assistant-mouth-open','.9');
 scheduled(2050);assert(uniforms.get('uMouth')>.1);assert(uniforms.get('uSpeech')>0);
 view.dataset.avatarState='listening';view.style.setProperty('--assistant-mouth-open','0');
 scheduled(2100);assert(uniforms.get('uListening')>0);assert.equal(uniforms.get('uMouth'),0,'interruption closes the mouth immediately');
 puppet.stop();assert.equal(scheduled,null);
 dom.window.close();
});

test('avatar artwork remains visible by state when WebGL is unavailable',()=>{
 const css=fs.readFileSync('assets/css/personal-workspace.css','utf8');
 const dom=new JSDOM(`<style>${css}</style><section id="voiceAssistantView" data-avatar-state="idle"><div class="assistant-avatar-scene"><img class="assistant-avatar-frame listening"><img class="assistant-avatar-frame thinking"><img class="assistant-avatar-frame speaking"></div></section>`);
 const {document:d}=dom.window,view=d.querySelector('#voiceAssistantView');
 for(const state of ['listening','thinking','speaking']){
  view.dataset.avatarState=state;
  assert.equal(dom.window.getComputedStyle(view.querySelector(`.assistant-avatar-frame.${state}`)).opacity,'1',`${state} artwork hidden`);
 }
 dom.window.close();
});
