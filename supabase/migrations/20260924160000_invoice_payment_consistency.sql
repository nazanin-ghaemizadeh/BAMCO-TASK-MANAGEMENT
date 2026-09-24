/* Keep invoice totals and staged payments consistent for every client. */

create or replace function private.validate_invoice_payment()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  total_value numeric(18,2);
  paid_before numeric(18,2);
begin
  -- Lock the parent invoice so two simultaneous paid stages cannot both pass
  -- the remaining-balance check.
  select i.total_amount into total_value
  from public.invoices i
  where i.id = new.invoice_id
  for update;

  if not found then
    raise exception 'صورتحساب مربوط به مرحله پرداخت یافت نشد.';
  end if;

  select coalesce(sum(p.amount), 0) into paid_before
  from public.invoice_payments p
  where p.invoice_id = new.invoice_id
    and p.status = 'paid'
    and (tg_op = 'INSERT' or p.id <> new.id);

  if new.status = 'paid' and paid_before + new.amount > total_value then
    raise exception 'مبلغ پرداخت‌شده نمی‌تواند از مبلغ کل صورتحساب بیشتر باشد.';
  end if;

  new.percent_of_total := case when total_value > 0 then new.amount / total_value * 100 else null end;
  if new.status = 'paid' and new.paid_date is null then
    new.paid_date := current_date;
  elsif new.status <> 'paid' then
    new.paid_date := null;
  end if;
  return new;
end;
$$;

drop trigger if exists invoice_payments_validate_amount on public.invoice_payments;
create trigger invoice_payments_validate_amount
before insert or update on public.invoice_payments
for each row execute function private.validate_invoice_payment();

create or replace function private.validate_invoice_total()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  paid_value numeric(18,2);
begin
  select coalesce(sum(p.amount) filter (where p.status = 'paid'), 0) into paid_value
  from public.invoice_payments p
  where p.invoice_id = new.id;

  if new.total_amount < paid_value then
    raise exception 'مبلغ کل نمی‌تواند از پرداخت‌شده کمتر باشد.';
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_validate_total on public.invoices;
create trigger invoices_validate_total
before update of total_amount on public.invoices
for each row execute function private.validate_invoice_total();
