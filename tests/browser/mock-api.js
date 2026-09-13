/* Isolated browser fixture. Never authenticate against or write to production. */
(()=>{
 const manager={id:'00000000-0000-4000-8000-000000000001',full_name:'مدیر آزمایشی',display_name:'مدیر آزمایشی',email:'manager@example.test',role:'manager',active:true,avatar_path:'00000000-0000-4000-8000-000000000001/avatar.png'};
 const owner={id:'00000000-0000-4000-8000-000000000002',full_name:'متولی آزمایشی',email:'owner@example.test',role:'owner',active:true,avatar_path:'00000000-0000-4000-8000-000000000002/avatar.png'};
 const iso=new Date().toISOString(),today=iso.slice(0,10);
 const api=window.__testApi={actor:manager,calls:[],delay:{},fail:[],profiles:[manager,owner],templates:['state1','state2','state3','state4','state5','followup'].map((key,i)=>({id:i+1,template_key:key,subject_template:'موضوع '+key,body_html:'<p>متن ذخیره‌شده '+key+'</p>'})),deliveries:[30,31,32].map(id=>({delivery_id:id,recipient_id:owner.id,recipient_name:owner.full_name,channel:'portal',subject:'پیام آزمایشی '+id,sent_at:iso,response_status:'awaiting',delivery_status:'sent',reminder_count:0})),tasks:[{id:1,legacy_id:1,title:'وظیفه آزمایشی',owner_id:owner.id,archived:false,status:'در حال انجام',priority:'متوسط',start_date:today,due_date:today,reminder_days:1},{id:2,legacy_id:2,title:'وظیفه انجام‌شده',owner_id:owner.id,archived:true,status:'انجام شده',priority:'کم',start_date:today,due_date:today,done_date:today}],requests:[]};
 window.__testTicks=0;setInterval(()=>window.__testTicks++,50);
 window.fetch=async(input,init={})=>{
  const url=new URL(typeof input==='string'?input:input.url,'https://bamco.test/'),endpoint=url.pathname.split('/').pop(),method=init.method||'GET',body=typeof init.body==='string'?JSON.parse(init.body):null;
  api.calls.push({endpoint,method,body});
  if(api.delay[endpoint])await new Promise(resolve=>setTimeout(resolve,api.delay[endpoint]));
  if(api.fail.includes(endpoint))return new Response(JSON.stringify({message:'خطای آزمایشی '+endpoint}),{status:500});
  const filter=rows=>rows.filter(row=>[...url.searchParams].every(([k,v])=>!v.startsWith('eq.')||String(row[k])===v.slice(3)));
  let data=[];
  if(endpoint==='token')data={access_token:'browser-fixture-token',refresh_token:'browser-fixture-refresh',expires_in:3600,user:{id:api.actor.id}};
  else if(endpoint==='user')data={id:api.actor.id};
  else if(endpoint==='session-audit')data=body.action==='start'?{ok:true,session:{id:'browser-test-session'}}:{ok:true,ended:body.action==='end'};
  else if(endpoint==='letters')data=Array.from({length:53},(_,i)=>({id:'letter-'+i,letter_number:'1405/10/'+(i+1),letter_date:'1405/06/22',recipient:'گیرنده آزمایشی',subject:'موضوع نامه آزمایشی '+(i+1),version:1,storage_path:null}));
  else if(endpoint==='can_access_letters')data=api.actor.active!==false&&(api.actor.role==='manager'||(api.letterAccess||[]).includes(api.actor.id));
  else if(endpoint==='profiles')data=filter(api.profiles);
  else if(endpoint==='task_status_view')data=api.actor.role==='manager'?api.tasks:api.tasks.filter(t=>t.owner_id===api.actor.id);
  else if(endpoint==='change_requests')data=api.requests;
  else if(endpoint==='email_templates'){
   data=filter(api.templates);if(method==='PATCH')data.forEach(row=>Object.assign(row,body));
  }else if(endpoint==='message_response_tracking')data=api.deliveries.slice();
  else if(endpoint==='cancel_message_deliveries'){
   const ids=new Set(body.p_ids.map(Number));data=api.deliveries.filter(d=>ids.has(d.delivery_id)).length;api.deliveries=api.deliveries.filter(d=>!ids.has(d.delivery_id));
  }else if(endpoint==='chat_ensure_public')data='00000000-0000-4000-8000-000000000003';
  else if(endpoint==='chat_directory'||endpoint==='chat_directory_v2')data=api.profiles;
  else if(endpoint==='sticker_sets')data=[{id:1,name:'نسخه آزمایشی',active:true}];
  else if(endpoint==='stickers')data=['state1','state2','state3','state4','state5'].flatMap((state_key,i)=>['female','male'].map((gender,j)=>({id:i*2+j+1,set_id:1,state_key,gender,storage_path:'fixture/'+state_key+'-'+gender+'.png'})));
  else if(url.pathname.includes('/storage/'))return new Response(Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='),c=>c.charCodeAt(0)),{headers:{'Content-Type':'image/png'}});
  return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
 };
})();
