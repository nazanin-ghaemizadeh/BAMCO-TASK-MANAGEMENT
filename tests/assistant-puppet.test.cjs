const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');

test('the assistant puppet renders a continuous character and follows speaking state and audio',async()=>{
 const dom=new JSDOM('<section data-avatar-state="idle"><div data-avatar-scene><img class="assistant-avatar-frame speaking"><img class="assistant-avatar-face mouth-rest"><img class="assistant-avatar-face eyes-blink"><img class="assistant-avatar-face brows-emphasis"></div></section>',{runScripts:'outside-only'});
 const {window:w}=dom,view=w.document.querySelector('section'),uniforms=new Map(),pixelStore=[];let draws=0,scheduled=null;
 w.HTMLImageElement.prototype.decode=()=>Promise.resolve();
 const gl={VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,ARRAY_BUFFER:5,ELEMENT_ARRAY_BUFFER:6,STATIC_DRAW:7,FLOAT:8,TRIANGLES:9,UNSIGNED_SHORT:10,TEXTURE0:100,TEXTURE_2D:101,TEXTURE_WRAP_S:102,TEXTURE_WRAP_T:103,CLAMP_TO_EDGE:104,TEXTURE_MIN_FILTER:105,TEXTURE_MAG_FILTER:106,LINEAR:107,UNPACK_FLIP_Y_WEBGL:108,RGBA:109,UNSIGNED_BYTE:110,BLEND:111,SRC_ALPHA:112,ONE_MINUS_SRC_ALPHA:113,COLOR_BUFFER_BIT:114,
  createShader:()=>({}),shaderSource(){},compileShader(){},getShaderParameter:()=>true,createProgram:()=>({}),attachShader(){},linkProgram(){},deleteShader(){},getProgramParameter:()=>true,useProgram(){},getUniformLocation:(_,name)=>name,uniform1i(){},uniform1f:(name,value)=>uniforms.set(name,value),createBuffer:()=>({}),bindBuffer(){},bufferData(){},getAttribLocation:()=>0,enableVertexAttribArray(){},vertexAttribPointer(){},enable(){},blendFunc(){},createTexture:()=>({}),activeTexture(){},bindTexture(){},texParameteri(){},pixelStorei(...args){pixelStore.push(args)},texImage2D(){},viewport(){},clearColor(){},clear(){},drawElements(){draws++}};
 w.HTMLCanvasElement.prototype.getContext=()=>gl;
 w.requestAnimationFrame=callback=>{scheduled=callback;return 1};w.cancelAnimationFrame=()=>{scheduled=null};
 w.matchMedia=()=>({matches:false});
 w.eval(fs.readFileSync('assets/js/assistant-puppet.js','utf8'));
 const puppet=w.BamcoAssistantPuppet.create(view);await puppet.start();
 assert(view.classList.contains('assistant-avatar-puppet-ready'));
 assert.equal(pixelStore.length,4);assert(pixelStore.every(([parameter,value])=>parameter===gl.UNPACK_FLIP_Y_WEBGL&&value===false),'top-left image textures are not flipped');
 assert(view.querySelector('canvas.assistant-avatar-canvas'));
 scheduled(2000);assert(draws>=2,'the same puppet remains animated while calm');
 assert.equal(uniforms.get('uMouth'),0,'the mouth stays closed before speech');
 const calmDraws=draws;
 view.dataset.avatarState='speaking';view.dataset.avatarViseme='aa';view.dataset.avatarGesture='count';view.style.setProperty('--assistant-mouth-open','.9');view.style.setProperty('--assistant-speech-beat','.7');
 scheduled(2050);assert.equal(draws,calmDraws+1);assert(uniforms.get('uMouth')>.1);assert(uniforms.get('uSpeech')>0);assert(uniforms.get('uCount')>0);assert(uniforms.get('uBeat')>0);
 const open=uniforms.get('uMouth');view.dataset.avatarViseme='mbp';scheduled(2070);assert(uniforms.get('uMouth')<open,'a closed-lip sound closes the mouth even during voiced audio');
 view.dataset.avatarState='listening';view.style.setProperty('--assistant-mouth-open','0');
 scheduled(2100);assert.equal(draws,calmDraws+3,'the same canvas continues rendering in the listening state');
 assert.equal(uniforms.get('uMouth'),0,'the mouth closes immediately when the assistant stops speaking');
 assert(uniforms.get('uListening')>0,'listening creates a distinct head pose');
 puppet.stop();assert.equal(scheduled,null);
 dom.window.close();
});

