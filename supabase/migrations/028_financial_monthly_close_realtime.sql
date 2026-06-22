-- CliniCore - Fechamento mensal, importacoes idempotentes e Realtime operacional.
-- Execute depois de 027_financial_commissions_bank_imports.sql.

alter table public.financial_bank_imports
  add column if not exists file_hash text,
  add column if not exists deleted_reason text,
  add column if not exists deleted_by uuid references public.profiles(id);

create unique index if not exists uq_financial_bank_import_file_hash
  on public.financial_bank_imports(clinic_id, account_id, file_hash)
  where file_hash is not null and deleted_at is null;

create table if not exists public.financial_monthly_closings (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  period_month date not null,
  status text not null default 'closed' check (status in ('closed', 'reopened')),
  receivable_cents integer not null default 0,
  revenue_cents integer not null default 0,
  payable_cents integer not null default 0,
  expense_cents integer not null default 0,
  result_cents integer not null default 0,
  open_receivable_cents integer not null default 0,
  open_payable_cents integer not null default 0,
  snapshot jsonb not null default '{}'::jsonb,
  notes text,
  closed_at timestamptz not null default now(),
  closed_by uuid references public.profiles(id),
  reopened_at timestamptz,
  reopened_by uuid references public.profiles(id),
  reopening_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  constraint financial_monthly_closings_period_check check (period_month = date_trunc('month', period_month)::date)
);

create unique index if not exists uq_financial_monthly_closing_period
  on public.financial_monthly_closings(clinic_id, period_month)
  where deleted_at is null;

create index if not exists idx_financial_monthly_closings_clinic
  on public.financial_monthly_closings(clinic_id, period_month desc)
  where deleted_at is null;

drop trigger if exists set_financial_monthly_closings_updated_at on public.financial_monthly_closings;
create trigger set_financial_monthly_closings_updated_at
before update on public.financial_monthly_closings
for each row execute function public.set_updated_at();

alter table public.financial_monthly_closings enable row level security;

drop policy if exists "financial_monthly_closings_select_authorized" on public.financial_monthly_closings;
create policy "financial_monthly_closings_select_authorized"
on public.financial_monthly_closings for select to authenticated
using (deleted_at is null and public.user_has_permission(clinic_id, 'financial', 'view'));

drop policy if exists "financial_monthly_closings_insert_authorized" on public.financial_monthly_closings;
create policy "financial_monthly_closings_insert_authorized"
on public.financial_monthly_closings for insert to authenticated
with check (public.user_has_permission(clinic_id, 'financial', 'manage'));

drop policy if exists "financial_monthly_closings_update_authorized" on public.financial_monthly_closings;
create policy "financial_monthly_closings_update_authorized"
on public.financial_monthly_closings for update to authenticated
using (deleted_at is null and public.user_has_permission(clinic_id, 'financial', 'approve'))
with check (public.user_has_permission(clinic_id, 'financial', 'approve'));

grant select, insert, update on public.financial_monthly_closings to authenticated;

create or replace function public.prevent_financial_closed_period_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  clinic_uuid uuid;
  movement_date date;
begin
  if tg_op = 'DELETE' then
    clinic_uuid := old.clinic_id;
  else
    clinic_uuid := new.clinic_id;
  end if;

  if tg_table_name = 'financial_entries' then
    movement_date := case when tg_op = 'DELETE' then old.competence_date else new.competence_date end;
  elsif tg_table_name = 'financial_payments' then
    movement_date := (case when tg_op = 'DELETE' then old.paid_at else new.paid_at end)::date;
  end if;

  if movement_date is not null and exists (
    select 1
    from public.financial_monthly_closings closing
    where closing.clinic_id = clinic_uuid
      and closing.period_month = date_trunc('month', movement_date)::date
      and closing.status = 'closed'
      and closing.deleted_at is null
  ) then
    raise exception 'FINANCIAL_PERIOD_CLOSED';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists block_closed_period_financial_entries on public.financial_entries;
create trigger block_closed_period_financial_entries
before insert or update or delete on public.financial_entries
for each row execute function public.prevent_financial_closed_period_mutation();

drop trigger if exists block_closed_period_financial_payments on public.financial_payments;
create trigger block_closed_period_financial_payments
before insert or update or delete on public.financial_payments
for each row execute function public.prevent_financial_closed_period_mutation();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'appointments',
    'clinical_encounters',
    'financial_entries',
    'financial_payments'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;
