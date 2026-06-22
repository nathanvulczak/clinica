-- CliniCore - Comissoes completas, conciliacao individual e importacao bancaria.
-- Execute depois de 026_financial_payables_documents.sql.

alter table public.financial_commissions
  add column if not exists rule_id uuid references public.financial_commission_rules(id),
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references public.profiles(id),
  add column if not exists settlement_entry_id uuid references public.financial_entries(id),
  add column if not exists settled_by uuid references public.profiles(id),
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.profiles(id),
  add column if not exists cancellation_reason text;

create unique index if not exists uq_financial_commission_payment
  on public.financial_commissions(clinic_id, professional_member_id, payment_id)
  where payment_id is not null and deleted_at is null;

create unique index if not exists uq_financial_commission_billed_entry
  on public.financial_commissions(clinic_id, professional_member_id, entry_id)
  where payment_id is null and deleted_at is null;

create index if not exists idx_financial_commissions_clinic_status
  on public.financial_commissions(clinic_id, status, created_at desc)
  where deleted_at is null;

create table if not exists public.financial_bank_imports (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  account_id uuid not null references public.financial_accounts(id),
  file_name text not null,
  file_type text not null check (file_type in ('ofx', 'csv')),
  status text not null default 'ready' check (status in ('processing', 'ready', 'completed', 'cancelled', 'failed')),
  period_start date,
  period_end date,
  total_rows integer not null default 0 check (total_rows >= 0),
  matched_rows integer not null default 0 check (matched_rows >= 0),
  completed_at timestamptz,
  completed_by uuid references public.profiles(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);

create table if not exists public.financial_bank_import_items (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  import_id uuid not null references public.financial_bank_imports(id) on delete cascade,
  transaction_date date not null,
  description text not null,
  document_number text,
  direction text not null check (direction in ('in', 'out')),
  amount_cents integer not null check (amount_cents > 0),
  external_id text,
  status text not null default 'pending' check (status in ('pending', 'matched', 'ignored', 'reconciled')),
  matched_payment_id uuid references public.financial_payments(id),
  match_confidence integer check (match_confidence between 0 and 100),
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);

create unique index if not exists uq_financial_bank_import_item_external
  on public.financial_bank_import_items(import_id, external_id)
  where external_id is not null and deleted_at is null;

create index if not exists idx_financial_bank_imports_clinic
  on public.financial_bank_imports(clinic_id, account_id, created_at desc)
  where deleted_at is null;

create index if not exists idx_financial_bank_import_items_import
  on public.financial_bank_import_items(import_id, status, transaction_date)
  where deleted_at is null;

drop trigger if exists set_financial_bank_imports_updated_at on public.financial_bank_imports;
create trigger set_financial_bank_imports_updated_at
before update on public.financial_bank_imports
for each row execute function public.set_updated_at();

drop trigger if exists set_financial_bank_import_items_updated_at on public.financial_bank_import_items;
create trigger set_financial_bank_import_items_updated_at
before update on public.financial_bank_import_items
for each row execute function public.set_updated_at();

alter table public.financial_bank_imports enable row level security;
alter table public.financial_bank_import_items enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['financial_bank_imports', 'financial_bank_import_items']
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

grant select, insert, update on public.financial_bank_imports to authenticated;
grant select, insert, update on public.financial_bank_import_items to authenticated;
