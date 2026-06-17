-- CliniCore - Modulo financeiro enterprise.
-- Execute depois de 022_medical_records_polish.sql.

create table if not exists public.financial_preferences (
  clinic_id uuid primary key references public.clinics(id) on delete cascade,
  allow_reception_checkout boolean not null default true,
  allow_professional_checkout boolean not null default false,
  require_payment_method_on_checkout boolean not null default true,
  default_receivable_due_days integer not null default 0 check (default_receivable_due_days between 0 and 365),
  default_late_fee_cents integer not null default 0 check (default_late_fee_cents >= 0),
  default_monthly_interest_bps integer not null default 0 check (default_monthly_interest_bps >= 0),
  receipt_footer text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);

create table if not exists public.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null,
  account_type text not null check (account_type in ('cash', 'checking', 'savings', 'digital_wallet', 'card_processor')),
  bank_name text,
  agency text,
  account_number text,
  pix_key text,
  opening_balance_cents integer not null default 0,
  current_balance_cents integer not null default 0,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);

create table if not exists public.financial_payment_methods (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null,
  method_type text not null check (method_type in ('cash', 'pix', 'debit_card', 'credit_card', 'bank_transfer', 'boleto', 'health_plan', 'other')),
  requires_card_machine boolean not null default false,
  settlement_days integer not null default 0 check (settlement_days between 0 and 365),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);

create table if not exists public.financial_card_machines (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  account_id uuid references public.financial_accounts(id),
  name text not null,
  provider text,
  debit_fee_bps integer not null default 0 check (debit_fee_bps >= 0),
  credit_fee_bps integer not null default 0 check (credit_fee_bps >= 0),
  credit_installment_fee_bps integer not null default 0 check (credit_installment_fee_bps >= 0),
  debit_settlement_days integer not null default 1 check (debit_settlement_days between 0 and 365),
  credit_settlement_days integer not null default 30 check (credit_settlement_days between 0 and 365),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);

create table if not exists public.financial_categories (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null,
  direction text not null check (direction in ('income', 'expense')),
  parent_id uuid references public.financial_categories(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);

create table if not exists public.financial_vendors (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null,
  document text,
  email text,
  phone text,
  vendor_type text not null default 'supplier' check (vendor_type in ('supplier', 'laboratory', 'professional', 'tax', 'other')),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);

create table if not exists public.financial_entries (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  entry_type text not null check (entry_type in ('receivable', 'payable')),
  origin text not null default 'manual' check (origin in ('appointment', 'manual', 'subscription', 'commission', 'adjustment')),
  status text not null default 'pending' check (status in ('pending', 'partial', 'paid', 'overdue', 'cancelled', 'refunded')),
  patient_id uuid references public.patients(id),
  vendor_id uuid references public.financial_vendors(id),
  appointment_id uuid references public.appointments(id),
  encounter_id uuid references public.clinical_encounters(id),
  medical_record_id uuid references public.medical_records(id),
  professional_member_id uuid references public.clinic_members(id),
  category_id uuid references public.financial_categories(id),
  description text not null,
  document_number text,
  issue_date date not null default current_date,
  due_date date not null default current_date,
  competence_date date not null default current_date,
  amount_cents integer not null check (amount_cents >= 0),
  discount_cents integer not null default 0 check (discount_cents >= 0),
  addition_cents integer not null default 0 check (addition_cents >= 0),
  paid_cents integer not null default 0 check (paid_cents >= 0),
  notes text,
  cancelled_reason text,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);

create table if not exists public.financial_payments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  entry_id uuid not null references public.financial_entries(id) on delete cascade,
  account_id uuid references public.financial_accounts(id),
  payment_method_id uuid references public.financial_payment_methods(id),
  card_machine_id uuid references public.financial_card_machines(id),
  direction text not null check (direction in ('in', 'out')),
  status text not null default 'confirmed' check (status in ('confirmed', 'reversed')),
  amount_cents integer not null check (amount_cents > 0),
  fee_cents integer not null default 0 check (fee_cents >= 0),
  net_amount_cents integer not null check (net_amount_cents >= 0),
  paid_at timestamptz not null default now(),
  expected_settlement_date date,
  reconciled_at timestamptz,
  notes text,
  reversal_reason text,
  reversed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);

create table if not exists public.financial_commission_rules (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  professional_member_id uuid references public.clinic_members(id),
  service_id uuid references public.clinic_services(id),
  rule_type text not null check (rule_type in ('percent', 'fixed')),
  value_bps integer not null default 0 check (value_bps >= 0),
  value_cents integer not null default 0 check (value_cents >= 0),
  calculate_on text not null default 'received' check (calculate_on in ('billed', 'received')),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);

