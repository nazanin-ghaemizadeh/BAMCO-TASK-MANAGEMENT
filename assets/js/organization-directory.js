/* One organization snapshot shared by administration, people, access and charts. */
(()=>{'use strict';
 const root=window,model={data:null,loading:null,userId:'',loadedAt:0,epoch:0};
 const isAdmin=()=>!!root.Bamco?.state?.token&&root.BamcoAccess?.isSystemManager?.()===true;
 const rpc=(name,body={})=>(root.BamcoData?.rpc||root.rpc)(name,body),active=row=>row?.active!==false;
 const workspace=schema=>model.data?.workspaces?.find(item=>item.schema_name===schema)||null;
 const department=id=>model.data?.departments?.find(item=>String(item.id)===String(id))||null;
 const unit=id=>model.data?.units?.find(item=>String(item.id)===String(id))||null;
 const currentSchema=()=>root.BamcoWorkspace?.schema?.()||'public';
 // A forced read waits for older reads, then fetches after the committed write.
 async function load({force=false}={}){
  if(!isAdmin())return null;
  const userId=String(root.Bamco?.state?.user?.id||''),token=root.Bamco?.state?.token,epoch=model.epoch;
  if(model.loading){await model.loading;if(!force)return model.data}
  if(!isAdmin()||epoch!==model.epoch||token!==root.Bamco?.state?.token)return null;
  if(!force&&model.data&&model.userId===userId&&Date.now()-model.loadedAt<30000)return model.data;
  const job=(async()=>{const data=await rpc('admin_org_snapshot');
   if(!data||!Array.isArray(data.departments)||!Array.isArray(data.units)||!Array.isArray(data.workspaces))throw Error('فهرست سازمانی معتبر دریافت نشد.');
   if(!isAdmin()||epoch!==model.epoch||token!==root.Bamco?.state?.token)return null;
   model.data=data;model.userId=userId;model.loadedAt=Date.now();
   root.dispatchEvent(new CustomEvent('bamco:organization-directory',{detail:data}));return data;
  })();model.loading=job;try{return await job}finally{if(model.loading===job)model.loading=null}
 }
 async function changed(){model.loadedAt=0;const data=await load({force:true});if(data)root.BamcoDomainSync?.invalidate?.('organization',{source:'organization-admin',broadcast:true});return data}
 // Resolve the namespace from the centrally owned unit. Existing RPC guards and
 // table RLS still authorize every request; no privileged key reaches the client.
 async function request(unitId,path,{method='POST',body}={}){
  if(!isAdmin())throw Error('این عملیات فقط برای مدیر سامانه مجاز است.');
  const selected=unit(unitId);if(!selected||!active(selected)||!['public','bamco_process','bamco_quality'].includes(selected.schema_name))throw Error('واحد معتبر نیست.');
  const token=root.Bamco.state.token,auth=root.bamcoAuth?.snapshot?.();
  await rpc('admin_org_prepare_workspace',{p_schema:selected.schema_name});
  if(token!==root.Bamco.state.token||auth&&root.bamcoAuth?.isCurrent?.(auth)===false)throw Error('نشست مدیریت تغییر کرده است.');
  const response=await fetch(`${SB_URL}/rest/v1/${path}`,{method,cache:'no-store',headers:{apikey:SB_KEY,Authorization:'Bearer '+token,'Content-Type':'application/json','Accept-Profile':selected.schema_name,'Content-Profile':selected.schema_name,Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body)});
  const result=await response.json().catch(()=>null);
  if(!response.ok)throw Error(result?.message||'ذخیره تنظیمات انجام نشد.');
  if(token!==root.Bamco.state.token||auth&&root.bamcoAuth?.isCurrent?.(auth)===false)throw Error('نشست مدیریت تغییر کرده است.');
  return result;
 }
 function departments(){return (model.data?.departments||[]).filter(active)}
 function units(departmentId=''){return (model.data?.units||[]).filter(item=>active(item)&&(!departmentId||String(item.department_id)===String(departmentId)))}
 function defaults(){const current=units().find(item=>item.schema_name===currentSchema())||units()[0]||null;return{departmentId:String(current?.department_id||departments()[0]?.id||''),unitId:String(current?.id||'')}}
 function scopedUnits(departmentId='',unitId=''){if(unitId){const selected=unit(unitId);return selected&&active(selected)?[selected]:[]}return units(departmentId)}
 function directory({departmentId='',unitId=''}={}){const selectedUnits=scopedUnits(departmentId,unitId),unitIds=new Set(selectedUnits.map(item=>String(item.id))),schemas=new Set(selectedUnits.map(item=>item.schema_name)),members=(model.data?.members||[]).filter(item=>unitIds.has(String(item.unit_id))),membershipByUser=new Map(members.map(item=>[`${item.schema_name}:${item.user_id}`,unit(item.unit_id)])),result=[];for(const schema of schemas){const scope=workspace(schema);if(!scope)continue;const schemaUnits=selectedUnits.filter(item=>item.schema_name===schema),people=scope.people||[],roles=scope.roles||[],positions=scope.positions||[],assignments=scope.assignments||[];for(const person of people){let assignedUnit=membershipByUser.get(`${schema}:${person.id}`)||null;if(!assignedUnit&&schemaUnits.length===1&&!(model.data?.members||[]).some(item=>item.schema_name===schema))assignedUnit=schemaUnits[0];if(!assignedUnit||!unitIds.has(String(assignedUnit.id)))continue;const assignment=assignments.find(item=>String(item.user_id)===String(person.id)&&item.is_primary!==false),position=assignment&&positions.find(item=>String(item.id)===String(assignment.position_id)),role=position&&roles.find(item=>String(item.id)===String(position.role_id)),dept=department(assignedUnit.department_id);result.push({...person,full_name:person.full_name||person.name,display_name:person.display_name||person.name,organization_role:role?.title||'بدون نقش سازمانی',organization_position:position?.title||'بدون جایگاه',department_id:dept?.id||null,department_title:dept?.title||'—',unit_id:assignedUnit.id,unit_title:assignedUnit.title,schema_name:schema})}}return result.sort((a,b)=>String(a.full_name||'').localeCompare(String(b.full_name||''),'fa'))}
 function structure({departmentId='',unitId=''}={}){const selectedUnits=scopedUnits(departmentId,unitId),schemas=new Set(selectedUnits.map(item=>item.schema_name)),roles=[],positions=[],assignments=[],people=[];for(const schema of schemas){const scope=workspace(schema);if(!scope)continue;const localIds=new Set(selectedUnits.filter(item=>item.schema_name===schema).map(item=>String(item.local_unit_id))),schemaPositions=(scope.positions||[]).filter(item=>localIds.has(String(item.unit_id))||(item.unit_id==null&&localIds.size===1)),ids=new Set(schemaPositions.map(item=>String(item.id)));positions.push(...schemaPositions);roles.push(...(scope.roles||[]));assignments.push(...(scope.assignments||[]).filter(item=>ids.has(String(item.position_id))));people.push(...(scope.people||[]))}const versions=[...schemas].map(schema=>({schema_name:schema,structure_version:Number(workspace(schema)?.structure_version||1),updated_at:workspace(schema)?.structure_updated_at||null}));return{units:selectedUnits,roles,positions,assignments,people,versions}}
 function clear(){model.epoch++;model.data=null;model.loading=null;model.userId='';model.loadedAt=0}
 document.addEventListener('click',event=>{if(event.target.closest('#logoutBtn'))clear()});
 let refreshTimer=null;
 document.addEventListener('bamco:domain-invalidated',event=>{
  if(event.detail?.source==='organization-admin'||!isAdmin()||!model.data||!['organization','profiles','access'].includes(event.detail?.domain))return;
  model.loadedAt=0;clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{void load({force:true}).catch(()=>{})},150);
 });
 root.addEventListener('focus',()=>{if(isAdmin()&&model.data)void load({force:true}).catch(()=>{})});
 root.BamcoOrganizationDirectory=Object.freeze({load,changed,request,clear,departments,units,defaults,directory,structure,data:()=>model.data,unit,department,workspace});
})();
