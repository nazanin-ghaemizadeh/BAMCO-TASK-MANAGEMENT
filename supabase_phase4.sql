-- BAMCO Task Management - phase 4
-- Manager email/reminder module for the web app.

alter table public.profiles add column if not exists gender text;
alter table public.profiles add column if not exists salutation text;
alter table public.profiles add column if not exists cc_emails text[] not null default '{}';

-- Managers may maintain email metadata of all profiles.
drop policy if exists profiles_manager_update on public.profiles;
create policy profiles_manager_update on public.profiles for update to authenticated
using ((select public.is_manager()))
with check ((select public.is_manager()));
grant update on public.profiles to authenticated;

-- Seed known BAMCO mail metadata. Existing values are preserved when already set.
update public.profiles set
  gender=coalesce(gender,'خانم'), salutation=coalesce(nullif(salutation,''),'سرکار خانم مهندس قائمی'),
  cc_emails=case when cardinality(cc_emails)=0 then array['tanhaiyan@bamco.ir'] else cc_emails end
where lower(email::text)='ghaemizadeh@bamco.ir';
update public.profiles set
  gender=coalesce(gender,'آقا'), salutation=coalesce(nullif(salutation,''),'جناب آقای مهندس تنهائیان'),
  cc_emails=case when cardinality(cc_emails)=0 then array['a.zare@bamcofactory.ir'] else cc_emails end
where lower(email::text)='tanhaiyan@bamco.ir';
update public.profiles set gender=coalesce(gender,'آقا'),salutation=coalesce(nullif(salutation,''),'جناب آقای مهندس زارع جرجندی'),cc_emails=case when cardinality(cc_emails)=0 then array['tanhaiyan@bamco.ir'] else cc_emails end where lower(email::text)='a.zare@bamcofactory.ir';
update public.profiles set gender=coalesce(gender,'آقا'),salutation=coalesce(nullif(salutation,''),'جناب آقای مهندس احمدی'),cc_emails=case when cardinality(cc_emails)=0 then array['tanhaiyan@bamco.ir','a.zare@bamcofactory.ir'] else cc_emails end where lower(email::text)='r.ahmadi@bamcofactory.ir';
update public.profiles set gender=coalesce(gender,'خانم'),salutation=coalesce(nullif(salutation,''),'سرکار خانم مهندس مشکی'),cc_emails=case when cardinality(cc_emails)=0 then array['tanhaiyan@bamco.ir','a.zare@bamcofactory.ir'] else cc_emails end where lower(email::text)='p.moshki@bamcofactory.ir';
update public.profiles set gender=coalesce(gender,'خانم'),salutation=coalesce(nullif(salutation,''),'سرکار خانم مهندس راستی'),cc_emails=case when cardinality(cc_emails)=0 then array['tanhaiyan@bamco.ir'] else cc_emails end where lower(email::text)='rasti@bamco.ir';
update public.profiles set gender=coalesce(gender,'آقا'),salutation=coalesce(nullif(salutation,''),'جناب آقای مهندس شاه آبادی'),cc_emails=case when cardinality(cc_emails)=0 then array['tanhaiyan@bamco.ir'] else cc_emails end where lower(email::text)='k.shahabadi@bamco.ir';
update public.profiles set gender=coalesce(gender,'آقا'),salutation=coalesce(nullif(salutation,''),'جناب آقای مهندس حسین نژاد'),cc_emails=case when cardinality(cc_emails)=0 then array['tanhaiyan@bamco.ir','a.zare@bamcofactory.ir'] else cc_emails end where lower(email::text)='d.hosseinnezhad@bamcofactory.ir';
update public.profiles set gender=coalesce(gender,'آقا'),salutation=coalesce(nullif(salutation,''),'جناب آقای مهندس چهره'),cc_emails=case when cardinality(cc_emails)=0 then array['tanhaiyan@bamco.ir','a.zare@bamcofactory.ir'] else cc_emails end where lower(email::text)='chehreh@bamco.ir';