create table if not exists public.financial_commissions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  professional_member_id uuid not null references public.clinic_members(id),
  entry_id uuid references public.financial_entries(id),
  payment_id uuid references public.financial_payments(id),
  status text not null default 'pending' check (status in ('pending', 'approved', 'paid', 'cancelled')),
  base_amount_cents integer not null default 0,
  commission_cents integer not null default 0,
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);

create table if not exists public.financial_receipts (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  entry_id uuid not null references public.financial_entries(id),
  patient_id uuid references public.patients(id),
  receipt_type text not null check (receipt_type in ('payment', 'payment_acknowledgement')),
  title text not null,
  content text not null,
  issued_at timestamptz not null default now(),
  printed_at timestamptz,
  exported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);

create index if not exists idx_financial_accounts_clinic on public.financial_accounts(clinic_id, active) where deleted_at is null;
create index if not exists idx_financial_entries_clinic_status on public.financial_entries(clinic_id, entry_type, status, due_date) where deleted_at is null;
create index if not exists idx_financial_entries_patient on public.financial_entries(clinic_id, patient_id, created_at desc) where deleted_at is null;
create index if not exists idx_financial_entries_encounter on public.financial_entries(clinic_id, encounter_id) where deleted_at is null;
create index if not exists idx_financial_payments_entry on public.financial_payments(entry_id, paid_at desc) where deleted_at is null;
create index if not exists idx_financial_receipts_entry on public.financial_receipts(entry_id, issued_at desc) where deleted_at is null;

drop trigger if exists set_financial_preferences_updated_at on public.financial_preferences;
create trigger set_financial_preferences_updated_at before update on public.financial_preferences for each row execute function public.set_updated_at();
drop trigger if exists set_financial_accounts_updated_at on public.financial_accounts;
create trigger set_financial_accounts_updated_at before update on public.financial_accounts for each row execute function public.set_updated_at();
drop trigger if exists set_financial_payment_methods_updated_at on public.financial_payment_methods;
create trigger set_financial_payment_methods_updated_at before update on public.financial_payment_methods for each row execute function public.set_updated_at();
drop trigger if exists set_financial_card_machines_updated_at on public.financial_card_machines;
create trigger set_financial_card_machines_updated_at before update on public.financial_card_machines for each row execute function public.set_updated_at();
drop trigger if exists set_financial_categories_updated_at on public.financial_categories;
create trigger set_financial_categories_updated_at before update on public.financial_categories for each row execute function public.set_updated_at();
drop trigger if exists set_financial_vendors_updated_at on public.financial_vendors;
create trigger set_financial_vendors_updated_at before update on public.financial_vendors for each row execute function public.set_updated_at();
drop trigger if exists set_financial_entries_updated_at on public.financial_entries;
create trigger set_financial_entries_updated_at before update on public.financial_entries for each row execute function public.set_updated_at();
drop trigger if exists set_financial_payments_updated_at on public.financial_payments;
create trigger set_financial_payments_updated_at before update on public.financial_payments for each row execute function public.set_updated_at();
drop trigger if exists set_financial_commission_rules_updated_at on public.financial_commission_rules;
create trigger set_financial_commission_rules_updated_at before update on public.financial_commission_rules for each row execute function public.set_updated_at();
drop trigger if exists set_financial_commissions_updated_at on public.financial_commissions;
create trigger set_financial_commissions_updated_at before update on public.financial_commissions for each row execute function public.set_updated_at();
drop trigger if exists set_financial_receipts_updated_at on public.financial_receipts;
create trigger set_financial_receipts_updated_at before update on public.financial_receipts for each row execute function public.set_updated_at();

