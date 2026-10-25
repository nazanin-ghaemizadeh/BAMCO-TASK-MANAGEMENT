const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const node={},context={document:{querySelector:()=>node},window:{},console,Image:class{decode(){return new Promise(()=>{})}}};
vm.runInNewContext(fs.readFileSync('assets/js/assistant-body-demo.js','utf8'),context);
const math=context.window.BamcoBodyDemoMath;
test('each sample topic selects its intended body language',()=>{
 const samples=JSON.parse(fs.readFileSync('assets/audio/assistant-body-samples.json','utf8'));
 for(const sample of samples){assert.equal(math.classify(sample.fa),sample.key,sample.key);assert(sample.cues.length>35);assert(fs.statSync(sample.audio).size>1000)}
 assert.equal(math.classify('من موافق نیستم'),'crossed');assert.equal(math.classify('این کار باید انجام شود'),'assertive');
});
test('all arm targets have finite connected shoulder/elbow/hand chains',()=>{
 for(const pose of Object.values(math.definitions))for(const [root,target]of [[[405,440],pose.left],[[712,440],pose.right]]){
  const r=math.ik(root,target,140,190,target[2]);
  const hand=[r.elbow[0]+190*Math.cos(r.fore),r.elbow[1]+190*Math.sin(r.fore)];
  assert(Math.abs(Math.hypot(r.elbow[0]-root[0],r.elbow[1]-root[1])-140)<1e-6);
  assert(Math.hypot(hand[0]-target[0],hand[1]-target[1])<1e-5);
 }
});
