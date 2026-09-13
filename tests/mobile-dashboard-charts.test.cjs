const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture,pause}=require('./helpers/app-fixture.cjs');

test('mobile workload and performance charts use readable bitmap widths and one RTL scroll surface',async t=>{
 const tasks=[];let id=1;for(let i=0;i<7;i++)for(let j=0;j<=i;j++)tasks.push({id:id++,title:`جاری ${i}-${j}`,owner_id:'mobile-'+i,status:'در حال انجام',status_key:'doing',priority:'متوسط',archived:false,due_state:'فاقد شرایط دیرکرد'});for(let i=0;i<5;i++)tasks.push({id:100+i,title:'آرشیو '+i,owner_id:'mobile-'+i,status:'انجام شده',status_key:'done',priority:'متوسط',archived:true,due_date:'2026-09-10',done_date:'2026-09-08',advance_days:i+1,delay_days:0});
 const f=await fixture({mobile:true,tables:{tasks}});t.after(()=>f.dispose());const {w,d}=f;
 for(let i=0;i<7;i++)w.eval(`state.profiles.push({id:'mobile-${i}',full_name:'متولی آزمایشی ${i}'})`);await f.open('dashboard');w.renderDashboard();await pause(150);
 const workload=d.querySelector('#workloadChart'),performance=d.querySelector('#performanceChart'),workloadCard=workload.parentElement,performanceCard=performance.parentElement;
 assert.equal(workload.dataset.chartItems,'7');assert.equal(workload.style.getPropertyValue('--chart-width'),'995px');assert.equal(workload.width,995*w.devicePixelRatio);assert(workloadCard.classList.contains('dashboard-chart-scroll'));assert.equal(workloadCard.getAttribute('aria-label'),'نمودار؛ برای مشاهده کامل افقی پیمایش کنید');
 assert.equal(performance.dataset.chartItems,'5');assert.equal(performance.style.getPropertyValue('--chart-width'),'785px');assert.equal(performance.width,785*w.devicePixelRatio);assert(performanceCard.classList.contains('dashboard-chart-scroll'));assert.match(performanceCard.dataset.chartScrollKey,/785:5/);
 assert.equal(workload.dataset.chartOrder,'متولی آزمایشی 6|متولی آزمایشی 5|متولی آزمایشی 4|متولی آزمایشی 3|متولی آزمایشی 2|متولی آزمایشی 1|متولی آزمایشی 0');
 assert.equal(performance.dataset.chartOrder,'متولی آزمایشی 4|متولی آزمایشی 3|متولی آزمایشی 2|متولی آزمایشی 1|متولی آزمایشی 0');
 assert.deepEqual(f.errors,[]);
});
