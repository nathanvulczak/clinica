-- CliniCore - Central inteligente de emissao documental.
-- Execute after 036_schedule_dashboard_experience.sql.

alter table public.generated_documents
  add column if not exists document_number text,
  add column if not exists professional_member_id uuid references public.clinic_members(id),
  add column if not exists issued_at timestamptz,
  add column if not exists expires_at date,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references auth.users(id),
  add column if not exists cancellation_reason text,
  add column if not exists signed_at timestamptz,
  add column if not exists signer_name text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create unique index if not exists generated_documents_number_unique
on public.generated_documents (clinic_id, document_number)
where document_number is not null;

create index if not exists generated_documents_clinic_status_created_idx
on public.generated_documents (clinic_id, status, created_at desc)
where deleted_at is null;

create table if not exists public.document_sequences (
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  sequence_year integer not null,
  last_number integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  primary key (clinic_id, sequence_year)
);

create table if not exists public.generated_document_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  document_id uuid not null references public.generated_documents(id) on delete cascade,
  event_type text not null check (event_type in (
    'draft_created',
    'issued',
    'opened_for_print',
    'printed',
    'signed',
    'cancelled'
  )),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

create index if not exists generated_document_events_document_idx
on public.generated_document_events (document_id, created_at desc)
where deleted_at is null;

drop trigger if exists set_document_sequences_updated_at on public.document_sequences;
create trigger set_document_sequences_updated_at
before update on public.document_sequences
for each row execute function public.set_updated_at();

drop trigger if exists set_generated_document_events_updated_at on public.generated_document_events;
create trigger set_generated_document_events_updated_at
before update on public.generated_document_events
for each row execute function public.set_updated_at();

alter table public.document_sequences enable row level security;
alter table public.generated_document_events enable row level security;

drop policy if exists "document_templates_select_authorized" on public.document_templates;
create policy "document_templates_select_authorized"
on public.document_templates for select to authenticated
using (deleted_at is null and public.user_has_permission(clinic_id, 'documents', 'view'));

drop policy if exists "document_template_versions_select_authorized" on public.document_template_versions;
create policy "document_template_versions_select_authorized"
on public.document_template_versions for select to authenticated
using (public.user_has_permission(clinic_id, 'documents', 'view'));

drop policy if exists "generated_documents_select_authorized" on public.generated_documents;
create policy "generated_documents_select_authorized"
on public.generated_documents for select to authenticated
using (deleted_at is null and public.user_has_permission(clinic_id, 'documents', 'view'));

drop policy if exists "generated_documents_write_authorized" on public.generated_documents;
drop policy if exists "generated_documents_insert_authorized" on public.generated_documents;
create policy "generated_documents_insert_authorized"
on public.generated_documents for insert to authenticated
with check (
  public.user_has_permission(clinic_id, 'documents', 'create')
  or public.user_has_permission(clinic_id, 'documents', 'manage')
);

drop policy if exists "generated_documents_update_authorized" on public.generated_documents;
create policy "generated_documents_update_authorized"
on public.generated_documents for update to authenticated
using (
  deleted_at is null
  and public.user_has_permission(clinic_id, 'documents', 'manage')
)
with check (public.user_has_permission(clinic_id, 'documents', 'manage'));

drop policy if exists "document_sequences_select_authorized" on public.document_sequences;
create policy "document_sequences_select_authorized"
on public.document_sequences for select to authenticated
using (deleted_at is null and public.user_has_permission(clinic_id, 'documents', 'view'));

drop policy if exists "generated_document_events_select_authorized" on public.generated_document_events;
create policy "generated_document_events_select_authorized"
on public.generated_document_events for select to authenticated
using (deleted_at is null and public.user_has_permission(clinic_id, 'documents', 'view'));

drop policy if exists "generated_document_events_insert_authorized" on public.generated_document_events;
create policy "generated_document_events_insert_authorized"
on public.generated_document_events for insert to authenticated
with check (
  public.user_has_permission(clinic_id, 'documents', 'create')
  or public.user_has_permission(clinic_id, 'documents', 'export')
  or public.user_has_permission(clinic_id, 'documents', 'manage')
);

grant select on public.document_sequences to authenticated;
grant select, insert on public.generated_document_events to authenticated;

