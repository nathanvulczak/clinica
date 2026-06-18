-- CliniCore - Base financeira enterprise: historico por lancamento, centros de custo,
-- convenios e livro-caixa imutavel.
-- Execute depois de 024_financial_reconciliation.sql.

create table if not exists public.financial_cost_centers (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null,
  code text,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  constraint financial_cost_centers_name_check check (char_length(trim(name)) >= 2)
);

create table if not exists public.financial_health_plans (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null,
  document text,
  email text,
  phone text,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  constraint financial_health_plans_name_check check (char_length(trim(name)) >= 2)
);

alter table public.financial_entries
  add column if not exists cost_center_id uuid references public.financial_cost_centers(id),
  add column if not exists health_plan_id uuid references public.financial_health_plans(id),
  add column if not exists cancelled_by uuid references public.profiles(id);

create table if not exists public.financial_entry_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  entry_id uuid not null references public.financial_entries(id) on delete cascade,
  event_type text not null check (
    event_type in (
      'created',
      'updated',
      'settled',
      'payment_reversed',
      'cancelled',
      'receipt_issued',
      'reconciliation_closed',
      'reconciliation_reopened',
      'ledger_posted'
    )
  ),
  old_values jsonb,
  new_values jsonb,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create table if not exists public.financial_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  account_id uuid references public.financial_accounts(id),
  entry_id uuid references public.financial_entries(id),
  payment_id uuid references public.financial_payments(id),
  reconciliation_id uuid references public.financial_reconciliations(id),
  direction text not null check (direction in ('in', 'out')),
  amount_cents integer not null check (amount_cents >= 0),
  fee_cents integer not null default 0 check (fee_cents >= 0),
  net_amount_cents integer not null check (net_amount_cents >= 0),
  occurred_at timestamptz not null default now(),
  description text not null,
  source_type text not null check (source_type in ('payment', 'reversal', 'adjustment', 'reconciliation')),
  source_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create index if not exists idx_financial_cost_centers_clinic
  on public.financial_cost_centers(clinic_id, active, name)
  where deleted_at is null;

create index if not exists idx_financial_health_plans_clinic
  on public.financial_health_plans(clinic_id, active, name)
  where deleted_at is null;

create index if not exists idx_financial_entries_cost_center
  on public.financial_entries(clinic_id, cost_center_id)
  where deleted_at is null;

create index if not exists idx_financial_entries_health_plan
  on public.financial_entries(clinic_id, health_plan_id)
  where deleted_at is null;

create index if not exists idx_financial_entry_events_entry
  on public.financial_entry_events(entry_id, created_at desc);

create index if not exists idx_financial_ledger_entries_clinic_account
  on public.financial_ledger_entries(clinic_id, account_id, occurred_at desc);

create index if not exists idx_financial_ledger_entries_payment
  on public.financial_ledger_entries(payment_id);

drop trigger if exists set_financial_cost_centers_updated_at on public.financial_cost_centers;
create trigger set_financial_cost_centers_updated_at
before update on public.financial_cost_centers
for each row execute function public.set_updated_at();

drop trigger if exists set_financial_health_plans_updated_at on public.financial_health_plans;
create trigger set_financial_health_plans_updated_at
before update on public.financial_health_plans
for each row execute function public.set_updated_at();

create or replace function public.prevent_financial_ledger_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'FINANCIAL_LEDGER_IMMUTABLE';
end;
$$;

drop trigger if exists block_financial_ledger_mutation on public.financial_ledger_entries;
create trigger block_financial_ledger_mutation
before update or delete on public.financial_ledger_entries
for each row execute function public.prevent_financial_ledger_mutation();

alter table public.financial_cost_centers enable row level security;
alter table public.financial_health_plans enable row level security;
alter table public.financial_entry_events enable row level security;
alter table public.financial_ledger_entries enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'financial_cost_centers',
    'financial_health_plans'
  ]
  loop
    execute format('drop policy if exists "%1$s_select_authorized" on public.%1$I', table_name);
    execute format(
      'create policy "%1$s_select_authorized" on public.%1$I for select to authenticated using (deleted_at is null and public.user_has_permission(clinic_id, ''financial'', ''view''))',
      table_name
    );

    execute format('drop policy if exists "%1$s_insert_authorized" on public.%1$I', table_name);
    execute format(
      'create policy "%1$s_insert_authorized" on public.%1$I for insert to authenticated with check (public.user_has_permission(clinic_id, ''financial'', ''manage''))',
      table_name
    );

    execute format('drop policy if exists "%1$s_update_authorized" on public.%1$I', table_name);
    execute format(
      'create policy "%1$s_update_authorized" on public.%1$I for update to authenticated using (deleted_at is null and public.user_has_permission(clinic_id, ''financial'', ''manage'')) with check (public.user_has_permission(clinic_id, ''financial'', ''manage''))',
      table_name
    );
  end loop;
end $$;

drop policy if exists "financial_entry_events_select_authorized" on public.financial_entry_events;
create policy "financial_entry_events_select_authorized"
on public.financial_entry_events
for select to authenticated
using (public.user_has_permission(clinic_id, 'financial', 'view'));

drop policy if exists "financial_entry_events_insert_authorized" on public.financial_entry_events;
create policy "financial_entry_events_insert_authorized"
on public.financial_entry_events
for insert to authenticated
with check (
  public.user_has_permission(clinic_id, 'financial', 'create')
  or public.user_has_permission(clinic_id, 'financial', 'edit')
  or public.user_has_permission(clinic_id, 'financial', 'manage')
);

drop policy if exists "financial_ledger_entries_select_authorized" on public.financial_ledger_entries;
create policy "financial_ledger_entries_select_authorized"
on public.financial_ledger_entries
for select to authenticated
using (public.user_has_permission(clinic_id, 'financial', 'view'));

drop policy if exists "financial_ledger_entries_insert_authorized" on public.financial_ledger_entries;
create policy "financial_ledger_entries_insert_authorized"
on public.financial_ledger_entries
for insert to authenticated
with check (
  public.user_has_permission(clinic_id, 'financial', 'create')
  or public.user_has_permission(clinic_id, 'financial', 'edit')
  or public.user_has_permission(clinic_id, 'financial', 'manage')
);

insert into public.financial_cost_centers (clinic_id, name, code, created_by, updated_by)
select c.id, 'Operacional', 'OPER', c.created_by, c.updated_by
from public.clinics c
where c.deleted_at is null
  and not exists (
    select 1
    from public.financial_cost_centers fcc
    where fcc.clinic_id = c.id
      and fcc.deleted_at is null
  );

grant select, insert, update on public.financial_cost_centers to authenticated;
grant select, insert, update on public.financial_health_plans to authenticated;
grant select, insert on public.financial_entry_events to authenticated;
grant select, insert on public.financial_ledger_entries to authenticated;
