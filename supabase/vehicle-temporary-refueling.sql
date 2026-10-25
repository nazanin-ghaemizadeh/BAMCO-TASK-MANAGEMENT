-- Nullable fields preserve existing temporary handovers and legacy Excel files.
alter table public.vehicle_temporary_records
  add column if not exists fuel_liters numeric check (fuel_liters >= 0),
  add column if not exists fuel_amount numeric check (fuel_amount >= 0);
comment on column public.vehicle_temporary_records.fuel_liters is 'Added gasoline volume in liters';
comment on column public.vehicle_temporary_records.fuel_amount is 'Gasoline cost in IRR';
notify pgrst, 'reload schema';
