-- CliniCore - diagnostics and supplementary health billing foundation.
-- Execute after 039_diagnostics_insurance_permission_modules.sql.

create table if not exists public.module_user_preferences (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  module_key text not null check (module_key in ('diagnostics', 'insurance')),
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  unique (clinic_id, user_id, module_key)
);

create table if not exists public.diagnostic_orders (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id),
  appointment_id uuid references public.appointments(id),
  encounter_id uuid references public.clinical_encounters(id),
  professional_member_id uuid not null references public.clinic_members(id),
  order_number text not null,
  category text not null check (category in ('laboratory', 'imaging', 'pathology', 'functional', 'other')),
  priority text not null default 'routine' check (priority in ('routine', 'urgent', 'stat')),
  status text not null default 'requested' check (status in ('draft', 'requested', 'scheduled', 'collected', 'in_progress', 'partial', 'completed', 'cancelled', 'corrected')),
  clinical_indication text,
  fasting_instructions text,
  scheduled_at timestamptz,
  collected_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  unique (clinic_id, order_number)
);

create table if not exists public.diagnostic_order_items (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  order_id uuid not null references public.diagnostic_orders(id) on delete cascade,
  code_system text not null default 'internal' check (code_system in ('internal', 'tuss', 'loinc')),
  procedure_code text,
  name text not null,
  specimen text,
  instructions text,
  status text not null default 'pending' check (status in ('pending', 'collected', 'processing', 'preliminary', 'final', 'cancelled', 'corrected')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);

create table if not exists public.diagnostic_results (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  order_id uuid not null references public.diagnostic_orders(id) on delete cascade,
  order_item_id uuid not null references public.diagnostic_order_items(id) on delete cascade,
  patient_id uuid not null references public.patients(id),
  professional_member_id uuid not null references public.clinic_members(id),
  status text not null default 'preliminary' check (status in ('preliminary', 'final', 'corrected', 'cancelled')),
  value_text text,
  value_numeric numeric(18,6),
  unit text,
  reference_range text,
  flag text not null default 'normal' check (flag in ('normal', 'low', 'high', 'critical', 'indeterminate')),
  interpretation text,
  report_text text,
  version_number integer not null default 1 check (version_number > 0),
  corrects_result_id uuid references public.diagnostic_results(id),
  correction_reason text,
  resulted_at timestamptz not null default now(),
  validated_at timestamptz,
  validated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);

create table if not exists public.diagnostic_order_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  order_id uuid not null references public.diagnostic_orders(id) on delete cascade,
  event_type text not null,
  previous_status text,
  next_status text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

alter table public.financial_health_plans
  add column if not exists ans_registration text,
  add column if not exists tiss_version text not null default '202511',
  add column if not exists operator_code text,
  add column if not exists submission_deadline_days integer not null default 30 check (submission_deadline_days between 1 and 365);

create table if not exists public.patient_health_coverages (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  health_plan_id uuid not null references public.financial_health_plans(id),
  beneficiary_number text not null,
  plan_name text,
  accommodation text,
  validity_date date,
  holder_name text,
  holder_document text,
  is_primary boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);

create table if not exists public.tiss_guides (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  health_plan_id uuid not null references public.financial_health_plans(id),
  coverage_id uuid references public.patient_health_coverages(id),
  patient_id uuid not null references public.patients(id),
  appointment_id uuid references public.appointments(id),
  encounter_id uuid references public.clinical_encounters(id),
  professional_member_id uuid references public.clinic_members(id),
  financial_entry_id uuid references public.financial_entries(id),
  guide_number text not null,
  operator_guide_number text,
  guide_type text not null default 'consultation' check (guide_type in ('consultation', 'sadt', 'hospitalization', 'fees', 'dental')),
  status text not null default 'draft' check (status in ('draft', 'pending_authorization', 'authorized', 'partially_authorized', 'denied', 'ready', 'batched', 'submitted', 'accepted', 'partially_paid', 'paid', 'glossed', 'cancelled', 'corrected')),
  authorization_number text,
  authorization_valid_until date,
  service_date date not null default current_date,
  total_cents integer not null default 0 check (total_cents >= 0),
  approved_cents integer not null default 0 check (approved_cents >= 0),
  paid_cents integer not null default 0 check (paid_cents >= 0),
  glossed_cents integer not null default 0 check (glossed_cents >= 0),
  clinical_indication text,
  notes text,
  correction_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  unique (clinic_id, guide_number)
);

create table if not exists public.tiss_guide_items (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  guide_id uuid not null references public.tiss_guides(id) on delete cascade,
  tuss_code text not null,
  description text not null,
  service_date date not null,
  quantity numeric(12,3) not null default 1 check (quantity > 0),
  unit_amount_cents integer not null check (unit_amount_cents >= 0),
  requested_cents integer not null check (requested_cents >= 0),
  approved_cents integer not null default 0 check (approved_cents >= 0),
  paid_cents integer not null default 0 check (paid_cents >= 0),
  glossed_cents integer not null default 0 check (glossed_cents >= 0),
  status text not null default 'requested' check (status in ('requested', 'authorized', 'denied', 'performed', 'billed', 'paid', 'glossed', 'cancelled')),
  gloss_code text,
  gloss_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);

create table if not exists public.tiss_batches (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  health_plan_id uuid not null references public.financial_health_plans(id),
  batch_number text not null,
  competence text not null check (competence ~ '^[0-9]{4}-[0-9]{2}$'),
  tiss_version text not null,
  status text not null default 'open' check (status in ('open', 'validated', 'submitted', 'accepted', 'rejected', 'processed', 'cancelled', 'reopened')),
  guide_count integer not null default 0,
  total_cents integer not null default 0,
  protocol_number text,
  submitted_at timestamptz,
  processed_at timestamptz,
  closed_by uuid references public.profiles(id),
  correction_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  unique (clinic_id, batch_number)
);

alter table public.tiss_batches drop constraint if exists tiss_batches_competence_check;
alter table public.tiss_batches add constraint tiss_batches_competence_check
check (competence ~ '^[0-9]{4}-[0-9]{2}$');

create table if not exists public.tiss_batch_guides (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  batch_id uuid not null references public.tiss_batches(id) on delete cascade,
  guide_id uuid not null references public.tiss_guides(id),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  unique (batch_id, guide_id)
);

create table if not exists public.tiss_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  guide_id uuid references public.tiss_guides(id) on delete cascade,
  batch_id uuid references public.tiss_batches(id) on delete cascade,
  event_type text not null,
  previous_status text,
  next_status text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  check (guide_id is not null or batch_id is not null)
);

