-- CliniCore - Acertos de comissao e identidade documental da clinica.
-- Execute depois de 028_financial_monthly_close_realtime.sql.

create table if not exists public.financial_commission_settlements (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  professional_member_id uuid not null references public.clinic_members(id),
  period_start date not null,
  period_end date not null,
  competence_date date not null,
  due_date date not null,
  status text not null default 'scheduled'
    check (status in ('draft', 'approved', 'scheduled', 'paid', 'reversed', 'cancelled')),
  commission_count integer not null default 0 check (commission_count >= 0),
  base_amount_cents integer not null default 0 check (base_amount_cents >= 0),
  amount_cents integer not null default 0 check (amount_cents >= 0),
  payable_entry_id uuid references public.financial_entries(id),
  approved_at timestamptz,
  approved_by uuid references public.profiles(id),
  scheduled_at timestamptz,
  scheduled_by uuid references public.profiles(id),
  paid_at timestamptz,
  paid_by uuid references public.profiles(id),
  reversed_at timestamptz,
  reversed_by uuid references public.profiles(id),
  reversal_reason text,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id),
  cancellation_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  check (period_end >= period_start)
);

alter table public.financial_commissions
  add column if not exists settlement_id uuid references public.financial_commission_settlements(id);

create unique index if not exists uq_financial_commission_settlements_payable
  on public.financial_commission_settlements(payable_entry_id)
  where payable_entry_id is not null and deleted_at is null;

create index if not exists idx_financial_commission_settlements_clinic
  on public.financial_commission_settlements(clinic_id, status, due_date desc)
  where deleted_at is null;

create index if not exists idx_financial_commissions_settlement
  on public.financial_commissions(settlement_id)
  where settlement_id is not null and deleted_at is null;

drop trigger if exists set_financial_commission_settlements_updated_at on public.financial_commission_settlements;
create trigger set_financial_commission_settlements_updated_at
before update on public.financial_commission_settlements
for each row execute function public.set_updated_at();

alter table public.financial_commission_settlements enable row level security;

drop policy if exists "financial_commission_settlements_select_authorized" on public.financial_commission_settlements;
create policy "financial_commission_settlements_select_authorized"
on public.financial_commission_settlements for select to authenticated
using (deleted_at is null and public.user_has_permission(clinic_id, 'financial', 'view'));

drop policy if exists "financial_commission_settlements_insert_authorized" on public.financial_commission_settlements;
create policy "financial_commission_settlements_insert_authorized"
on public.financial_commission_settlements for insert to authenticated
with check (public.user_has_permission(clinic_id, 'financial', 'approve') or public.user_has_permission(clinic_id, 'financial', 'manage'));

drop policy if exists "financial_commission_settlements_update_authorized" on public.financial_commission_settlements;
create policy "financial_commission_settlements_update_authorized"
on public.financial_commission_settlements for update to authenticated
using (deleted_at is null and public.user_has_permission(clinic_id, 'financial', 'manage'))
with check (public.user_has_permission(clinic_id, 'financial', 'manage'));

grant select, insert, update on public.financial_commission_settlements to authenticated;

