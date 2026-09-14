alter table public.document_categories
  add column if not exists parent_id bigint references public.document_categories(id) on delete restrict;
create index if not exists document_categories_parent_idx on public.document_categories(parent_id);

alter table public.letters
  add column if not exists direction text not null default 'outgoing'
  check (direction in ('incoming','outgoing'));
create index if not exists letters_direction_date_idx
  on public.letters(direction,letter_date desc,letter_number desc);
alter table public.letters drop constraint if exists letters_letter_number_key;
alter table public.letters add constraint letters_direction_number_key unique(direction,letter_number);
