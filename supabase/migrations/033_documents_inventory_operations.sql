-- CliniCore - Documentos/contratos e estoque integrado ao financeiro.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'document_template_type') then
    create type public.document_template_type as enum (
      'service_contract',
      'lgpd_consent',
      'procedure_consent',
      'payment_acknowledgement',
      'attendance_declaration',
      'receipt',
      'other'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'inventory_movement_type') then
    create type public.inventory_movement_type as enum (
      'purchase_entry',
      'care_consumption',
      'manual_adjustment',
      'transfer',
      'loss',
      'return'
    );
  end if;
end $$;

create table if not exists public.document_templates (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  template_type public.document_template_type not null,
  name text not null,
  description text,
  legal_basis text,
  content text not null,
  accepted_file_url text,
  accepted_file_name text,
  active boolean not null default true,
  version_number integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

create table if not exists public.document_template_versions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  template_id uuid not null references public.document_templates(id) on delete cascade,
  version_number integer not null,
  content text not null,
  legal_basis text,
  accepted_file_url text,
  accepted_file_name text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table if not exists public.generated_documents (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  template_id uuid references public.document_templates(id),
  template_version_id uuid references public.document_template_versions(id),
  patient_id uuid references public.patients(id),
  appointment_id uuid references public.appointments(id),
  encounter_id uuid references public.clinical_encounters(id),
  financial_entry_id uuid references public.financial_entries(id),
  title text not null,
  content text not null,
  status text not null default 'draft',
  deleted_reason text,
  printed_at timestamptz,
  printed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null,
  sku text,
  category text,
  unit text not null default 'un',
  generate_stock boolean not null default true,
  minimum_quantity numeric(12,3) not null default 0,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

create table if not exists public.inventory_locations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

create table if not exists public.inventory_batches (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  item_id uuid not null references public.inventory_items(id),
  location_id uuid references public.inventory_locations(id),
  batch_number text,
  expires_at date,
  quantity_on_hand numeric(12,3) not null default 0,
  unit_cost_cents integer not null default 0,
  source_financial_entry_id uuid references public.financial_entries(id),
  source_financial_entry_item_id uuid references public.financial_entry_items(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  item_id uuid not null references public.inventory_items(id),
  location_id uuid references public.inventory_locations(id),
  batch_id uuid references public.inventory_batches(id),
  movement_type public.inventory_movement_type not null,
  direction text not null check (direction in ('in', 'out')),
  quantity numeric(12,3) not null check (quantity > 0),
  unit_cost_cents integer not null default 0,
  total_cost_cents integer not null default 0,
  financial_entry_id uuid references public.financial_entries(id),
  financial_entry_item_id uuid references public.financial_entry_items(id),
  appointment_id uuid references public.appointments(id),
  encounter_id uuid references public.clinical_encounters(id),
  nursing_assessment_id uuid references public.nursing_assessments(id),
  medical_record_id uuid references public.medical_records(id),
  notes text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references auth.users(id)
);

create table if not exists public.inventory_service_materials (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  service_id uuid not null references public.clinic_services(id) on delete cascade,
  item_id uuid not null references public.inventory_items(id),
  default_quantity numeric(12,3) not null default 1,
  required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

alter table public.financial_entry_items
  add column if not exists generate_stock boolean not null default false,
  add column if not exists inventory_item_id uuid references public.inventory_items(id),
  add column if not exists inventory_location_id uuid references public.inventory_locations(id),
  add column if not exists inventory_batch_id uuid references public.inventory_batches(id),
  add column if not exists batch_number text,
  add column if not exists expires_at date;

create index if not exists idx_document_templates_clinic_type
on public.document_templates(clinic_id, template_type)
where deleted_at is null;

create index if not exists idx_generated_documents_patient
on public.generated_documents(clinic_id, patient_id, created_at desc)
where deleted_at is null;

create index if not exists idx_inventory_items_clinic
on public.inventory_items(clinic_id, name)
where deleted_at is null;

create index if not exists idx_inventory_batches_item
on public.inventory_batches(clinic_id, item_id, expires_at)
where deleted_at is null;

create index if not exists idx_inventory_movements_item
on public.inventory_movements(clinic_id, item_id, created_at desc)
where deleted_at is null;

drop trigger if exists set_document_templates_updated_at on public.document_templates;
create trigger set_document_templates_updated_at
before update on public.document_templates
for each row execute function public.set_updated_at();

drop trigger if exists set_generated_documents_updated_at on public.generated_documents;
create trigger set_generated_documents_updated_at
before update on public.generated_documents
for each row execute function public.set_updated_at();

drop trigger if exists set_inventory_items_updated_at on public.inventory_items;
create trigger set_inventory_items_updated_at
before update on public.inventory_items
for each row execute function public.set_updated_at();

drop trigger if exists set_inventory_locations_updated_at on public.inventory_locations;
create trigger set_inventory_locations_updated_at
before update on public.inventory_locations
for each row execute function public.set_updated_at();

drop trigger if exists set_inventory_batches_updated_at on public.inventory_batches;
create trigger set_inventory_batches_updated_at
before update on public.inventory_batches
for each row execute function public.set_updated_at();

drop trigger if exists set_inventory_service_materials_updated_at on public.inventory_service_materials;
create trigger set_inventory_service_materials_updated_at
before update on public.inventory_service_materials
for each row execute function public.set_updated_at();

alter table public.document_templates enable row level security;
alter table public.document_template_versions enable row level security;
alter table public.generated_documents enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_locations enable row level security;
alter table public.inventory_batches enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.inventory_service_materials enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'document_templates',
    'document_template_versions',
    'generated_documents',
    'inventory_items',
    'inventory_locations',
    'inventory_batches',
    'inventory_movements',
    'inventory_service_materials'
  ]
  loop
    execute format('drop policy if exists "%s_select_authorized" on public.%I', table_name, table_name);
    execute format(
      'create policy "%s_select_authorized" on public.%I for select to authenticated using (public.user_has_clinic_access(clinic_id))',
      table_name,
      table_name
    );
  end loop;
end $$;

drop policy if exists "document_templates_write_authorized" on public.document_templates;
create policy "document_templates_write_authorized"
on public.document_templates for all to authenticated
using (public.user_has_permission(clinic_id, 'documents', 'manage') or public.user_has_permission(clinic_id, 'documents', 'edit'))
with check (public.user_has_permission(clinic_id, 'documents', 'manage') or public.user_has_permission(clinic_id, 'documents', 'edit'));

drop policy if exists "document_template_versions_insert_authorized" on public.document_template_versions;
create policy "document_template_versions_insert_authorized"
on public.document_template_versions for insert to authenticated
with check (public.user_has_permission(clinic_id, 'documents', 'manage') or public.user_has_permission(clinic_id, 'documents', 'edit'));

drop policy if exists "generated_documents_write_authorized" on public.generated_documents;
create policy "generated_documents_write_authorized"
on public.generated_documents for all to authenticated
using (public.user_has_permission(clinic_id, 'documents', 'create') or public.user_has_permission(clinic_id, 'medical_records', 'edit') or public.user_has_permission(clinic_id, 'financial', 'create'))
with check (public.user_has_permission(clinic_id, 'documents', 'create') or public.user_has_permission(clinic_id, 'medical_records', 'edit') or public.user_has_permission(clinic_id, 'financial', 'create'));

drop policy if exists "inventory_items_write_authorized" on public.inventory_items;
create policy "inventory_items_write_authorized"
on public.inventory_items for all to authenticated
using (public.user_has_permission(clinic_id, 'inventory', 'manage') or public.user_has_permission(clinic_id, 'inventory', 'edit'))
with check (public.user_has_permission(clinic_id, 'inventory', 'manage') or public.user_has_permission(clinic_id, 'inventory', 'edit'));

drop policy if exists "inventory_locations_write_authorized" on public.inventory_locations;
create policy "inventory_locations_write_authorized"
on public.inventory_locations for all to authenticated
using (public.user_has_permission(clinic_id, 'inventory', 'manage') or public.user_has_permission(clinic_id, 'inventory', 'edit'))
with check (public.user_has_permission(clinic_id, 'inventory', 'manage') or public.user_has_permission(clinic_id, 'inventory', 'edit'));

drop policy if exists "inventory_batches_write_authorized" on public.inventory_batches;
create policy "inventory_batches_write_authorized"
on public.inventory_batches for all to authenticated
using (public.user_has_permission(clinic_id, 'inventory', 'manage') or public.user_has_permission(clinic_id, 'inventory', 'edit') or public.user_has_permission(clinic_id, 'financial', 'create'))
with check (public.user_has_permission(clinic_id, 'inventory', 'manage') or public.user_has_permission(clinic_id, 'inventory', 'edit') or public.user_has_permission(clinic_id, 'financial', 'create'));

drop policy if exists "inventory_movements_write_authorized" on public.inventory_movements;
create policy "inventory_movements_write_authorized"
on public.inventory_movements for all to authenticated
using (public.user_has_permission(clinic_id, 'inventory', 'create') or public.user_has_permission(clinic_id, 'inventory', 'edit') or public.user_has_permission(clinic_id, 'financial', 'create') or public.user_has_permission(clinic_id, 'nursing', 'edit') or public.user_has_permission(clinic_id, 'medical_records', 'edit'))
with check (public.user_has_permission(clinic_id, 'inventory', 'create') or public.user_has_permission(clinic_id, 'inventory', 'edit') or public.user_has_permission(clinic_id, 'financial', 'create') or public.user_has_permission(clinic_id, 'nursing', 'edit') or public.user_has_permission(clinic_id, 'medical_records', 'edit'));

drop policy if exists "inventory_service_materials_write_authorized" on public.inventory_service_materials;
create policy "inventory_service_materials_write_authorized"
on public.inventory_service_materials for all to authenticated
using (public.user_has_permission(clinic_id, 'inventory', 'manage') or public.user_has_permission(clinic_id, 'inventory', 'edit'))
with check (public.user_has_permission(clinic_id, 'inventory', 'manage') or public.user_has_permission(clinic_id, 'inventory', 'edit'));

insert into public.role_permissions (clinic_id, role, module, action, allowed)
select null, role_value::public.app_role, module_value::public.permission_module, action_value::public.permission_action, true
from unnest(array['clinic_admin', 'clinic_owner']) as role_value
cross join unnest(array['documents', 'inventory']) as module_value
cross join unnest(array['view', 'create', 'edit', 'manage', 'export']) as action_value
where not exists (
  select 1 from public.role_permissions rp
  where rp.clinic_id is null
    and rp.role = role_value::public.app_role
    and rp.module = module_value::public.permission_module
    and rp.action = action_value::public.permission_action
    and rp.deleted_at is null
);

insert into public.role_permissions (clinic_id, role, module, action, allowed)
select null, 'financial'::public.app_role, 'inventory'::public.permission_module, action_value::public.permission_action, true
from unnest(array['view', 'create']) as action_value
where not exists (
  select 1 from public.role_permissions rp
  where rp.clinic_id is null
    and rp.role = 'financial'::public.app_role
    and rp.module = 'inventory'::public.permission_module
    and rp.action = action_value::public.permission_action
    and rp.deleted_at is null
);

insert into public.role_permissions (clinic_id, role, module, action, allowed)
select null, role_value::public.app_role, 'inventory'::public.permission_module, action_value::public.permission_action, true
from unnest(array['doctor', 'nurse']) as role_value
cross join unnest(array['view', 'create']) as action_value
where not exists (
  select 1 from public.role_permissions rp
  where rp.clinic_id is null
    and rp.role = role_value::public.app_role
    and rp.module = 'inventory'::public.permission_module
    and rp.action = action_value::public.permission_action
    and rp.deleted_at is null
);

insert into public.document_templates (
  clinic_id,
  template_type,
  name,
  description,
  legal_basis,
  content,
  created_by,
  updated_by
)
select
  c.id,
  template_type::public.document_template_type,
  name,
  description,
  legal_basis,
  content,
  c.created_by,
  c.updated_by
from public.clinics c
cross join (
  values
    (
      'service_contract',
      'Contrato de prestação de serviços clínicos',
      'Modelo base para contratação de atendimento ou pacote de serviços.',
      'Baseado no Código Civil, Código de Defesa do Consumidor e LGPD. Deve ser revisado pela assessoria jurídica da clínica antes de uso definitivo.',
      'CONTRATO DE PRESTAÇÃO DE SERVIÇOS CLÍNICOS\n\nCONTRATANTE: {{paciente_nome}}, CPF {{paciente_cpf}}.\nCONTRATADA: {{clinica_nome}}, CNPJ {{clinica_documento}}.\n\nOBJETO: prestação de serviços de saúde relacionados a {{servico_nome}}, conforme orientação profissional, disponibilidade da clínica e normas éticas aplicáveis.\n\nVALOR E PAGAMENTO: o valor contratado é de {{valor}}, com vencimento em {{vencimento}}. Eventuais materiais, exames, retornos e procedimentos adicionais serão informados previamente.\n\nCONFIDENCIALIDADE E DADOS: as partes reconhecem que dados pessoais e dados sensíveis de saúde serão tratados exclusivamente para execução do atendimento, gestão administrativa, obrigações legais e proteção da saúde, observada a LGPD.\n\nCIÊNCIA: o paciente declara ter recebido informações suficientes, podendo solicitar esclarecimentos antes da execução do serviço.\n\n{{cidade_data}}\n\n{{clinica_nome}}\n{{paciente_nome}}'
    ),
    (
      'lgpd_consent',
      'Termo de ciência e tratamento de dados LGPD',
      'Modelo para transparência sobre uso de dados pessoais e dados sensíveis de saúde.',
      'Lei Geral de Proteção de Dados - Lei 13.709/2018, especialmente bases legais de tutela da saúde, execução de contrato, obrigação legal e consentimento quando aplicável.',
      'TERMO DE CIÊNCIA SOBRE TRATAMENTO DE DADOS PESSOAIS E SENSÍVEIS\n\nPaciente: {{paciente_nome}}, CPF {{paciente_cpf}}.\nClínica: {{clinica_nome}}.\n\nDeclaro ciência de que meus dados pessoais e dados sensíveis de saúde poderão ser tratados para identificação, cadastro, agendamento, atendimento assistencial, prontuário, faturamento, emissão de documentos, comunicação relacionada ao cuidado, cumprimento de obrigações legais e exercício regular de direitos.\n\nA clínica deverá aplicar controles de acesso, rastreabilidade, sigilo profissional e medidas de segurança compatíveis com a natureza das informações.\n\nDeclaro que fui informado(a) sobre a possibilidade de solicitar informações sobre meus dados, observados os limites legais, éticos e regulatórios aplicáveis à área da saúde.\n\n{{cidade_data}}\n\nAssinatura do paciente ou responsável: ______________________________'
    ),
    (
      'procedure_consent',
      'Termo de consentimento para procedimento',
      'Modelo base para procedimentos que exigem ciência de riscos, benefícios e alternativas.',
      'Modelo orientativo apoiado em dever de informação, autonomia do paciente, normas éticas profissionais e LGPD. Deve ser adaptado ao procedimento específico.',
      'TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO\n\nPaciente: {{paciente_nome}}.\nProcedimento/serviço: {{servico_nome}}.\nProfissional responsável: {{profissional_nome}} - {{profissional_registro}}.\n\nDeclaro que recebi explicações sobre finalidade, benefícios esperados, riscos frequentes, cuidados necessários, alternativas possíveis e consequências da não realização do procedimento indicado.\n\nAutorizo a realização do procedimento descrito, ciente de que resultados podem variar conforme condições individuais, resposta clínica e cuidados posteriores.\n\nAutorizo o registro das informações necessárias em prontuário, com tratamento dos dados conforme LGPD e sigilo profissional.\n\n{{cidade_data}}\n\nAssinatura do paciente/responsável: ______________________________\nAssinatura do profissional: ______________________________'
    ),
    (
      'payment_acknowledgement',
      'Termo de ciência de pagamento pendente',
      'Modelo para quando o paciente reconhece cobrança em aberto.',
      'Código Civil, Código de Defesa do Consumidor e boas práticas de transparência financeira.',
      'TERMO DE CIÊNCIA DE PAGAMENTO PENDENTE\n\nPaciente: {{paciente_nome}}, CPF {{paciente_cpf}}.\nClínica: {{clinica_nome}}.\nReferente a: {{servico_nome}}.\nValor em aberto: {{valor}}.\nVencimento: {{vencimento}}.\n\nDeclaro ciência da existência do valor acima, referente ao atendimento/serviço prestado ou contratado. A clínica poderá realizar contato pelos canais informados no cadastro para envio de recibos, cobranças e orientações administrativas.\n\nObservações: {{observacoes}}\n\n{{cidade_data}}\n\nAssinatura do paciente/responsável: ______________________________'
    ),
    (
      'attendance_declaration',
      'Declaração de comparecimento',
      'Modelo para comprovar presença do paciente na clínica.',
      'Documento administrativo emitido mediante registro de atendimento.',
      'DECLARAÇÃO DE COMPARECIMENTO\n\nDeclaramos, para os devidos fins, que {{paciente_nome}} compareceu à {{clinica_nome}} em {{data_atendimento}}, para atendimento com {{profissional_nome}}.\n\nHorário de permanência/atendimento: {{horario_atendimento}}.\n\n{{cidade_data}}\n\n{{clinica_nome}}\n{{profissional_nome}} - {{profissional_registro}}'
    )
) as defaults(template_type, name, description, legal_basis, content)
where not exists (
  select 1
  from public.document_templates dt
  where dt.clinic_id = c.id
    and dt.template_type = defaults.template_type::public.document_template_type
    and dt.deleted_at is null
);

insert into public.audit_logs (
  clinic_id,
  user_id,
  action_type,
  module,
  record_table,
  level,
  notes
)
values (
  null,
  null,
  'documents_inventory_foundation_created',
  'audit',
  'system_migrations',
  'info',
  'Estrutura inicial de documentos/contratos e estoque integrada ao financeiro criada.'
);

grant select, insert, update on public.document_templates to authenticated;
grant select, insert on public.document_template_versions to authenticated;
grant select, insert, update on public.generated_documents to authenticated;
grant select, insert, update on public.inventory_items to authenticated;
grant select, insert, update on public.inventory_locations to authenticated;
grant select, insert, update on public.inventory_batches to authenticated;
grant select, insert on public.inventory_movements to authenticated;
grant select, insert, update on public.inventory_service_materials to authenticated;
