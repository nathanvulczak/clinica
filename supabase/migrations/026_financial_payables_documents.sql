-- CliniCore - Documentos a pagar, itens de nota e recorrencias financeiras.
-- Execute depois de 025_financial_enterprise_foundation.sql.

alter table public.financial_entries
  add column if not exists document_type text not null default 'other'
    check (document_type in ('nfe', 'nfse', 'receipt', 'contract', 'other')),
  add column if not exists freight_cents integer not null default 0 check (freight_cents >= 0);

create table if not exists public.financial_entry_items (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  entry_id uuid not null references public.financial_entries(id) on delete cascade,
  description text not null,
  quantity numeric(12, 3) not null default 1 check (quantity > 0),
  unit_amount_cents integer not null default 0 check (unit_amount_cents >= 0),
  total_amount_cents integer not null default 0 check (total_amount_cents >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  constraint financial_entry_items_description_check check (char_length(trim(description)) >= 2)
);

create table if not exists public.financial_recurring_entries (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  vendor_id uuid references public.financial_vendors(id),
  category_id uuid references public.financial_categories(id),
  cost_center_id uuid references public.financial_cost_centers(id),
  description text not null,
  amount_cents integer not null default 0 check (amount_cents >= 0),
  frequency text not null default 'monthly' check (frequency in ('weekly', 'monthly', 'quarterly', 'yearly')),
  next_due_date date not null default current_date,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);

create index if not exists idx_financial_entry_items_entry
  on public.financial_entry_items(entry_id, sort_order)
  where deleted_at is null;

create index if not exists idx_financial_entries_document_type
  on public.financial_entries(clinic_id, entry_type, document_type, due_date)
  where deleted_at is null;

create index if not exists idx_financial_recurring_entries_clinic
  on public.financial_recurring_entries(clinic_id, active, next_due_date)
  where deleted_at is null;

drop trigger if exists set_financial_entry_items_updated_at on public.financial_entry_items;
create trigger set_financial_entry_items_updated_at
before update on public.financial_entry_items
for each row execute function public.set_updated_at();

drop trigger if exists set_financial_recurring_entries_updated_at on public.financial_recurring_entries;
create trigger set_financial_recurring_entries_updated_at
before update on public.financial_recurring_entries
for each row execute function public.set_updated_at();

alter table public.financial_entry_items enable row level security;
alter table public.financial_recurring_entries enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'financial_entry_items',
    'financial_recurring_entries'
  ]
  loop
    execute format('drop policy if exists "%1$s_select_authorized" on public.%1$I', table_name);
    execute format(
      'create policy "%1$s_select_authorized" on public.%1$I for select to authenticated using (deleted_at is null and public.user_has_permission(clinic_id, ''financial'', ''view''))',
      table_name
    );

    execute format('drop policy if exists "%1$s_insert_authorized" on public.%1$I', table_name);
    execute format(
      'create policy "%1$s_insert_authorized" on public.%1$I for insert to authenticated with check (public.user_has_permission(clinic_id, ''financial'', ''create'') or public.user_has_permission(clinic_id, ''financial'', ''manage''))',
      table_name
    );

    execute format('drop policy if exists "%1$s_update_authorized" on public.%1$I', table_name);
    execute format(
      'create policy "%1$s_update_authorized" on public.%1$I for update to authenticated using (deleted_at is null and (public.user_has_permission(clinic_id, ''financial'', ''edit'') or public.user_has_permission(clinic_id, ''financial'', ''manage''))) with check (public.user_has_permission(clinic_id, ''financial'', ''edit'') or public.user_has_permission(clinic_id, ''financial'', ''manage''))',
      table_name
    );
  end loop;
end $$;

grant select, insert, update on public.financial_entry_items to authenticated;
grant select, insert, update on public.financial_recurring_entries to authenticated;
