-- CliniCore - solicitacoes diagnosticas imprimiveis e anexos externos.
-- Execute after 044_specialty_immersion_packs.sql.

alter table public.diagnostic_orders
  add column if not exists request_printed_at timestamptz,
  add column if not exists request_delivered_at timestamptz,
  add column if not exists request_delivered_by uuid references public.profiles(id);

create table if not exists public.diagnostic_attachments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  order_id uuid not null references public.diagnostic_orders(id) on delete cascade,
  order_item_id uuid references public.diagnostic_order_items(id) on delete set null,
  patient_id uuid not null references public.patients(id),
  encounter_id uuid references public.clinical_encounters(id) on delete set null,
  professional_member_id uuid not null references public.clinic_members(id),
  attachment_type text not null default 'external_report'
    check (attachment_type in ('external_report', 'laboratory_pdf', 'image', 'exam_file', 'other')),
  title text not null,
  notes text,
  file_name text not null,
  file_path text not null,
  mime_type text not null,
  file_size integer not null check (file_size > 0 and file_size <= 10485760),
  status text not null default 'active'
    check (status in ('active', 'deleted')),
  deleted_reason text,
  deleted_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);

create index if not exists idx_diagnostic_attachments_order
on public.diagnostic_attachments(order_id, created_at desc)
where deleted_at is null;

create index if not exists idx_diagnostic_attachments_patient
on public.diagnostic_attachments(clinic_id, patient_id, created_at desc)
where deleted_at is null;

drop trigger if exists set_diagnostic_attachments_updated_at on public.diagnostic_attachments;
create trigger set_diagnostic_attachments_updated_at
before update on public.diagnostic_attachments
for each row execute function public.set_updated_at();

alter table public.diagnostic_attachments enable row level security;

drop policy if exists "diagnostic_attachments_select_authorized" on public.diagnostic_attachments;
create policy "diagnostic_attachments_select_authorized"
on public.diagnostic_attachments
for select
to authenticated
using (
  deleted_at is null
  and public.user_has_permission(clinic_id, 'diagnostics', 'view')
);

drop policy if exists "diagnostic_attachments_insert_authorized" on public.diagnostic_attachments;
create policy "diagnostic_attachments_insert_authorized"
on public.diagnostic_attachments
for insert
to authenticated
with check (
  public.user_has_permission(clinic_id, 'diagnostics', 'edit')
  or public.user_has_permission(clinic_id, 'diagnostics', 'manage')
);

drop policy if exists "diagnostic_attachments_update_authorized" on public.diagnostic_attachments;
create policy "diagnostic_attachments_update_authorized"
on public.diagnostic_attachments
for update
to authenticated
using (
  public.user_has_permission(clinic_id, 'diagnostics', 'edit')
  or public.user_has_permission(clinic_id, 'diagnostics', 'manage')
)
with check (
  public.user_has_permission(clinic_id, 'diagnostics', 'edit')
  or public.user_has_permission(clinic_id, 'diagnostics', 'manage')
);

grant select, insert, update on public.diagnostic_attachments to authenticated;

insert into public.app_migration_history (migration_name, description, source, notes)
values (
  '045_diagnostic_requests_attachments.sql',
  'Solicitacoes diagnosticas imprimiveis, entrega ao paciente e anexos externos vinculados ao prontuario.',
  'supabase_sql_editor',
  'Adiciona request_printed_at/request_delivered_at e tabela diagnostic_attachments com RLS.'
)
on conflict (migration_name) do update
set description = excluded.description,
    notes = excluded.notes;
