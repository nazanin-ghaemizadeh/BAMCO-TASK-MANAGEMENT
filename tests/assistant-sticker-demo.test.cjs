const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

test('demo mouth cues follow the audio phoneme clock and close for bilabials and pauses',()=>{
 const node={decode:()=>new Promise(()=>{})},context={document:{getElementById:()=>node},window:{},console};
 vm.runInNewContext(fs.readFileSync('assets/js/assistant-sticker-demo.js','utf8'),context);
 const {mouthFor,shapeAt}=context.window.BamcoStickerDemoMath;
 for(const phone of ['pau','m','b','p'])assert(mouthFor(phone)[0]<.1);
 assert(mouthFor('aa')[0]>.8);assert(mouthFor('uw')[1]>.8);assert(mouthFor('iy')[2]>.8);
 const data=JSON.parse(fs.readFileSync('assets/audio/assistant-sticker-demo-cues.json','utf8'));
 assert(data.cues.length>40);
 let end=0;
 for(const cue of data.cues){assert(cue.start>=end-.001);assert(cue.end>cue.start);end=cue.end;
  const target=shapeAt(data.cues,(cue.start+cue.end)/2);for(const n of target)assert(Number.isFinite(n)&&n>=0&&n<=1);
 }
 assert(shapeAt(data.cues,end+.1)[0]<.1);
});
