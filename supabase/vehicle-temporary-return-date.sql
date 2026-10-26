alter table public.vehicle_temporary_records add column if not exists return_date text;
comment on column public.vehicle_temporary_records.return_date is 'Jalali date of temporary vehicle return';
notify pgrst, 'reload schema';