create table if not exists public.email_templates (
  id bigint generated always as identity primary key,
  template_key text unique not null check (template_key in ('state1','state2','state3','state4','state5','followup')),
  body_html text not null default '',
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
alter table public.email_templates enable row level security;
drop policy if exists email_templates_manager_all on public.email_templates;
create policy email_templates_manager_all on public.email_templates for all to authenticated
using ((select public.is_manager())) with check ((select public.is_manager()));
grant select,insert,update,delete on public.email_templates to authenticated;
grant usage,select on all sequences in schema public to authenticated;

insert into public.email_templates(template_key,body_html) values
('state1','[عنوان مخاطب]<br><br>با درود و مهر<br>خوشبختانه در حال حاضر موردی در دوره هشدار یا دیرکرد برای شما ثبت نشده است.<br><br>[استیکر]<br>با سپاس'),
('state2','[عنوان مخاطب]<br><br>با درود و مهر<br>تعداد امور در دوره هشدار: [تعداد هشدار]<br><br>[جدول امور هشداری]<br>[استیکر]<br>خواهشمند است موارد فوق را مدنظر قرار دهید.'),
('state3','[عنوان مخاطب]<br><br>با درود و مهر<br>تعداد امور دیرکردی: [تعداد دیرکرد]<br>تعداد امور در دوره هشدار: [تعداد هشدار]<br><br>[جدول امور دیرکردی]<br>[جدول امور هشداری]<br>[استیکر]'),
('state4','[عنوان مخاطب]<br><br>با درود و مهر<br>با توجه به تعداد امور دارای دیرکرد، خواهشمند است اقدامات لازم جهت تعیین تکلیف موارد زیر در اولویت قرار گیرد.<br><br>[جدول امور دیرکردی]<br>[جدول امور هشداری]<br>[استیکر]'),
('state5','[عنوان مخاطب]<br><br>با درود و مهر<br>تعداد امور دیرکردی: [تعداد دیرکرد]. پیگیری فوری موارد زیر ضروری است.<br><br>[جدول امور دیرکردی]<br>[جدول امور هشداری]<br>[استیکر]'),
('followup','[عنوان مخاطب]<br><br>با درود و مهر<br>این پیام یادآوری مجدد در خصوص گزارش ارسال‌شده قبلی است. خواهشمند است در صورت وجود هرگونه تغییر، پاسخ خود را اعلام فرمایید.')
on conflict(template_key) do nothing;

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
drop policy if exists app_settings_manager_all on public.app_settings;
create policy app_settings_manager_all on public.app_settings for all to authenticated
using ((select public.is_manager())) with check ((select public.is_manager()));
grant select,insert,update,delete on public.app_settings to authenticated;

create table if not exists public.email_logs (
  id bigint generated always as identity primary key,
  recipient_id uuid references public.profiles(id),
  recipient_email text not null,
  subject text not null,
  mail_type text not null default 'daily' check (mail_type in ('daily','followup')),
  graph_message_id text,
  internet_message_id text,
  sent_at timestamptz not null default now(),
  replied_at timestamptz,
  reply_message_id text,
  status text not null default 'sent',
  created_by uuid references public.profiles(id) default auth.uid()
);
alter table public.email_logs enable row level security;
drop policy if exists email_logs_manager_all on public.email_logs;
create policy email_logs_manager_all on public.email_logs for all to authenticated
using ((select public.is_manager())) with check ((select public.is_manager()));
grant select,insert,update,delete on public.email_logs to authenticated;

-- Public sticker bucket; writes remain manager-only through storage RLS.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('stickers','stickers',true,5242880,array['image/png','image/jpeg','image/webp'])
on conflict(id) do update set public=true;

drop policy if exists stickers_manager_insert on storage.objects;
create policy stickers_manager_insert on storage.objects for insert to authenticated
with check (bucket_id='stickers' and (select public.is_manager()));
drop policy if exists stickers_manager_update on storage.objects;
create policy stickers_manager_update on storage.objects for update to authenticated
using (bucket_id='stickers' and (select public.is_manager()))
with check (bucket_id='stickers' and (select public.is_manager()));
drop policy if exists stickers_manager_delete on storage.objects;
create policy stickers_manager_delete on storage.objects for delete to authenticated
using (bucket_id='stickers' and (select public.is_manager()));
