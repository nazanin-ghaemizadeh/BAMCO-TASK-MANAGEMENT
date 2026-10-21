-- Register independent quality-tool permissions in each management workspace.
-- The existing manager bypass applies; regular users require explicit grants.
do $$declare workspace_schema text;begin
 foreach workspace_schema in array array['public','bamco_process','bamco_quality'] loop
  execute format($query$
   insert into %I.app_features(feature_key,route_key,title,category,sort_order)
   values ('ovenAnalysis','ovenAnalysis','تحلیل دمای کوره','paintThermal',310),
          ('statisticalProcessControl','statisticalProcessControl','کنترل آماری فرایند (SPC)','statisticalQuality',320)
   on conflict(feature_key) do update set route_key=excluded.route_key,title=excluded.title,category=excluded.category,sort_order=excluded.sort_order,active=true,updated_at=now()
  $query$,workspace_schema);
 end loop;
end$$;
