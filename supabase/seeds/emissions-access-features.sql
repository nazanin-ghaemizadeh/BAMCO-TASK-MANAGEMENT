-- Register both emissions tools in every workspace without changing existing grants.
do $$ declare ns text; begin
 foreach ns in array array['public','bamco_process','bamco_quality'] loop
  execute format($seed$
   insert into %I.app_features(feature_key,route_key,title,category,sort_order)
   values ('emissionTests','emissionTests','اشک و لبخند','emissionTests',450),
          ('fuelEconomyGrade','fuelEconomyGrade','تعیین گرید آلایندگی و مصرف سوخت و انرژی','emissionTests',451)
   on conflict(feature_key) do nothing
  $seed$,ns);
 end loop;
end $$;