create or replace function public.next_clinic_document_number(
  clinic_uuid uuid,
  actor_uuid uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  current_year integer := extract(year from now() at time zone 'America/Sao_Paulo')::integer;
  next_number integer;
begin
  insert into public.document_sequences (
    clinic_id, sequence_year, last_number, created_by, updated_by
  )
  values (clinic_uuid, current_year, 1, actor_uuid, actor_uuid)
  on conflict (clinic_id, sequence_year) do update
  set last_number = public.document_sequences.last_number + 1,
      updated_by = actor_uuid,
      deleted_at = null
  returning last_number into next_number;

  return format('DOC-%s-%s', current_year, lpad(next_number::text, 6, '0'));
end;
$$;

revoke all on function public.next_clinic_document_number(uuid, uuid) from public, anon, authenticated;
grant execute on function public.next_clinic_document_number(uuid, uuid) to service_role;

create or replace function public.save_generated_document_transaction(document_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_uuid uuid := auth.uid();
  clinic_uuid uuid := nullif(document_payload->>'clinic_id', '')::uuid;
  template_uuid uuid := nullif(document_payload->>'template_id', '')::uuid;
  patient_uuid uuid := nullif(document_payload->>'patient_id', '')::uuid;
  appointment_uuid uuid := nullif(document_payload->>'appointment_id', '')::uuid;
  encounter_uuid uuid := nullif(document_payload->>'encounter_id', '')::uuid;
  financial_uuid uuid := nullif(document_payload->>'financial_entry_id', '')::uuid;
  professional_uuid uuid := nullif(document_payload->>'professional_member_id', '')::uuid;
  version_uuid uuid;
  saved_uuid uuid;
  desired_status text := coalesce(nullif(document_payload->>'status', ''), 'draft');
  generated_number text;
  linked_patient_uuid uuid;
  linked_appointment_uuid uuid;
  linked_professional_uuid uuid;
begin
  if actor_uuid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if clinic_uuid is null or not (
    public.user_has_permission(clinic_uuid, 'documents', 'create', actor_uuid)
    or public.user_has_permission(clinic_uuid, 'documents', 'manage', actor_uuid)
  ) then
    raise exception 'DOCUMENT_CREATE_PERMISSION_REQUIRED' using errcode = '42501';
  end if;
  if desired_status not in ('draft', 'issued') then
    raise exception 'INVALID_DOCUMENT_STATUS' using errcode = 'check_violation';
  end if;
  if not exists (
    select 1 from public.document_templates template
    where template.id = template_uuid
      and template.clinic_id = clinic_uuid
      and template.active = true
      and template.deleted_at is null
  ) then
    raise exception 'DOCUMENT_TEMPLATE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if financial_uuid is not null then
    select entry.patient_id, entry.appointment_id
    into linked_patient_uuid, linked_appointment_uuid
    from public.financial_entries entry
    where entry.id = financial_uuid and entry.clinic_id = clinic_uuid and entry.deleted_at is null;
    if not found then raise exception 'DOCUMENT_FINANCIAL_ENTRY_INVALID' using errcode = 'foreign_key_violation'; end if;
    if patient_uuid is null then patient_uuid := linked_patient_uuid;
    elsif linked_patient_uuid is not null and patient_uuid <> linked_patient_uuid then
      raise exception 'DOCUMENT_FINANCIAL_PATIENT_MISMATCH' using errcode = 'foreign_key_violation';
    end if;
    if appointment_uuid is null then appointment_uuid := linked_appointment_uuid;
    elsif linked_appointment_uuid is not null and appointment_uuid <> linked_appointment_uuid then
      raise exception 'DOCUMENT_FINANCIAL_APPOINTMENT_MISMATCH' using errcode = 'foreign_key_violation';
    end if;
  end if;

  if encounter_uuid is not null then
    select encounter.appointment_id
    into linked_appointment_uuid
    from public.clinical_encounters encounter
    where encounter.id = encounter_uuid and encounter.clinic_id = clinic_uuid and encounter.deleted_at is null;
    if not found then raise exception 'DOCUMENT_ENCOUNTER_INVALID' using errcode = 'foreign_key_violation'; end if;
    if appointment_uuid is null then appointment_uuid := linked_appointment_uuid;
    elsif appointment_uuid <> linked_appointment_uuid then
      raise exception 'DOCUMENT_ENCOUNTER_APPOINTMENT_MISMATCH' using errcode = 'foreign_key_violation';
    end if;
  end if;

  if appointment_uuid is not null then
    select appointment.patient_id, appointment.professional_member_id
    into linked_patient_uuid, linked_professional_uuid
    from public.appointments appointment
    where appointment.id = appointment_uuid and appointment.clinic_id = clinic_uuid and appointment.deleted_at is null;
    if not found then raise exception 'DOCUMENT_APPOINTMENT_INVALID' using errcode = 'foreign_key_violation'; end if;
    if patient_uuid is null then patient_uuid := linked_patient_uuid;
    elsif patient_uuid <> linked_patient_uuid then
      raise exception 'DOCUMENT_APPOINTMENT_PATIENT_MISMATCH' using errcode = 'foreign_key_violation';
    end if;
    if professional_uuid is null then professional_uuid := linked_professional_uuid;
    elsif professional_uuid <> linked_professional_uuid then
      raise exception 'DOCUMENT_APPOINTMENT_PROFESSIONAL_MISMATCH' using errcode = 'foreign_key_violation';
    end if;
  end if;

  if patient_uuid is not null and not exists (
    select 1 from public.patients patient
    where patient.id = patient_uuid and patient.clinic_id = clinic_uuid and patient.deleted_at is null
  ) then raise exception 'DOCUMENT_PATIENT_INVALID' using errcode = 'foreign_key_violation'; end if;
  if professional_uuid is not null and not exists (
    select 1 from public.clinic_members member
    where member.id = professional_uuid
      and member.clinic_id = clinic_uuid
      and member.status = 'active'
      and member.deleted_at is null
  ) then
    raise exception 'DOCUMENT_PROFESSIONAL_INVALID' using errcode = 'foreign_key_violation';
  end if;

  select version.id
  into version_uuid
  from public.document_template_versions version
  where version.template_id = template_uuid
    and version.clinic_id = clinic_uuid
  order by version.version_number desc
  limit 1;

  if desired_status = 'issued' then
    generated_number := public.next_clinic_document_number(clinic_uuid, actor_uuid);
  end if;

  insert into public.generated_documents (
    clinic_id,
    template_id,
    template_version_id,
    patient_id,
    appointment_id,
    encounter_id,
    financial_entry_id,
    professional_member_id,
    document_number,
    title,
    content,
    status,
    issued_at,
    expires_at,
    metadata,
    created_by,
    updated_by
  )
  values (
    clinic_uuid,
    template_uuid,
    version_uuid,
    patient_uuid,
    appointment_uuid,
    encounter_uuid,
    financial_uuid,
    professional_uuid,
    generated_number,
    document_payload->>'title',
    document_payload->>'content',
    desired_status,
    case when desired_status = 'issued' then now() else null end,
    nullif(document_payload->>'expires_at', '')::date,
    coalesce(document_payload->'metadata', '{}'::jsonb),
    actor_uuid,
    actor_uuid
  )
  returning id into saved_uuid;

  insert into public.generated_document_events (
    clinic_id, document_id, event_type, details, created_by, updated_by
  )
  values (
    clinic_uuid,
    saved_uuid,
    case when desired_status = 'issued' then 'issued' else 'draft_created' end,
    jsonb_build_object('document_number', generated_number, 'source', 'documents_workspace'),
    actor_uuid,
    actor_uuid
  );

  return saved_uuid;
end;
$$;

revoke all on function public.save_generated_document_transaction(jsonb) from public, anon;
grant execute on function public.save_generated_document_transaction(jsonb) to authenticated;

create or replace function public.issue_generated_document_transaction(document_uuid uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_uuid uuid := auth.uid();
  target public.generated_documents%rowtype;
  generated_number text;
begin
  select * into target
  from public.generated_documents
  where id = document_uuid and deleted_at is null
  for update;

  if target.id is null then raise exception 'DOCUMENT_NOT_FOUND' using errcode = 'P0002'; end if;
  if not (
    public.user_has_permission(target.clinic_id, 'documents', 'create', actor_uuid)
    or public.user_has_permission(target.clinic_id, 'documents', 'manage', actor_uuid)
  ) then
    raise exception 'DOCUMENT_ISSUE_PERMISSION_REQUIRED' using errcode = '42501';
  end if;
  if target.status <> 'draft' then
    raise exception 'DOCUMENT_NOT_DRAFT' using errcode = 'check_violation';
  end if;

  generated_number := public.next_clinic_document_number(target.clinic_id, actor_uuid);
  update public.generated_documents
  set status = 'issued',
      document_number = generated_number,
      issued_at = now(),
      updated_by = actor_uuid
  where id = target.id;

  insert into public.generated_document_events (
    clinic_id, document_id, event_type, details, created_by, updated_by
  ) values (
    target.clinic_id, target.id, 'issued',
    jsonb_build_object('document_number', generated_number, 'source', 'document_history'),
    actor_uuid, actor_uuid
  );

  return generated_number;
end;
$$;

revoke all on function public.issue_generated_document_transaction(uuid) from public, anon;
grant execute on function public.issue_generated_document_transaction(uuid) to authenticated;

create or replace function public.cancel_generated_document_transaction(
  document_uuid uuid,
  cancellation_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_uuid uuid := auth.uid();
  target public.generated_documents%rowtype;
begin
  select * into target
  from public.generated_documents
  where id = document_uuid and deleted_at is null
  for update;

  if target.id is null then raise exception 'DOCUMENT_NOT_FOUND' using errcode = 'P0002'; end if;
  if not public.user_has_permission(target.clinic_id, 'documents', 'manage', actor_uuid) then
    raise exception 'DOCUMENT_MANAGE_PERMISSION_REQUIRED' using errcode = '42501';
  end if;
  if target.status = 'cancelled' then raise exception 'DOCUMENT_ALREADY_CANCELLED' using errcode = 'check_violation'; end if;
  if length(trim(coalesce(cancellation_note, ''))) < 5 then
    raise exception 'DOCUMENT_CANCELLATION_REASON_REQUIRED' using errcode = 'check_violation';
  end if;

  update public.generated_documents
  set status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = actor_uuid,
      cancellation_reason = trim(cancellation_note),
      updated_by = actor_uuid
  where id = target.id;

  insert into public.generated_document_events (
    clinic_id, document_id, event_type, details, created_by, updated_by
  ) values (
    target.clinic_id, target.id, 'cancelled',
    jsonb_build_object('reason', trim(cancellation_note), 'previous_status', target.status),
    actor_uuid, actor_uuid
  );
end;
$$;

revoke all on function public.cancel_generated_document_transaction(uuid, text) from public, anon;
grant execute on function public.cancel_generated_document_transaction(uuid, text) to authenticated;

create or replace function public.seed_clinic_document_templates(
  clinic_uuid uuid,
  actor_uuid uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.document_templates (
    clinic_id, template_type, name, description, legal_basis, content, created_by, updated_by
  )
  select clinic_uuid, template_type::public.document_template_type, name, description, legal_basis, content, actor_uuid, actor_uuid
  from (
    values
      (
        'service_contract',
        'Contrato de prestação de serviços clínicos',
        'Instrumento orientativo para formalizar serviços, valores e responsabilidades.',
        'Código Civil, Código de Defesa do Consumidor e LGPD. Recomenda-se revisão jurídica conforme especialidade e operação da clínica.',
        'CONTRATO DE PRESTAÇÃO DE SERVIÇOS CLÍNICOS\n\nCONTRATANTE: {{paciente_nome}}, CPF {{paciente_cpf}}.\nCONTRATADA: {{clinica_nome}}, CNPJ/CPF {{clinica_documento}}.\n\nOBJETO\nPrestação do serviço {{servico_nome}}, conforme indicação profissional, condições informadas e normas éticas aplicáveis.\n\nVALOR E PAGAMENTO\nValor: {{valor}}. Vencimento: {{vencimento}}. Serviços adicionais dependerão de informação e concordância prévias.\n\nDADOS PESSOAIS E SIGILO\nOs dados necessários serão tratados para assistência, gestão administrativa, cumprimento de obrigações legais e exercício regular de direitos, com controles de acesso e rastreabilidade.\n\nOBSERVAÇÕES\n{{observacoes}}\n\n{{cidade_data}}\n\nCONTRATANTE: ____________________________________\nCONTRATADA: _____________________________________'
      ),
      (
        'lgpd_consent',
        'Termo de ciência sobre privacidade e dados de saúde',
        'Aviso transparente sobre finalidades e proteção de dados, sem tratar o consentimento como única base legal.',
        'LGPD, especialmente princípios, transparência, direitos do titular, tutela da saúde, obrigações legais, exercício regular de direitos e medidas de segurança.',
        'TERMO DE CIÊNCIA SOBRE PRIVACIDADE E DADOS DE SAÚDE\n\nTITULAR: {{paciente_nome}}, CPF {{paciente_cpf}}.\nCONTROLADOR: {{clinica_nome}}, CNPJ/CPF {{clinica_documento}}.\n\nFINALIDADES\nOs dados pessoais e dados de saúde poderão ser tratados para identificação, cadastro, agendamento, assistência, prontuário, faturamento, emissão de documentos, comunicação relacionada ao cuidado, cumprimento de obrigações legais e exercício regular de direitos.\n\nPROTEÇÃO E ACESSO\nA clínica deverá adotar controles de acesso, rastreabilidade, sigilo profissional e medidas técnicas e administrativas compatíveis com a sensibilidade das informações.\n\nDIREITOS E CANAL DE CONTATO\nO titular poderá solicitar informações e exercer os direitos aplicáveis por meio de {{clinica_contato}}, observados os limites legais, regulatórios e de guarda de prontuário.\n\nEsta ciência não substitui a identificação da hipótese legal adequada para cada finalidade.\n\n{{cidade_data}}\n\nTITULAR/RESPONSÁVEL: _____________________________'
      ),
      (
        'procedure_consent',
        'Consentimento livre e esclarecido para procedimento',
        'Modelo orientativo a ser individualizado com riscos, benefícios e alternativas do procedimento.',
        'Autonomia do paciente, dever de informação, normas éticas profissionais e LGPD. Exige adaptação clínica e validação pelo responsável técnico.',
        'TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO\n\nPACIENTE: {{paciente_nome}}\nPROCEDIMENTO: {{servico_nome}}\nPROFISSIONAL: {{profissional_nome}} - {{profissional_registro}}\n\nFINALIDADE E BENEFÍCIOS ESPERADOS\n{{procedimento_finalidade}}\n\nRISCOS E POSSÍVEIS INTERCORRÊNCIAS\n{{procedimento_riscos}}\n\nALTERNATIVAS E CONSEQUÊNCIAS DA NÃO REALIZAÇÃO\n{{procedimento_alternativas}}\n\nCUIDADOS E ORIENTAÇÕES\n{{procedimento_cuidados}}\n\nDeclaro que recebi explicações compreensíveis, tive oportunidade de fazer perguntas e autorizo a realização do procedimento descrito.\n\n{{cidade_data}}\n\nPACIENTE/RESPONSÁVEL: ____________________________\nPROFISSIONAL: ____________________________________'
      ),
      (
        'payment_acknowledgement',
        'Termo de ciência de pagamento pendente',
        'Reconhecimento administrativo de valor em aberto, sem novação automática da obrigação.',
        'Código Civil, Código de Defesa do Consumidor e dever de transparência nas relações de consumo.',
        'TERMO DE CIÊNCIA DE PAGAMENTO PENDENTE\n\nPACIENTE/RESPONSÁVEL: {{paciente_nome}}, CPF {{paciente_cpf}}.\nREFERÊNCIA: {{servico_nome}}.\nVALOR EM ABERTO: {{valor}}.\nVENCIMENTO: {{vencimento}}.\n\nDeclaro ciência do valor informado e dos canais disponibilizados para pagamento e esclarecimentos.\n\nOBSERVAÇÕES\n{{observacoes}}\n\n{{cidade_data}}\n\nASSINATURA: ______________________________________'
      ),
      (
        'attendance_declaration',
        'Declaração de comparecimento',
        'Comprovação administrativa da presença do paciente na clínica.',
        'Documento administrativo emitido com base no registro de atendimento e sujeito às regras de sigilo.',
        'DECLARAÇÃO DE COMPARECIMENTO\n\nDeclaramos que {{paciente_nome}} compareceu à {{clinica_nome}} em {{data_atendimento}}, para atendimento com {{profissional_nome}}.\n\nHORÁRIO: {{horario_atendimento}}.\n\nDocumento emitido a pedido do interessado, sem descrição de diagnóstico ou condição clínica.\n\n{{cidade_data}}\n\n{{clinica_nome}}\n{{profissional_nome}} - {{profissional_registro}}'
      ),
      (
        'receipt',
        'Recibo de pagamento de serviço',
        'Comprovante de pagamento vinculado ao paciente, atendimento ou lançamento financeiro.',
        'Código Civil, legislação tributária aplicável e dever de transparência. A clínica deve validar requisitos fiscais com sua contabilidade.',
        'RECIBO\n\nRecebemos de {{paciente_nome}}, CPF {{paciente_cpf}}, a quantia de {{valor}}, referente a {{servico_nome}}.\n\nFORMA DE PAGAMENTO: {{forma_pagamento}}.\nDATA DO PAGAMENTO: {{data_pagamento}}.\n\nPara maior clareza, firmamos o presente recibo.\n\n{{cidade_data}}\n\n{{clinica_nome}}\nCNPJ/CPF {{clinica_documento}}'
      ),
      (
        'other',
        'Autorização específica para uso de imagem',
        'Autorização opcional, destacada e revogável para finalidade determinada.',
        'Direito de imagem, Código Civil e LGPD. A finalidade, os canais e o prazo devem ser definidos de forma específica.',
        'AUTORIZAÇÃO ESPECÍFICA PARA USO DE IMAGEM\n\nAUTORIZANTE: {{paciente_nome}}, CPF {{paciente_cpf}}.\nAUTORIZADA: {{clinica_nome}}.\n\nFINALIDADE ESPECÍFICA\n{{finalidade_imagem}}\n\nCANAIS E PRAZO\n{{canais_imagem}}\n{{prazo_imagem}}\n\nA autorização é opcional, não condiciona a assistência e poderá ser revogada para usos futuros por solicitação ao canal {{clinica_contato}}, sem afetar utilizações lícitas já realizadas.\n\n{{cidade_data}}\n\nAUTORIZANTE: _____________________________________'
      )
  ) defaults(template_type, name, description, legal_basis, content)
  where not exists (
    select 1 from public.document_templates template
    where template.clinic_id = clinic_uuid
      and template.name = defaults.name
      and template.deleted_at is null
  );

  insert into public.document_template_versions (
    clinic_id, template_id, version_number, content, legal_basis, created_by
  )
  select template.clinic_id, template.id, template.version_number, template.content, template.legal_basis, actor_uuid
  from public.document_templates template
  where template.clinic_id = clinic_uuid
    and template.deleted_at is null
    and not exists (
      select 1 from public.document_template_versions version
      where version.template_id = template.id
        and version.version_number = template.version_number
    );
end;
$$;

revoke all on function public.seed_clinic_document_templates(uuid, uuid) from public, anon, authenticated;
grant execute on function public.seed_clinic_document_templates(uuid, uuid) to service_role;

create or replace function public.seed_document_templates_after_clinic_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_clinic_document_templates(new.id, new.created_by);
  return new;
end;
$$;

drop trigger if exists seed_document_templates_after_clinic_insert on public.clinics;
create trigger seed_document_templates_after_clinic_insert
after insert on public.clinics
for each row execute function public.seed_document_templates_after_clinic_insert();

do $$
declare
  clinic_record record;
begin
  for clinic_record in
    select id, created_by from public.clinics where deleted_at is null
  loop
    perform public.seed_clinic_document_templates(clinic_record.id, clinic_record.created_by);
  end loop;
end $$;

insert into public.app_migration_history (migration_name, description, source, notes)
values (
  '037_intelligent_document_issuance.sql',
  'Emissao documental transacional, numeracao por clinica, eventos, cancelamento e modelos padrao.',
  'supabase_sql_editor',
  'Central documental vinculavel a paciente, consulta, prontuario ou financeiro.'
)
on conflict (migration_name) do nothing;
