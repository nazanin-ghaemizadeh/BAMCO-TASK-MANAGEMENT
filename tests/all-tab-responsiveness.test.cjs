const test=require('node:test');
const assert=require('node:assert/strict');
const {fixture,pause}=require('./helpers/app-fixture.cjs');

test('every shipped tab opens without blocking the event loop',async t=>{
  const f=await fixture(),{d}=f;t.after(()=>f.dispose());
  const routes=[...new Set([...d.querySelectorAll('#nav [data-view]')].map(button=>button.dataset.view))];
  assert(routes.length>=20);
  for(const route of routes)await t.test(route,async()=>{
    let heartbeat=false;setTimeout(()=>{heartbeat=true},0);const started=performance.now();
    await f.open(route);await pause(0);
    const elapsed=performance.now()-started,view=d.querySelector('#'+route+'View');
    assert(view,route+' view is missing');
    assert(!view.classList.contains('hidden'),route+' did not become visible');
    assert(heartbeat,route+' blocked the event loop');
    // This jsdom suite runs all files concurrently in CI; the real Chromium audit
    // separately enforces interactive tab timings. Keep this bound for hangs,
    // without treating shared-runner scheduling pressure as an app regression.
    // Keep enough headroom for the constrained shared Node runner; browser smoke
    // tests remain the strict performance contract for a real interactive page.
    assert(elapsed<15000,route+' took '+Math.round(elapsed)+'ms to settle');
  });
  assert.deepEqual(f.errors,[]);
});
