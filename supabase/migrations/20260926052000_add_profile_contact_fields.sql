-- Contact fields shown only through the existing profile access rules.
alter table public.profiles
  add column if not exists mobile_phone text,
  add column if not exists internal_extension text;

alter table public.profiles drop constraint if exists profiles_mobile_phone_format;
alter table public.profiles
  add constraint profiles_mobile_phone_format
  check (mobile_phone is null or mobile_phone ~ '^\\+?[0-9۰-۹]{8,16}$') not valid;
alter table public.profiles validate constraint profiles_mobile_phone_format;

alter table public.profiles drop constraint if exists profiles_internal_extension_format;
alter table public.profiles
  add constraint profiles_internal_extension_format
  check (internal_extension is null or internal_extension ~ '^[0-9۰-۹]{1,12}$') not valid;
alter table public.profiles validate constraint profiles_internal_extension_format;

comment on column public.profiles.mobile_phone is 'شماره همراه فرد برای دفترچه افراد';
comment on column public.profiles.internal_extension is 'شماره داخلی فرد برای دفترچه افراد';