create index if not exists diagnostics_orders_queue_idx on public.diagnostic_orders(clinic_id, status, priority, created_at desc) where deleted_at is null;
create index if not exists diagnostics_orders_patient_idx on public.diagnostic_orders(clinic_id, patient_id, created_at desc) where deleted_at is null;
create index if not exists diagnostics_results_patient_idx on public.diagnostic_results(clinic_id, patient_id, resulted_at desc) where deleted_at is null;
create unique index if not exists diagnostics_results_current_unique on public.diagnostic_results(order_item_id) where deleted_at is null and status in ('preliminary', 'final');
create index if not exists patient_coverages_patient_idx on public.patient_health_coverages(clinic_id, patient_id, active) where deleted_at is null;
create index if not exists tiss_guides_queue_idx on public.tiss_guides(clinic_id, status, service_date desc) where deleted_at is null;
create index if not exists tiss_guides_patient_idx on public.tiss_guides(clinic_id, patient_id, service_date desc) where deleted_at is null;
create index if not exists tiss_batches_operator_idx on public.tiss_batches(clinic_id, health_plan_id, competence, status) where deleted_at is null;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'module_user_preferences', 'diagnostic_orders', 'diagnostic_order_items', 'diagnostic_results',
    'patient_health_coverages', 'tiss_guides', 'tiss_guide_items', 'tiss_batches'
  ] loop
    execute format('drop trigger if exists set_%I_updated_at on public.%I', table_name, table_name);
    execute format('create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name, table_name);
  end loop;
end $$;

alter table public.module_user_preferences enable row level security;
alter table public.diagnostic_orders enable row level security;
alter table public.diagnostic_order_items enable row level security;
alter table public.diagnostic_results enable row level security;
alter table public.diagnostic_order_events enable row level security;
alter table public.patient_health_coverages enable row level security;
alter table public.tiss_guides enable row level security;
alter table public.tiss_guide_items enable row level security;
alter table public.tiss_batches enable row level security;
alter table public.tiss_batch_guides enable row level security;
alter table public.tiss_events enable row level security;

drop policy if exists "financial_health_plans_select_authorized" on public.financial_health_plans;
create policy "financial_health_plans_select_authorized" on public.financial_health_plans for select to authenticated
using (deleted_at is null and (public.user_has_permission(clinic_id,'financial','view') or public.user_has_permission(clinic_id,'insurance','view')));
drop policy if exists "financial_health_plans_insert_authorized" on public.financial_health_plans;
create policy "financial_health_plans_insert_authorized" on public.financial_health_plans for insert to authenticated
with check (public.user_has_permission(clinic_id,'financial','manage') or public.user_has_permission(clinic_id,'insurance','manage'));
drop policy if exists "financial_health_plans_update_authorized" on public.financial_health_plans;
create policy "financial_health_plans_update_authorized" on public.financial_health_plans for update to authenticated
using (deleted_at is null and (public.user_has_permission(clinic_id,'financial','manage') or public.user_has_permission(clinic_id,'insurance','manage')))
with check (public.user_has_permission(clinic_id,'financial','manage') or public.user_has_permission(clinic_id,'insurance','manage'));

drop policy if exists "module_preferences_own" on public.module_user_preferences;
create policy "module_preferences_own" on public.module_user_preferences for all to authenticated
using (user_id = auth.uid() and public.user_has_clinic_access(clinic_id, auth.uid()))
with check (user_id = auth.uid() and public.user_has_clinic_access(clinic_id, auth.uid()));

do $$
declare table_name text;
begin
  foreach table_name in array array['diagnostic_orders','diagnostic_order_items','diagnostic_results','diagnostic_order_events'] loop
    execute format('drop policy if exists "%1$s_select" on public.%1$I', table_name);
    execute format('create policy "%1$s_select" on public.%1$I for select to authenticated using (public.user_has_permission(clinic_id, ''diagnostics'', ''view''))', table_name);
    execute format('drop policy if exists "%1$s_insert" on public.%1$I', table_name);
    execute format('create policy "%1$s_insert" on public.%1$I for insert to authenticated with check (public.user_has_permission(clinic_id, ''diagnostics'', ''create'') or public.user_has_permission(clinic_id, ''diagnostics'', ''manage''))', table_name);
    execute format('drop policy if exists "%1$s_update" on public.%1$I', table_name);
    execute format('create policy "%1$s_update" on public.%1$I for update to authenticated using (public.user_has_permission(clinic_id, ''diagnostics'', ''edit'') or public.user_has_permission(clinic_id, ''diagnostics'', ''manage'')) with check (public.user_has_permission(clinic_id, ''diagnostics'', ''edit'') or public.user_has_permission(clinic_id, ''diagnostics'', ''manage''))', table_name);
  end loop;
  foreach table_name in array array['patient_health_coverages','tiss_guides','tiss_guide_items','tiss_batches','tiss_batch_guides','tiss_events'] loop
    execute format('drop policy if exists "%1$s_select" on public.%1$I', table_name);
    execute format('create policy "%1$s_select" on public.%1$I for select to authenticated using (public.user_has_permission(clinic_id, ''insurance'', ''view''))', table_name);
    execute format('drop policy if exists "%1$s_insert" on public.%1$I', table_name);
    execute format('create policy "%1$s_insert" on public.%1$I for insert to authenticated with check (public.user_has_permission(clinic_id, ''insurance'', ''create'') or public.user_has_permission(clinic_id, ''insurance'', ''manage''))', table_name);
    execute format('drop policy if exists "%1$s_update" on public.%1$I', table_name);
    execute format('create policy "%1$s_update" on public.%1$I for update to authenticated using (public.user_has_permission(clinic_id, ''insurance'', ''edit'') or public.user_has_permission(clinic_id, ''insurance'', ''manage'')) with check (public.user_has_permission(clinic_id, ''insurance'', ''edit'') or public.user_has_permission(clinic_id, ''insurance'', ''manage''))', table_name);
  end loop;
end $$;

grant select, insert, update on public.module_user_preferences to authenticated;
grant select, insert, update on public.diagnostic_orders, public.diagnostic_order_items, public.diagnostic_results, public.diagnostic_order_events to authenticated;
grant select, insert, update on public.patient_health_coverages, public.tiss_guides, public.tiss_guide_items, public.tiss_batches, public.tiss_batch_guides, public.tiss_events to authenticated;

insert into public.permission_catalog (module, action, description)
select module_name, action_name, description
from (values
  ('diagnostics'::public.permission_module, 'view'::public.permission_action, 'Visualizar pedidos e resultados de exames'),
  ('diagnostics'::public.permission_module, 'create'::public.permission_action, 'Solicitar exames e registrar coletas'),
  ('diagnostics'::public.permission_module, 'edit'::public.permission_action, 'Lançar e corrigir resultados'),
  ('diagnostics'::public.permission_module, 'approve'::public.permission_action, 'Validar resultados diagnósticos'),
  ('diagnostics'::public.permission_module, 'manage'::public.permission_action, 'Gerenciar módulo diagnóstico'),
  ('diagnostics'::public.permission_module, 'export'::public.permission_action, 'Exportar resultados e relatórios'),
  ('insurance'::public.permission_module, 'view'::public.permission_action, 'Visualizar convênios, guias e lotes TISS'),
  ('insurance'::public.permission_module, 'create'::public.permission_action, 'Criar coberturas e guias'),
  ('insurance'::public.permission_module, 'edit'::public.permission_action, 'Editar guias antes do envio'),
  ('insurance'::public.permission_module, 'approve'::public.permission_action, 'Autorizar fechamento e envio de lotes'),
  ('insurance'::public.permission_module, 'manage'::public.permission_action, 'Gerenciar faturamento TISS e correções'),
  ('insurance'::public.permission_module, 'export'::public.permission_action, 'Exportar arquivos e relatórios TISS')
) values_set(module_name, action_name, description)
where not exists (
  select 1 from public.permission_catalog catalog
  where catalog.clinic_id is null and catalog.module = module_name and catalog.action = action_name and catalog.deleted_at is null
);

insert into public.role_permissions (role, module, action, allowed)
select role_name, module_name, action_name, true
from (values
  ('clinic_admin'::public.app_role, 'diagnostics'::public.permission_module, 'view'::public.permission_action),
  ('clinic_admin', 'diagnostics', 'manage'), ('clinic_admin', 'diagnostics', 'export'),
  ('clinic_admin', 'insurance', 'view'), ('clinic_admin', 'insurance', 'manage'), ('clinic_admin', 'insurance', 'approve'), ('clinic_admin', 'insurance', 'export'),
  ('doctor', 'diagnostics', 'view'), ('doctor', 'diagnostics', 'create'), ('doctor', 'diagnostics', 'edit'), ('doctor', 'diagnostics', 'approve'), ('doctor', 'diagnostics', 'export'),
  ('nurse', 'diagnostics', 'view'), ('nurse', 'diagnostics', 'create'), ('nurse', 'diagnostics', 'edit'),
  ('receptionist', 'diagnostics', 'view'), ('receptionist', 'insurance', 'view'), ('receptionist', 'insurance', 'create'),
  ('financial', 'insurance', 'view'), ('financial', 'insurance', 'create'), ('financial', 'insurance', 'edit'), ('financial', 'insurance', 'approve'), ('financial', 'insurance', 'manage'), ('financial', 'insurance', 'export'),
  ('professional', 'diagnostics', 'view'), ('professional', 'diagnostics', 'create'), ('professional', 'diagnostics', 'edit'), ('professional', 'diagnostics', 'approve')
) defaults(role_name, module_name, action_name)
where not exists (
  select 1 from public.role_permissions rp
  where rp.clinic_id is null and rp.role = role_name and rp.module = module_name and rp.action = action_name and rp.deleted_at is null
);

create or replace function public.save_module_user_preferences(module_name text, preference_payload jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare actor uuid := auth.uid(); clinic_uuid uuid := nullif(preference_payload->>'clinic_id','')::uuid;
begin
  if actor is null or module_name not in ('diagnostics','insurance') or not public.user_has_clinic_access(clinic_uuid, actor) then
    raise exception 'PREFERENCES_PERMISSION_REQUIRED' using errcode = '42501';
  end if;
  insert into public.module_user_preferences (clinic_id,user_id,module_key,preferences,created_by,updated_by)
  values (clinic_uuid,actor,module_name,coalesce(preference_payload->'preferences','{}'::jsonb),actor,actor)
  on conflict (clinic_id,user_id,module_key) do update set preferences=excluded.preferences,deleted_at=null,updated_by=actor;
end; $$;
revoke all on function public.save_module_user_preferences(text,jsonb) from public, anon;
grant execute on function public.save_module_user_preferences(text,jsonb) to authenticated;

create or replace function public.create_diagnostic_order_transaction(order_payload jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare actor uuid := auth.uid(); clinic_uuid uuid := nullif(order_payload->>'clinic_id','')::uuid; patient_uuid uuid := nullif(order_payload->>'patient_id','')::uuid; professional_uuid uuid := nullif(order_payload->>'professional_member_id','')::uuid; appointment_uuid uuid := nullif(order_payload->>'appointment_id','')::uuid; encounter_uuid uuid := nullif(order_payload->>'encounter_id','')::uuid; saved uuid := gen_random_uuid(); order_code text; item jsonb;
begin
  if actor is null or not (public.user_has_permission(clinic_uuid,'diagnostics','create',actor) or public.user_has_permission(clinic_uuid,'diagnostics','manage',actor)) then raise exception 'DIAGNOSTICS_CREATE_PERMISSION_REQUIRED' using errcode='42501'; end if;
  if not exists(select 1 from public.patients where id=patient_uuid and clinic_id=clinic_uuid and deleted_at is null) then raise exception 'DIAGNOSTIC_PATIENT_INVALID' using errcode='foreign_key_violation'; end if;
  if not exists(select 1 from public.clinic_members where id=professional_uuid and clinic_id=clinic_uuid and status='active' and deleted_at is null) then raise exception 'DIAGNOSTIC_PROFESSIONAL_INVALID' using errcode='foreign_key_violation'; end if;
  if appointment_uuid is not null and not exists(select 1 from public.appointments where id=appointment_uuid and clinic_id=clinic_uuid and patient_id=patient_uuid and professional_member_id=professional_uuid and deleted_at is null) then raise exception 'DIAGNOSTIC_APPOINTMENT_MISMATCH' using errcode='foreign_key_violation'; end if;
  if encounter_uuid is not null and not exists(select 1 from public.clinical_encounters where id=encounter_uuid and clinic_id=clinic_uuid and patient_id=patient_uuid and professional_member_id=professional_uuid and deleted_at is null) then raise exception 'DIAGNOSTIC_ENCOUNTER_MISMATCH' using errcode='foreign_key_violation'; end if;
  if jsonb_array_length(coalesce(order_payload->'items','[]'::jsonb))=0 then raise exception 'DIAGNOSTIC_ITEMS_REQUIRED' using errcode='check_violation'; end if;
  order_code := format('EXM-%s-%s',to_char(now(),'YYYY'),upper(substr(replace(saved::text,'-',''),1,8)));
  insert into public.diagnostic_orders(id,clinic_id,patient_id,appointment_id,encounter_id,professional_member_id,order_number,category,priority,status,clinical_indication,fasting_instructions,scheduled_at,metadata,created_by,updated_by)
  values(saved,clinic_uuid,patient_uuid,appointment_uuid,encounter_uuid,professional_uuid,order_code,order_payload->>'category',coalesce(order_payload->>'priority','routine'),coalesce(order_payload->>'status','requested'),nullif(trim(order_payload->>'clinical_indication'),''),nullif(trim(order_payload->>'fasting_instructions'),''),nullif(order_payload->>'scheduled_at','')::timestamptz,coalesce(order_payload->'metadata','{}'::jsonb),actor,actor);
  for item in select * from jsonb_array_elements(order_payload->'items') loop
    if length(trim(coalesce(item->>'name','')))<2 then raise exception 'DIAGNOSTIC_ITEM_NAME_REQUIRED' using errcode='check_violation'; end if;
    insert into public.diagnostic_order_items(clinic_id,order_id,code_system,procedure_code,name,specimen,instructions,sort_order,created_by,updated_by)
    values(clinic_uuid,saved,coalesce(nullif(item->>'code_system',''),'internal'),nullif(trim(item->>'procedure_code'),''),trim(item->>'name'),nullif(trim(item->>'specimen'),''),nullif(trim(item->>'instructions'),''),coalesce((item->>'sort_order')::integer,0),actor,actor);
  end loop;
  insert into public.diagnostic_order_events(clinic_id,order_id,event_type,next_status,details,created_by) values(clinic_uuid,saved,'order_created',coalesce(order_payload->>'status','requested'),jsonb_build_object('order_number',order_code),actor);
  insert into public.audit_logs(clinic_id,user_id,action_type,module,record_table,record_id,new_values,level,notes,created_by,updated_by) values(clinic_uuid,actor,'diagnostic_order_created','diagnostics','diagnostic_orders',saved,jsonb_build_object('order_number',order_code,'patient_id',patient_uuid),'security','Pedido diagnóstico criado.',actor,actor);
  return saved;
end; $$;
revoke all on function public.create_diagnostic_order_transaction(jsonb) from public, anon;
grant execute on function public.create_diagnostic_order_transaction(jsonb) to authenticated;

create or replace function public.transition_diagnostic_order_transaction(order_uuid uuid, next_status text, transition_reason text default null)
returns void language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); target public.diagnostic_orders%rowtype; allowed boolean:=false;
begin
  select * into target from public.diagnostic_orders where id=order_uuid and deleted_at is null for update;
  if target.id is null then raise exception 'DIAGNOSTIC_ORDER_NOT_FOUND' using errcode='P0002'; end if;
  if not (public.user_has_permission(target.clinic_id,'diagnostics','edit',actor) or public.user_has_permission(target.clinic_id,'diagnostics','manage',actor)) then raise exception 'DIAGNOSTICS_EDIT_PERMISSION_REQUIRED' using errcode='42501'; end if;
  allowed := (target.status='draft' and next_status in ('requested','cancelled')) or (target.status='requested' and next_status in ('scheduled','collected','in_progress','cancelled')) or (target.status='scheduled' and next_status in ('collected','in_progress','cancelled')) or (target.status='collected' and next_status in ('in_progress','partial','completed')) or (target.status in ('in_progress','partial') and next_status in ('partial','completed','cancelled'));
  if not allowed and not public.user_has_permission(target.clinic_id,'diagnostics','manage',actor) then raise exception 'DIAGNOSTIC_INVALID_TRANSITION' using errcode='check_violation'; end if;
  if next_status in ('cancelled','corrected') and length(trim(coalesce(transition_reason,'')))<5 then raise exception 'DIAGNOSTIC_REASON_REQUIRED' using errcode='check_violation'; end if;
  update public.diagnostic_orders set status=next_status,scheduled_at=case when next_status='scheduled' then coalesce(scheduled_at,now()) else scheduled_at end,collected_at=case when next_status='collected' then now() else collected_at end,completed_at=case when next_status='completed' then now() else completed_at end,cancelled_at=case when next_status='cancelled' then now() else cancelled_at end,cancellation_reason=case when next_status='cancelled' then trim(transition_reason) else cancellation_reason end,updated_by=actor where id=order_uuid;
  insert into public.diagnostic_order_events(clinic_id,order_id,event_type,previous_status,next_status,details,created_by) values(target.clinic_id,target.id,'status_changed',target.status,next_status,jsonb_build_object('reason',transition_reason),actor);
  insert into public.audit_logs(clinic_id,user_id,action_type,module,record_table,record_id,old_values,new_values,level,notes,created_by,updated_by) values(target.clinic_id,actor,'diagnostic_status_changed','diagnostics','diagnostic_orders',target.id,jsonb_build_object('status',target.status),jsonb_build_object('status',next_status,'reason',transition_reason),'security','Etapa do pedido diagnóstico alterada.',actor,actor);
end; $$;
revoke all on function public.transition_diagnostic_order_transaction(uuid,text,text) from public, anon;
grant execute on function public.transition_diagnostic_order_transaction(uuid,text,text) to authenticated;

create or replace function public.save_diagnostic_result_transaction(result_payload jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); item_uuid uuid:=nullif(result_payload->>'order_item_id','')::uuid; item_row public.diagnostic_order_items%rowtype; order_row public.diagnostic_orders%rowtype; previous public.diagnostic_results%rowtype; saved uuid; final_status text:=coalesce(result_payload->>'status','preliminary'); reason text:=nullif(trim(result_payload->>'correction_reason'),''); next_version integer:=1;
begin
  select * into item_row from public.diagnostic_order_items where id=item_uuid and deleted_at is null;
  select * into order_row from public.diagnostic_orders where id=item_row.order_id and deleted_at is null for update;
  if order_row.id is null then raise exception 'DIAGNOSTIC_ITEM_NOT_FOUND' using errcode='P0002'; end if;
  if not (public.user_has_permission(order_row.clinic_id,'diagnostics','edit',actor) or public.user_has_permission(order_row.clinic_id,'diagnostics','manage',actor)) then raise exception 'DIAGNOSTICS_RESULT_PERMISSION_REQUIRED' using errcode='42501'; end if;
  select * into previous from public.diagnostic_results where order_item_id=item_uuid and deleted_at is null and status in ('preliminary','final') order by version_number desc limit 1 for update;
  if previous.id is not null and previous.status='final' and length(coalesce(reason,''))<5 then raise exception 'DIAGNOSTIC_CORRECTION_REASON_REQUIRED' using errcode='check_violation'; end if;
  if final_status='final' and not public.user_has_permission(order_row.clinic_id,'diagnostics','approve',actor) and not public.user_has_permission(order_row.clinic_id,'diagnostics','manage',actor) then raise exception 'DIAGNOSTICS_APPROVAL_REQUIRED' using errcode='42501'; end if;
  if previous.id is not null then update public.diagnostic_results set status=case when previous.status='final' then 'corrected' else 'cancelled' end,updated_by=actor where id=previous.id; next_version:=previous.version_number+1; end if;
  insert into public.diagnostic_results(clinic_id,order_id,order_item_id,patient_id,professional_member_id,status,value_text,value_numeric,unit,reference_range,flag,interpretation,report_text,version_number,corrects_result_id,correction_reason,validated_at,validated_by,created_by,updated_by)
  values(order_row.clinic_id,order_row.id,item_uuid,order_row.patient_id,order_row.professional_member_id,final_status,nullif(trim(result_payload->>'value_text'),''),nullif(result_payload->>'value_numeric','')::numeric,nullif(trim(result_payload->>'unit'),''),nullif(trim(result_payload->>'reference_range'),''),coalesce(result_payload->>'flag','normal'),nullif(trim(result_payload->>'interpretation'),''),nullif(trim(result_payload->>'report_text'),''),next_version,previous.id,reason,case when final_status='final' then now() end,case when final_status='final' then actor end,actor,actor) returning id into saved;
  update public.diagnostic_order_items set status=case when final_status='final' then 'final' else 'preliminary' end,updated_by=actor where id=item_uuid;
  update public.diagnostic_orders set status=case when not exists(select 1 from public.diagnostic_order_items i where i.order_id=order_row.id and i.deleted_at is null and i.id<>item_uuid and i.status<>'final') and final_status='final' then 'completed' else 'partial' end,completed_at=case when not exists(select 1 from public.diagnostic_order_items i where i.order_id=order_row.id and i.deleted_at is null and i.id<>item_uuid and i.status<>'final') and final_status='final' then now() else completed_at end,updated_by=actor where id=order_row.id;
  insert into public.diagnostic_order_events(clinic_id,order_id,event_type,details,created_by) values(order_row.clinic_id,order_row.id,case when previous.id is null then 'result_recorded' else 'result_corrected' end,jsonb_build_object('result_id',saved,'item_id',item_uuid,'flag',coalesce(result_payload->>'flag','normal'),'reason',reason),actor);
  insert into public.audit_logs(clinic_id,user_id,action_type,module,record_table,record_id,old_values,new_values,level,notes,created_by,updated_by) values(order_row.clinic_id,actor,case when previous.id is null then 'diagnostic_result_recorded' else 'diagnostic_result_corrected' end,'diagnostics','diagnostic_results',saved,case when previous.id is null then null else to_jsonb(previous) end,jsonb_build_object('status',final_status,'flag',coalesce(result_payload->>'flag','normal'),'version',next_version),'security','Resultado diagnóstico registrado com versionamento.',actor,actor);
  return saved;
end; $$;
revoke all on function public.save_diagnostic_result_transaction(jsonb) from public, anon;
grant execute on function public.save_diagnostic_result_transaction(jsonb) to authenticated;

create or replace function public.save_tiss_guide_transaction(guide_payload jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); clinic_uuid uuid:=nullif(guide_payload->>'clinic_id','')::uuid; patient_uuid uuid:=nullif(guide_payload->>'patient_id','')::uuid; plan_uuid uuid:=nullif(guide_payload->>'health_plan_id','')::uuid; saved uuid:=gen_random_uuid(); guide_code text; item jsonb; total integer:=0; amount integer; quantity numeric;
begin
  if actor is null or not (public.user_has_permission(clinic_uuid,'insurance','create',actor) or public.user_has_permission(clinic_uuid,'insurance','manage',actor)) then raise exception 'INSURANCE_CREATE_PERMISSION_REQUIRED' using errcode='42501'; end if;
  if not exists(select 1 from public.patients where id=patient_uuid and clinic_id=clinic_uuid and deleted_at is null) then raise exception 'TISS_PATIENT_INVALID' using errcode='foreign_key_violation'; end if;
  if not exists(select 1 from public.financial_health_plans where id=plan_uuid and clinic_id=clinic_uuid and active=true and deleted_at is null) then raise exception 'TISS_HEALTH_PLAN_INVALID' using errcode='foreign_key_violation'; end if;
  if nullif(guide_payload->>'coverage_id','') is not null and not exists(select 1 from public.patient_health_coverages where id=(guide_payload->>'coverage_id')::uuid and clinic_id=clinic_uuid and patient_id=patient_uuid and health_plan_id=plan_uuid and active=true and deleted_at is null) then raise exception 'TISS_COVERAGE_MISMATCH' using errcode='foreign_key_violation'; end if;
  if nullif(guide_payload->>'appointment_id','') is not null and not exists(select 1 from public.appointments where id=(guide_payload->>'appointment_id')::uuid and clinic_id=clinic_uuid and patient_id=patient_uuid and deleted_at is null) then raise exception 'TISS_APPOINTMENT_MISMATCH' using errcode='foreign_key_violation'; end if;
  if nullif(guide_payload->>'financial_entry_id','') is not null and not exists(select 1 from public.financial_entries where id=(guide_payload->>'financial_entry_id')::uuid and clinic_id=clinic_uuid and patient_id=patient_uuid and (nullif(guide_payload->>'appointment_id','') is null or appointment_id=(guide_payload->>'appointment_id')::uuid) and deleted_at is null) then raise exception 'TISS_FINANCIAL_MISMATCH' using errcode='foreign_key_violation'; end if;
  if jsonb_array_length(coalesce(guide_payload->'items','[]'::jsonb))=0 then raise exception 'TISS_ITEMS_REQUIRED' using errcode='check_violation'; end if;
  for item in select * from jsonb_array_elements(guide_payload->'items') loop quantity:=coalesce(nullif(item->>'quantity','')::numeric,1); amount:=coalesce(nullif(item->>'unit_amount_cents','')::integer,0); total:=total+round(quantity*amount); end loop;
  guide_code:=format('TISS-%s-%s',to_char(now(),'YYYY'),upper(substr(replace(saved::text,'-',''),1,8)));
  insert into public.tiss_guides(id,clinic_id,health_plan_id,coverage_id,patient_id,appointment_id,encounter_id,professional_member_id,financial_entry_id,guide_number,operator_guide_number,guide_type,status,authorization_number,authorization_valid_until,service_date,total_cents,clinical_indication,notes,metadata,created_by,updated_by)
  values(saved,clinic_uuid,plan_uuid,nullif(guide_payload->>'coverage_id','')::uuid,patient_uuid,nullif(guide_payload->>'appointment_id','')::uuid,nullif(guide_payload->>'encounter_id','')::uuid,nullif(guide_payload->>'professional_member_id','')::uuid,nullif(guide_payload->>'financial_entry_id','')::uuid,guide_code,nullif(trim(guide_payload->>'operator_guide_number'),''),coalesce(guide_payload->>'guide_type','consultation'),coalesce(guide_payload->>'status','draft'),nullif(trim(guide_payload->>'authorization_number'),''),nullif(guide_payload->>'authorization_valid_until','')::date,coalesce(nullif(guide_payload->>'service_date','')::date,current_date),total,nullif(trim(guide_payload->>'clinical_indication'),''),nullif(trim(guide_payload->>'notes'),''),coalesce(guide_payload->'metadata','{}'::jsonb),actor,actor);
  for item in select * from jsonb_array_elements(guide_payload->'items') loop quantity:=coalesce(nullif(item->>'quantity','')::numeric,1); amount:=coalesce(nullif(item->>'unit_amount_cents','')::integer,0); insert into public.tiss_guide_items(clinic_id,guide_id,tuss_code,description,service_date,quantity,unit_amount_cents,requested_cents,created_by,updated_by) values(clinic_uuid,saved,trim(item->>'tuss_code'),trim(item->>'description'),coalesce(nullif(item->>'service_date','')::date,current_date),quantity,amount,round(quantity*amount),actor,actor); end loop;
  insert into public.tiss_events(clinic_id,guide_id,event_type,next_status,details,created_by) values(clinic_uuid,saved,'guide_created',coalesce(guide_payload->>'status','draft'),jsonb_build_object('guide_number',guide_code,'total_cents',total),actor);
  insert into public.audit_logs(clinic_id,user_id,action_type,module,record_table,record_id,new_values,level,notes,created_by,updated_by) values(clinic_uuid,actor,'tiss_guide_created','insurance','tiss_guides',saved,jsonb_build_object('guide_number',guide_code,'patient_id',patient_uuid,'total_cents',total),'security','Guia TISS criada.',actor,actor);
  return saved;
end; $$;
revoke all on function public.save_tiss_guide_transaction(jsonb) from public, anon;
grant execute on function public.save_tiss_guide_transaction(jsonb) to authenticated;

create or replace function public.transition_tiss_guide_transaction(guide_uuid uuid,next_status text,transition_reason text default null)
returns void language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); target public.tiss_guides%rowtype; allowed boolean:=false;
begin
  select * into target from public.tiss_guides where id=guide_uuid and deleted_at is null for update;
  if target.id is null then raise exception 'TISS_GUIDE_NOT_FOUND' using errcode='P0002'; end if;
  if not (public.user_has_permission(target.clinic_id,'insurance','edit',actor) or public.user_has_permission(target.clinic_id,'insurance','manage',actor)) then raise exception 'INSURANCE_EDIT_PERMISSION_REQUIRED' using errcode='42501'; end if;
  allowed := (target.status='draft' and next_status in ('pending_authorization','authorized','ready','cancelled')) or (target.status='pending_authorization' and next_status in ('authorized','partially_authorized','denied','cancelled')) or (target.status in ('authorized','partially_authorized') and next_status in ('ready','cancelled')) or (target.status='ready' and next_status in ('batched','cancelled')) or (target.status='submitted' and next_status in ('accepted','glossed')) or (target.status in ('accepted','glossed') and next_status in ('partially_paid','paid','corrected'));
  if not allowed and not public.user_has_permission(target.clinic_id,'insurance','manage',actor) then raise exception 'TISS_INVALID_TRANSITION' using errcode='check_violation'; end if;
  if next_status in ('cancelled','corrected','denied') and length(trim(coalesce(transition_reason,'')))<5 then raise exception 'TISS_REASON_REQUIRED' using errcode='check_violation'; end if;
  update public.tiss_guides set status=next_status,correction_reason=case when next_status in ('cancelled','corrected','denied') then trim(transition_reason) else correction_reason end,updated_by=actor where id=guide_uuid;
  insert into public.tiss_events(clinic_id,guide_id,event_type,previous_status,next_status,details,created_by) values(target.clinic_id,target.id,'status_changed',target.status,next_status,jsonb_build_object('reason',transition_reason),actor);
  insert into public.audit_logs(clinic_id,user_id,action_type,module,record_table,record_id,old_values,new_values,level,notes,created_by,updated_by) values(target.clinic_id,actor,'tiss_status_changed','insurance','tiss_guides',target.id,jsonb_build_object('status',target.status),jsonb_build_object('status',next_status,'reason',transition_reason),'security','Etapa da guia TISS alterada.',actor,actor);
end; $$;
revoke all on function public.transition_tiss_guide_transaction(uuid,text,text) from public, anon;
grant execute on function public.transition_tiss_guide_transaction(uuid,text,text) to authenticated;

create or replace function public.save_patient_coverage_transaction(coverage_payload jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); clinic_uuid uuid:=nullif(coverage_payload->>'clinic_id','')::uuid; coverage_uuid uuid:=nullif(coverage_payload->>'id','')::uuid; patient_uuid uuid:=nullif(coverage_payload->>'patient_id','')::uuid; plan_uuid uuid:=nullif(coverage_payload->>'health_plan_id','')::uuid; previous jsonb;
begin
  if actor is null or not (public.user_has_permission(clinic_uuid,'insurance','create',actor) or public.user_has_permission(clinic_uuid,'insurance','manage',actor)) then raise exception 'INSURANCE_COVERAGE_PERMISSION_REQUIRED' using errcode='42501'; end if;
  if not exists(select 1 from public.patients where id=patient_uuid and clinic_id=clinic_uuid and deleted_at is null) then raise exception 'TISS_PATIENT_INVALID' using errcode='foreign_key_violation'; end if;
  if not exists(select 1 from public.financial_health_plans where id=plan_uuid and clinic_id=clinic_uuid and active=true and deleted_at is null) then raise exception 'TISS_HEALTH_PLAN_INVALID' using errcode='foreign_key_violation'; end if;
  if length(trim(coalesce(coverage_payload->>'beneficiary_number','')))<3 then raise exception 'TISS_BENEFICIARY_REQUIRED' using errcode='check_violation'; end if;
  if coalesce((coverage_payload->>'is_primary')::boolean,false) then update public.patient_health_coverages set is_primary=false,updated_by=actor where clinic_id=clinic_uuid and patient_id=patient_uuid and deleted_at is null; end if;
  if coverage_uuid is null then
    insert into public.patient_health_coverages(clinic_id,patient_id,health_plan_id,beneficiary_number,plan_name,accommodation,validity_date,holder_name,holder_document,is_primary,active,created_by,updated_by)
    values(clinic_uuid,patient_uuid,plan_uuid,trim(coverage_payload->>'beneficiary_number'),nullif(trim(coverage_payload->>'plan_name'),''),nullif(trim(coverage_payload->>'accommodation'),''),nullif(coverage_payload->>'validity_date','')::date,nullif(trim(coverage_payload->>'holder_name'),''),nullif(regexp_replace(coalesce(coverage_payload->>'holder_document',''),'\\D','','g'),''),coalesce((coverage_payload->>'is_primary')::boolean,false),true,actor,actor) returning id into coverage_uuid;
  else
    select to_jsonb(c) into previous from public.patient_health_coverages c where c.id=coverage_uuid and c.clinic_id=clinic_uuid and c.deleted_at is null for update;
    if previous is null then raise exception 'TISS_COVERAGE_NOT_FOUND' using errcode='P0002'; end if;
    update public.patient_health_coverages set health_plan_id=plan_uuid,beneficiary_number=trim(coverage_payload->>'beneficiary_number'),plan_name=nullif(trim(coverage_payload->>'plan_name'),''),accommodation=nullif(trim(coverage_payload->>'accommodation'),''),validity_date=nullif(coverage_payload->>'validity_date','')::date,holder_name=nullif(trim(coverage_payload->>'holder_name'),''),holder_document=nullif(regexp_replace(coalesce(coverage_payload->>'holder_document',''),'\\D','','g'),''),is_primary=coalesce((coverage_payload->>'is_primary')::boolean,false),updated_by=actor where id=coverage_uuid;
  end if;
  insert into public.audit_logs(clinic_id,user_id,action_type,module,record_table,record_id,old_values,new_values,level,notes,created_by,updated_by) values(clinic_uuid,actor,case when previous is null then 'coverage_created' else 'coverage_updated' end,'insurance','patient_health_coverages',coverage_uuid,previous,jsonb_build_object('patient_id',patient_uuid,'health_plan_id',plan_uuid,'is_primary',coalesce((coverage_payload->>'is_primary')::boolean,false)),'security','Cobertura de convênio salva.',actor,actor);
  return coverage_uuid;
end; $$;
revoke all on function public.save_patient_coverage_transaction(jsonb) from public, anon;
grant execute on function public.save_patient_coverage_transaction(jsonb) to authenticated;

create or replace function public.create_tiss_batch_transaction(batch_payload jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); clinic_uuid uuid:=nullif(batch_payload->>'clinic_id','')::uuid; plan_uuid uuid:=nullif(batch_payload->>'health_plan_id','')::uuid; saved uuid:=gen_random_uuid(); batch_code text; guide_uuid uuid; total integer:=0; count_guides integer:=0;
begin
  if actor is null or not (public.user_has_permission(clinic_uuid,'insurance','approve',actor) or public.user_has_permission(clinic_uuid,'insurance','manage',actor)) then raise exception 'TISS_BATCH_APPROVAL_REQUIRED' using errcode='42501'; end if;
  if jsonb_array_length(coalesce(batch_payload->'guide_ids','[]'::jsonb))=0 then raise exception 'TISS_BATCH_GUIDES_REQUIRED' using errcode='check_violation'; end if;
  batch_code:=format('LOT-%s-%s',to_char(now(),'YYYYMM'),upper(substr(replace(saved::text,'-',''),1,6)));
  for guide_uuid in select value::uuid from jsonb_array_elements_text(batch_payload->'guide_ids') loop
    if not exists(select 1 from public.tiss_guides where id=guide_uuid and clinic_id=clinic_uuid and health_plan_id=plan_uuid and status='ready' and deleted_at is null) then raise exception 'TISS_GUIDE_NOT_READY' using errcode='check_violation'; end if;
    total:=total+(select total_cents from public.tiss_guides where id=guide_uuid); count_guides:=count_guides+1;
  end loop;
  insert into public.tiss_batches(id,clinic_id,health_plan_id,batch_number,competence,tiss_version,status,guide_count,total_cents,closed_by,created_by,updated_by)
  values(saved,clinic_uuid,plan_uuid,batch_code,batch_payload->>'competence',coalesce(batch_payload->>'tiss_version','202511'),'validated',count_guides,total,actor,actor,actor);
  for guide_uuid in select value::uuid from jsonb_array_elements_text(batch_payload->'guide_ids') loop insert into public.tiss_batch_guides(clinic_id,batch_id,guide_id,created_by) values(clinic_uuid,saved,guide_uuid,actor); update public.tiss_guides set status='batched',updated_by=actor where id=guide_uuid; end loop;
  insert into public.tiss_events(clinic_id,batch_id,event_type,next_status,details,created_by) values(clinic_uuid,saved,'batch_created','validated',jsonb_build_object('batch_number',batch_code,'guide_count',count_guides,'total_cents',total),actor);
  insert into public.audit_logs(clinic_id,user_id,action_type,module,record_table,record_id,new_values,level,notes,created_by,updated_by) values(clinic_uuid,actor,'tiss_batch_created','insurance','tiss_batches',saved,jsonb_build_object('batch_number',batch_code,'guide_count',count_guides,'total_cents',total),'security','Lote TISS validado e fechado.',actor,actor);
  return saved;
end; $$;
revoke all on function public.create_tiss_batch_transaction(jsonb) from public, anon;
grant execute on function public.create_tiss_batch_transaction(jsonb) to authenticated;

insert into public.app_migration_history(migration_name,description,source,notes)
values('040_diagnostics_tiss_foundation.sql','Pedidos e resultados diagnósticos, coberturas, guias e lotes TISS com RLS e transações auditáveis.','supabase_sql_editor','Fundação operacional integrada ao paciente, atendimento, prontuário e financeiro.')
on conflict(migration_name) do nothing;