alter table public.financial_preferences enable row level security;
alter table public.financial_accounts enable row level security;
alter table public.financial_payment_methods enable row level security;
alter table public.financial_card_machines enable row level security;
alter table public.financial_categories enable row level security;
alter table public.financial_vendors enable row level security;
alter table public.financial_entries enable row level security;
alter table public.financial_payments enable row level security;
alter table public.financial_commission_rules enable row level security;
alter table public.financial_commissions enable row level security;
alter table public.financial_receipts enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'financial_preferences',
    'financial_accounts',
    'financial_payment_methods',
    'financial_card_machines',
    'financial_categories',
    'financial_vendors',
    'financial_entries',
    'financial_payments',
    'financial_commission_rules',
    'financial_commissions',
    'financial_receipts'
  ]
  loop
    execute format('drop policy if exists "%1$s_select_authorized" on public.%1$I', table_name);
    execute format(
      'create policy "%1$s_select_authorized" on public.%1$I for select to authenticated using (deleted_at is null and public.user_has_permission(clinic_id, ''financial'', ''view''))',
      table_name
    );

    execute format('drop policy if exists "%1$s_insert_authorized" on public.%1$I', table_name);
    execute format(
      'create policy "%1$s_insert_authorized" on public.%1$I for insert to authenticated with check (public.user_has_permission(clinic_id, ''financial'', ''create'') or public.user_has_permission(clinic_id, ''schedule'', ''manage''))',
      table_name
    );

    execute format('drop policy if exists "%1$s_update_authorized" on public.%1$I', table_name);
    execute format(
      'create policy "%1$s_update_authorized" on public.%1$I for update to authenticated using (deleted_at is null and (public.user_has_permission(clinic_id, ''financial'', ''edit'') or public.user_has_permission(clinic_id, ''financial'', ''manage''))) with check (public.user_has_permission(clinic_id, ''financial'', ''edit'') or public.user_has_permission(clinic_id, ''financial'', ''manage''))',
      table_name
    );
  end loop;
end $$;

insert into public.role_permissions (clinic_id, role, module, action, allowed, created_by, updated_by)
select c.id, role_value::public.app_role, 'financial'::public.permission_module, action_value::public.permission_action, true, c.created_by, c.updated_by
from public.clinics c
cross join (values ('clinic_admin'), ('financial')) as roles(role_value)
cross join (values ('view'), ('create'), ('edit'), ('manage'), ('export')) as actions(action_value)
where c.deleted_at is null
on conflict (clinic_id, role, module, action)
do update set allowed = excluded.allowed, updated_at = now(), updated_by = excluded.updated_by;

insert into public.role_permissions (clinic_id, role, module, action, allowed, created_by, updated_by)
select c.id, 'receptionist'::public.app_role, 'financial'::public.permission_module, 'create'::public.permission_action, true, c.created_by, c.updated_by
from public.clinics c
where c.deleted_at is null
on conflict (clinic_id, role, module, action)
do update set allowed = excluded.allowed, updated_at = now(), updated_by = excluded.updated_by;

insert into public.financial_preferences (clinic_id, created_by, updated_by)
select c.id, c.created_by, c.updated_by
from public.clinics c
where c.deleted_at is null
on conflict (clinic_id) do nothing;

insert into public.financial_accounts (clinic_id, name, account_type, active, created_by, updated_by)
select c.id, 'Caixa principal', 'cash', true, c.created_by, c.updated_by
from public.clinics c
where c.deleted_at is null
  and not exists (
    select 1 from public.financial_accounts fa
    where fa.clinic_id = c.id and fa.deleted_at is null
  );

insert into public.financial_payment_methods (clinic_id, name, method_type, requires_card_machine, settlement_days, created_by, updated_by)
select c.id, method_name, method_type, requires_machine, settlement_days, c.created_by, c.updated_by
from public.clinics c
cross join (values
  ('Dinheiro', 'cash', false, 0),
  ('Pix', 'pix', false, 0),
  ('Cartao de debito', 'debit_card', true, 1),
  ('Cartao de credito', 'credit_card', true, 30),
  ('Transferencia bancaria', 'bank_transfer', false, 0),
  ('Boleto', 'boleto', false, 3),
  ('Convenio', 'health_plan', false, 30)
) as methods(method_name, method_type, requires_machine, settlement_days)
where c.deleted_at is null
  and not exists (
    select 1 from public.financial_payment_methods fpm
    where fpm.clinic_id = c.id
      and fpm.method_type = methods.method_type
      and fpm.deleted_at is null
  );

insert into public.financial_categories (clinic_id, name, direction, created_by, updated_by)
select c.id, category_name, direction, c.created_by, c.updated_by
from public.clinics c
cross join (values
  ('Consultas e procedimentos', 'income'),
  ('Materiais e insumos', 'expense'),
  ('Fornecedores', 'expense'),
  ('Comissoes profissionais', 'expense'),
  ('Taxas de cartao', 'expense'),
  ('Ajustes financeiros', 'income')
) as categories(category_name, direction)
where c.deleted_at is null
  and not exists (
    select 1 from public.financial_categories fc
    where fc.clinic_id = c.id
      and fc.name = categories.category_name
      and fc.deleted_at is null
  );

grant select, insert, update on
  public.financial_preferences,
  public.financial_accounts,
  public.financial_payment_methods,
  public.financial_card_machines,
  public.financial_categories,
  public.financial_vendors,
  public.financial_entries,
  public.financial_payments,
  public.financial_commission_rules,
  public.financial_commissions,
  public.financial_receipts
to authenticated;
