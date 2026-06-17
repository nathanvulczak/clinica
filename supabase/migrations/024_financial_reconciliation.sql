-- CliniCore - Conciliação bancária profissional.
-- Execute depois de 023_financial_module.sql.

create table if not exists public.financial_reconciliations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  account_id uuid not null references public.financial_accounts(id),
  status text not null default 'closed' check (status in ('closed', 'reversed')),
  period_start date not null,
  period_end date not null,
  opening_balance_cents integer not null default 0,
  total_in_cents integer not null default 0,
  total_out_cents integer not null default 0,
  expected_balance_cents integer not null default 0,
  bank_balance_cents integer not null default 0,
  difference_cents integer not null default 0,
  closed_at timestamptz not null default now(),
  closed_by uuid references public.profiles(id),
  reversed_at timestamptz,
  reversed_by uuid references public.profiles(id),
  reversal_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  constraint financial_reconciliations_valid_period check (period_end >= period_start)
);

alter table public.financial_payments
  add column if not exists reconciliation_id uuid references public.financial_reconciliations(id),
  add column if not exists reconciled_by uuid references public.profiles(id);

create index if not exists idx_financial_reconciliations_clinic_account
  on public.financial_reconciliations(clinic_id, account_id, period_end desc)
  where deleted_at is null;

create index if not exists idx_financial_payments_reconciliation
  on public.financial_payments(reconciliation_id)
  where deleted_at is null;

drop trigger if exists set_financial_reconciliations_updated_at on public.financial_reconciliations;
create trigger set_financial_reconciliations_updated_at
before update on public.financial_reconciliations
for each row execute function public.set_updated_at();

alter table public.financial_reconciliations enable row level security;

drop policy if exists "financial_reconciliations_select_authorized" on public.financial_reconciliations;
create policy "financial_reconciliations_select_authorized"
on public.financial_reconciliations
for select to authenticated
using (
  deleted_at is null
  and public.user_has_permission(clinic_id, 'financial', 'view')
);

drop policy if exists "financial_reconciliations_insert_authorized" on public.financial_reconciliations;
create policy "financial_reconciliations_insert_authorized"
on public.financial_reconciliations
for insert to authenticated
with check (
  public.user_has_permission(clinic_id, 'financial', 'manage')
);

drop policy if exists "financial_reconciliations_update_authorized" on public.financial_reconciliations;
create policy "financial_reconciliations_update_authorized"
on public.financial_reconciliations
for update to authenticated
using (
  deleted_at is null
  and (
    public.user_has_permission(clinic_id, 'financial', 'manage')
    or public.user_has_permission(clinic_id, 'financial', 'approve')
  )
)
with check (
  public.user_has_permission(clinic_id, 'financial', 'manage')
  or public.user_has_permission(clinic_id, 'financial', 'approve')
);

create or replace function public.prevent_closed_financial_payment_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.reconciliation_id is not null and exists (
    select 1
    from public.financial_reconciliations fr
    where fr.id = old.reconciliation_id
      and fr.status = 'closed'
      and fr.deleted_at is null
  ) then
    raise exception 'FINANCIAL_RECONCILIATION_LOCKED';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists block_closed_financial_payment_mutation on public.financial_payments;
create trigger block_closed_financial_payment_mutation
before update or delete on public.financial_payments
for each row execute function public.prevent_closed_financial_payment_mutation();

create or replace function public.prevent_closed_financial_entry_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.financial_payments fp
    join public.financial_reconciliations fr on fr.id = fp.reconciliation_id
    where fp.entry_id = old.id
      and fp.deleted_at is null
      and fr.status = 'closed'
      and fr.deleted_at is null
  ) then
    raise exception 'FINANCIAL_RECONCILIATION_LOCKED';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists block_closed_financial_entry_mutation on public.financial_entries;
create trigger block_closed_financial_entry_mutation
before update or delete on public.financial_entries
for each row execute function public.prevent_closed_financial_entry_mutation();

insert into public.role_permissions (clinic_id, role, module, action, allowed, created_by, updated_by)
select c.id, role_value::public.app_role, 'financial'::public.permission_module, 'approve'::public.permission_action, true, c.created_by, c.updated_by
from public.clinics c
cross join (values ('clinic_admin'), ('financial')) as roles(role_value)
where c.deleted_at is null
on conflict (clinic_id, role, module, action)
do update set allowed = excluded.allowed, updated_at = now(), updated_by = excluded.updated_by;

grant select, insert, update on public.financial_reconciliations to authenticated;