create or replace function public.create_financial_commission_settlement(
  clinic_uuid uuid,
  professional_uuid uuid,
  period_start_value date,
  period_end_value date,
  competence_value date,
  due_value date,
  notes_value text,
  actor_uuid uuid
)
returns table (
  settlement_id uuid,
  payable_entry_id uuid,
  commission_count integer,
  amount_cents integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  settlement_uuid uuid;
  entry_uuid uuid;
  professional_name text;
  category_uuid uuid;
  commission_total integer;
  base_total integer;
  item_count integer;
begin
  if period_end_value < period_start_value then
    raise exception 'invalid_commission_period';
  end if;

  select p.full_name into professional_name
  from public.clinic_members cm
  join public.profiles p on p.id = cm.user_id
  where cm.id = professional_uuid
    and cm.clinic_id = clinic_uuid
    and cm.status = 'active'
    and cm.deleted_at is null;

  if professional_name is null then
    raise exception 'commission_professional_not_found';
  end if;

  select count(*)::integer, coalesce(sum(fc.base_amount_cents), 0)::integer,
         coalesce(sum(fc.commission_cents), 0)::integer
  into item_count, base_total, commission_total
  from public.financial_commissions fc
  where fc.clinic_id = clinic_uuid
    and fc.professional_member_id = professional_uuid
    and fc.status = 'approved'
    and fc.settlement_id is null
    and fc.deleted_at is null
    and fc.created_at >= period_start_value::timestamptz
    and fc.created_at < (period_end_value + 1)::timestamptz;

  if item_count = 0 or commission_total <= 0 then
    raise exception 'commission_items_not_found';
  end if;

  select id into category_uuid
  from public.financial_categories
  where clinic_id = clinic_uuid
    and direction = 'expense'
    and deleted_at is null
    and lower(name) like 'comiss%'
  order by created_at
  limit 1;

  insert into public.financial_commission_settlements (
    clinic_id, professional_member_id, period_start, period_end, competence_date,
    due_date, status, commission_count, base_amount_cents, amount_cents,
    approved_at, approved_by, scheduled_at, scheduled_by, notes, created_by, updated_by
  ) values (
    clinic_uuid, professional_uuid, period_start_value, period_end_value, competence_value,
    due_value, 'scheduled', item_count, base_total, commission_total,
    now(), actor_uuid, now(), actor_uuid, notes_value, actor_uuid, actor_uuid
  ) returning id into settlement_uuid;

  insert into public.financial_entries (
    clinic_id, entry_type, origin, status, professional_member_id, category_id,
    description, document_type, issue_date, due_date, competence_date,
    amount_cents, discount_cents, freight_cents, addition_cents, paid_cents,
    notes, created_by, updated_by
  ) values (
    clinic_uuid, 'payable', 'commission', 'pending', professional_uuid, category_uuid,
    format('Acerto de comissoes - %s (%s a %s)', professional_name,
      to_char(period_start_value, 'DD/MM/YYYY'), to_char(period_end_value, 'DD/MM/YYYY')),
    'receipt', current_date, due_value, competence_value,
    commission_total, 0, 0, 0, 0,
    notes_value, actor_uuid, actor_uuid
  ) returning id into entry_uuid;

  update public.financial_commission_settlements
  set payable_entry_id = entry_uuid, updated_by = actor_uuid
  where id = settlement_uuid;

  update public.financial_commissions fc
  set settlement_id = settlement_uuid,
      settlement_entry_id = entry_uuid,
      updated_by = actor_uuid
  where fc.clinic_id = clinic_uuid
    and fc.professional_member_id = professional_uuid
    and fc.status = 'approved'
    and fc.settlement_id is null
    and fc.deleted_at is null
    and fc.created_at >= period_start_value::timestamptz
    and fc.created_at < (period_end_value + 1)::timestamptz;

  return query select settlement_uuid, entry_uuid, item_count, commission_total;
end;
$$;

revoke all on function public.create_financial_commission_settlement(uuid, uuid, date, date, date, date, text, uuid) from public, anon, authenticated;
grant execute on function public.create_financial_commission_settlement(uuid, uuid, date, date, date, date, text, uuid) to service_role;

create or replace function public.sync_financial_commission_settlement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  settlement_uuid uuid;
begin
  select id into settlement_uuid
  from public.financial_commission_settlements
  where payable_entry_id = new.id
    and deleted_at is null
  limit 1;

  if settlement_uuid is null then
    return new;
  end if;

  if new.status = 'paid' then
    update public.financial_commission_settlements
    set status = 'paid', paid_at = coalesce(paid_at, now()), updated_at = now()
    where id = settlement_uuid;

    update public.financial_commissions
    set status = 'paid', paid_at = coalesce(paid_at, now()), settlement_entry_id = new.id, updated_at = now()
    where settlement_id = settlement_uuid and deleted_at is null and status <> 'cancelled';
  elsif old.status = 'paid' and new.status in ('pending', 'partial') then
    update public.financial_commission_settlements
    set status = 'reversed', reversed_at = now(), paid_at = null, updated_at = now()
    where id = settlement_uuid;

    update public.financial_commissions
    set status = 'approved', paid_at = null, settled_by = null, updated_at = now()
    where settlement_id = settlement_uuid and deleted_at is null and status = 'paid';
  end if;

  return new;
end;
$$;

drop trigger if exists sync_financial_commission_settlement_from_entry on public.financial_entries;
create trigger sync_financial_commission_settlement_from_entry
after update of status, paid_cents on public.financial_entries
for each row
when (old.status is distinct from new.status or old.paid_cents is distinct from new.paid_cents)
execute function public.sync_financial_commission_settlement();

create table if not exists public.clinic_branding_settings (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null unique references public.clinics(id) on delete cascade,
  primary_color text not null default '#0f766e'
    check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  document_header text,
  document_footer text,
  horizontal_logo_path text,
  compact_logo_path text,
  vertical_logo_path text,
  show_legal_name boolean not null default true,
  show_document boolean not null default true,
  show_contact boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);

drop trigger if exists set_clinic_branding_settings_updated_at on public.clinic_branding_settings;
create trigger set_clinic_branding_settings_updated_at
before update on public.clinic_branding_settings
for each row execute function public.set_updated_at();

alter table public.clinic_branding_settings enable row level security;

drop policy if exists "clinic_branding_settings_select_authorized" on public.clinic_branding_settings;
create policy "clinic_branding_settings_select_authorized"
on public.clinic_branding_settings for select to authenticated
using (deleted_at is null and public.user_has_permission(clinic_id, 'clinics', 'view'));

drop policy if exists "clinic_branding_settings_insert_authorized" on public.clinic_branding_settings;
create policy "clinic_branding_settings_insert_authorized"
on public.clinic_branding_settings for insert to authenticated
with check (public.user_has_permission(clinic_id, 'clinics', 'edit'));

drop policy if exists "clinic_branding_settings_update_authorized" on public.clinic_branding_settings;
create policy "clinic_branding_settings_update_authorized"
on public.clinic_branding_settings for update to authenticated
using (deleted_at is null and public.user_has_permission(clinic_id, 'clinics', 'edit'))
with check (public.user_has_permission(clinic_id, 'clinics', 'edit'));

grant select, insert, update on public.clinic_branding_settings to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'clinic-branding',
  'clinic-branding',
  false,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = 2097152,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "clinic_branding_read_authorized" on storage.objects;
create policy "clinic_branding_read_authorized"
on storage.objects for select to authenticated
using (
  bucket_id = 'clinic-branding'
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and public.user_has_permission(((storage.foldername(name))[1])::uuid, 'clinics', 'view')
);

drop policy if exists "clinic_branding_insert_authorized" on storage.objects;
create policy "clinic_branding_insert_authorized"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'clinic-branding'
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and public.user_has_permission(((storage.foldername(name))[1])::uuid, 'clinics', 'edit')
);

drop policy if exists "clinic_branding_update_authorized" on storage.objects;
create policy "clinic_branding_update_authorized"
on storage.objects for update to authenticated
using (
  bucket_id = 'clinic-branding'
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and public.user_has_permission(((storage.foldername(name))[1])::uuid, 'clinics', 'edit')
)
with check (
  bucket_id = 'clinic-branding'
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and public.user_has_permission(((storage.foldername(name))[1])::uuid, 'clinics', 'edit')
);

drop policy if exists "clinic_branding_delete_authorized" on storage.objects;
create policy "clinic_branding_delete_authorized"
on storage.objects for delete to authenticated
using (
  bucket_id = 'clinic-branding'
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and public.user_has_permission(((storage.foldername(name))[1])::uuid, 'clinics', 'edit')
);

do $$
declare
  tracked_table text;
begin
  foreach tracked_table in array array[
    'financial_commission_settlements',
    'clinic_branding_settings'
  ]
  loop
    execute format('drop trigger if exists audit_%I_changes on public.%I', tracked_table, tracked_table);
    execute format(
      'create trigger audit_%I_changes after insert or update or delete on public.%I for each row execute function public.audit_table_changes()',
      tracked_table,
      tracked_table
    );
  end loop;
end $$;