test('the assistant also animates with a 2D canvas when WebGL is unavailable',async()=>{
 const dom=new JSDOM('<section data-avatar-state="idle"><div data-avatar-scene><img class="assistant-avatar-frame speaking"><img class="assistant-avatar-face mouth-rest"><img class="assistant-avatar-face eyes-blink"><img class="assistant-avatar-face brows-emphasis"></div></section>',{runScripts:'outside-only'});
 const {window:w}=dom,view=w.document.querySelector('section');let draws=0,scheduled=null;
 w.HTMLImageElement.prototype.decode=()=>Promise.resolve();
 const context={drawImage(){draws++},clearRect(){},save(){},restore(){},translate(){},scale(){},fillRect(){},setTransform(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},clip(){},createRadialGradient:()=>({addColorStop(){}})};
 w.HTMLCanvasElement.prototype.getContext=type=>type==='webgl'?null:context;
 w.requestAnimationFrame=callback=>{scheduled=callback;return 1};w.cancelAnimationFrame=()=>{scheduled=null};w.matchMedia=()=>({matches:false});
 w.eval(fs.readFileSync('assets/js/assistant-puppet.js','utf8'));
 const puppet=w.BamcoAssistantPuppet.create(view);await puppet.start();
 assert(puppet.ready);assert(view.classList.contains('assistant-avatar-puppet-ready'));
 assert(draws>600,'idle animation renders the whole 2D mesh');
 const initial=draws;view.dataset.avatarState='speaking';view.dataset.avatarViseme='aa';view.style.setProperty('--assistant-mouth-open','.8');
 scheduled(2000);assert(draws>initial,'speech also renders a moving mesh');
 puppet.stop();assert.equal(scheduled,null);dom.window.close();
});

test('the same welcoming artwork remains visible across states when WebGL is unavailable',()=>{
 const css=fs.readFileSync('assets/css/personal-workspace.css','utf8');
 const dom=new JSDOM(`<style>${css}</style><section id="voiceAssistantView" data-avatar-state="idle"><div class="assistant-avatar-scene"><img class="assistant-avatar-frame speaking"><img class="assistant-avatar-face mouth-rest"></div></section>`);
 const {document:d}=dom.window,view=d.querySelector('#voiceAssistantView');
 for(const state of ['idle','listening','thinking','speaking']){
  view.dataset.avatarState=state;
  assert.equal(dom.window.getComputedStyle(view.querySelector('.assistant-avatar-frame.speaking')).opacity,'1',`${state} artwork hidden`);
 }
 view.dataset.avatarState='idle';assert.equal(dom.window.getComputedStyle(view.querySelector('.mouth-rest')).opacity,'1');
 dom.window.close();
});

test('the animated canvas stays visible in every state when WebGL is ready',()=>{
 const css=fs.readFileSync('assets/css/personal-workspace.css','utf8');
 const dom=new JSDOM(`<style>${css}</style><section id="voiceAssistantView" class="assistant-avatar-puppet-ready" data-avatar-state="idle"><div class="assistant-avatar-scene"><canvas class="assistant-avatar-canvas"></canvas><img class="assistant-avatar-frame speaking"></div></section>`);
 const {document:d}=dom.window,view=d.querySelector('#voiceAssistantView'),canvas=d.querySelector('canvas');
 assert.equal(dom.window.getComputedStyle(canvas).opacity,'1');
 view.dataset.avatarState='speaking';assert.equal(dom.window.getComputedStyle(canvas).opacity,'1');
 dom.window.close();
});
