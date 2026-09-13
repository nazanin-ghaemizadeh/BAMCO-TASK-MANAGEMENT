const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');
const runtime=fs.readFileSync(path.join(__dirname,'../assets/js/production-runtime.js'),'utf8');
const fn=runtime.slice(runtime.indexOf('function render(id)'),runtime.indexOf('\nfunction bind()'));
for(const id of ['groupChat','directMessages','taskChats','loginActivity','activeSessions','performanceReport','responseReport','systemOptions'])test(`${id}: asynchronous data errors render a visible error panel`,async()=>{let shown;const fail=async()=>{throw Error('test unavailable')};const ctx={window:{bamcoTabs:{owns:id=>!['groupChat','directMessages','taskChats'].includes(id),render:fail},bamcoConversations:{owns:id=>['groupChat','directMessages','taskChats'].includes(id),render:fail}},REMOVED:new Set(['requestReport']),purgeRemoved:()=>{},panel:(...args)=>shown=args,esc:s=>s,renderGroup:fail,renderDirect:fail,renderTasksChat:fail,renderSessions:fail,renderPerformance:fail,simpleReport:fail,systemOptions:fail,inflight:new Map(),Promise};vm.createContext(ctx);vm.runInContext(fn,ctx);await ctx.render(id);assert.equal(shown[0],id);assert.match(shown[3],/test unavailable/)});
const source=fs.readFileSync(path.join(__dirname,'../assets/js/app.js'),'utf8');const api=source.slice(source.indexOf('async function api('),source.indexOf('\nconst select='));
test('API timeout produces a recoverable error and clears its timer',async()=>{let abort,cleared=false;const ctx={SB_KEY:'test',SB_URL:'https://example.invalid',state:{token:'test'},navigator:{onLine:false},window:{bamcoNetworkErrors:[]},AbortController,apiErrorMessage:()=>'',setTimeout:f=>(abort=f,1),clearTimeout:()=>cleared=true,fetch:async()=>{abort();throw Error('aborted')}};vm.createContext(ctx);vm.runInContext(api,ctx);await assert.rejects(ctx.api('/test'),/دوباره تلاش کنید/);assert.equal(cleared,true);assert.equal(ctx.window.bamcoNetworkErrors.length,1)});

test('an active manager view is not hidden by its access marker',()=>{
  const css=fs.readFileSync(path.join(__dirname,'../assets/css/app.css'),'utf8');
  assert.match(css,/\.view\.manager-only:not\(\.hidden\)\{display:block!important\}/);
});

test('runtime can create a late navigation group before adding its route',()=>{
  assert.match(runtime,/function groupFor\(key\)\{const labels=/);
  assert.match(runtime,/configuration:\['تنظیمات','⚙'\]/);
  assert.match(runtime,/return labels\[key\]\?ensureGroup\(key,\.\.\.labels\[key\]\):null/);
});
test('removed alert and email settings have no route registrations',()=>{assert.doesNotMatch(runtime,/\['(?:alertSettings|emailSettings)'/)});
test('request report route is removed from production navigation',()=>{
  assert.doesNotMatch(runtime,/\['requestReport','گزارش درخواست‌ها'/);
  assert.doesNotMatch(runtime,/reports:\[[^\]]*'requestReport'/);
  assert.match(runtime,/const REMOVED=new Set\(\['requestReport'\]\)/);
});
