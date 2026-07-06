-- CliniCore - Motor clinico configuravel e formularios por especialidade.
-- Execute after 037_intelligent_document_issuance.sql.

alter table public.medical_record_preferences
  add column if not exists default_specialty_slug text not null default 'general_medicine',
  add column if not exists allow_professional_template_choice boolean not null default true;

create table if not exists public.clinical_form_templates (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  specialty_slug text not null,
  name text not null,
  description text,
  icon_key text not null default 'stethoscope',
  version_number integer not null default 1 check (version_number > 0),
  definition jsonb not null default '{"sections":[]}'::jsonb,
  is_system boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint clinical_form_templates_slug_format
    check (specialty_slug ~ '^[a-z][a-z0-9_]{2,79}$'),
  constraint clinical_form_templates_definition_shape
    check (jsonb_typeof(definition) = 'object' and jsonb_typeof(definition->'sections') = 'array')
);

create unique index if not exists clinical_form_templates_clinic_slug_unique
on public.clinical_form_templates (clinic_id, specialty_slug)
where deleted_at is null;

create index if not exists clinical_form_templates_active_idx
on public.clinical_form_templates (clinic_id, active, sort_order, name)
where deleted_at is null;

create table if not exists public.clinical_form_assignments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  template_id uuid not null references public.clinical_form_templates(id) on delete cascade,
  professional_member_id uuid references public.clinic_members(id) on delete cascade,
  service_id uuid references public.clinic_services(id) on delete cascade,
  priority integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint clinical_form_assignment_scope check (
    professional_member_id is not null or service_id is not null
  )
);

create unique index if not exists clinical_form_assignments_professional_unique
on public.clinical_form_assignments (clinic_id, template_id, professional_member_id)
where professional_member_id is not null and service_id is null and deleted_at is null;

create unique index if not exists clinical_form_assignments_service_unique
on public.clinical_form_assignments (clinic_id, template_id, service_id)
where service_id is not null and professional_member_id is null and deleted_at is null;

create index if not exists clinical_form_assignments_resolve_idx
on public.clinical_form_assignments (clinic_id, professional_member_id, service_id, priority)
where active = true and deleted_at is null;

create table if not exists public.clinical_form_instances (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  template_id uuid not null references public.clinical_form_templates(id),
  medical_record_id uuid not null references public.medical_records(id) on delete cascade,
  encounter_id uuid not null references public.clinical_encounters(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id),
  patient_id uuid not null references public.patients(id),
  professional_member_id uuid not null references public.clinic_members(id),
  performed_by uuid references auth.users(id),
  template_version integer not null,
  template_snapshot jsonb not null,
  responses jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'completed', 'corrected')),
  revision_number integer not null default 1 check (revision_number > 0),
  is_current boolean not null default true,
  corrected_from_id uuid references public.clinical_form_instances(id),
  correction_reason text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint clinical_form_instances_responses_object check (jsonb_typeof(responses) = 'object')
);

create unique index if not exists clinical_form_instances_current_encounter_unique
on public.clinical_form_instances (encounter_id)
where is_current = true and deleted_at is null;

create unique index if not exists clinical_form_instances_revision_unique
on public.clinical_form_instances (medical_record_id, revision_number)
where deleted_at is null;

create index if not exists clinical_form_instances_patient_idx
on public.clinical_form_instances (clinic_id, patient_id, created_at desc)
where deleted_at is null;

create index if not exists clinical_form_instances_professional_idx
on public.clinical_form_instances (clinic_id, professional_member_id, created_at desc)
where deleted_at is null;

create table if not exists public.clinical_observations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  form_instance_id uuid not null references public.clinical_form_instances(id) on delete cascade,
  medical_record_id uuid not null references public.medical_records(id) on delete cascade,
  encounter_id uuid not null references public.clinical_encounters(id) on delete cascade,
  patient_id uuid not null references public.patients(id),
  professional_member_id uuid not null references public.clinic_members(id),
  field_key text not null,
  code_system text,
  code text,
  display text not null,
  value_type text not null check (value_type in ('text', 'number', 'boolean', 'date', 'choice', 'json')),
  value_text text,
  value_number numeric,
  value_boolean boolean,
  value_date date,
  value_json jsonb,
  unit text,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

create index if not exists clinical_observations_patient_code_idx
on public.clinical_observations (clinic_id, patient_id, code_system, code, observed_at desc)
where deleted_at is null;

create index if not exists clinical_observations_instance_idx
on public.clinical_observations (form_instance_id, field_key)
where deleted_at is null;

drop trigger if exists set_clinical_form_templates_updated_at on public.clinical_form_templates;
create trigger set_clinical_form_templates_updated_at
before update on public.clinical_form_templates
for each row execute function public.set_updated_at();

drop trigger if exists set_clinical_form_assignments_updated_at on public.clinical_form_assignments;
create trigger set_clinical_form_assignments_updated_at
before update on public.clinical_form_assignments
for each row execute function public.set_updated_at();

drop trigger if exists set_clinical_form_instances_updated_at on public.clinical_form_instances;
create trigger set_clinical_form_instances_updated_at
before update on public.clinical_form_instances
for each row execute function public.set_updated_at();

drop trigger if exists set_clinical_observations_updated_at on public.clinical_observations;
create trigger set_clinical_observations_updated_at
before update on public.clinical_observations
for each row execute function public.set_updated_at();

alter table public.clinical_form_templates enable row level security;
alter table public.clinical_form_assignments enable row level security;
alter table public.clinical_form_instances enable row level security;
alter table public.clinical_observations enable row level security;

create or replace function public.can_access_clinical_record(
  clinic_uuid uuid,
  professional_member_uuid uuid,
  required_action public.permission_action default 'view',
  user_uuid uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin(user_uuid)
    or public.user_has_permission(clinic_uuid, 'medical_records', 'manage', user_uuid)
    or (
      professional_member_uuid = public.current_clinic_member_id(clinic_uuid)
      and public.user_has_permission(clinic_uuid, 'medical_records', required_action, user_uuid)
      and public.user_has_permission(clinic_uuid, 'medical_records', 'access_medical_record', user_uuid)
    );
$$;

revoke all on function public.can_access_clinical_record(uuid, uuid, public.permission_action, uuid)
from public, anon;
grant execute on function public.can_access_clinical_record(uuid, uuid, public.permission_action, uuid)
to authenticated, service_role;

drop policy if exists "clinical_form_templates_select_authorized" on public.clinical_form_templates;
create policy "clinical_form_templates_select_authorized"
on public.clinical_form_templates for select to authenticated
using (
  deleted_at is null
  and public.user_has_permission(clinic_id, 'medical_records', 'view')
  and public.user_has_permission(clinic_id, 'medical_records', 'access_medical_record')
);

drop policy if exists "clinical_form_templates_manage_authorized" on public.clinical_form_templates;
create policy "clinical_form_templates_manage_authorized"
on public.clinical_form_templates for all to authenticated
using (public.user_has_permission(clinic_id, 'medical_records', 'manage'))
with check (public.user_has_permission(clinic_id, 'medical_records', 'manage'));

drop policy if exists "clinical_form_assignments_select_authorized" on public.clinical_form_assignments;
create policy "clinical_form_assignments_select_authorized"
on public.clinical_form_assignments for select to authenticated
using (
  deleted_at is null
  and public.user_has_permission(clinic_id, 'medical_records', 'view')
  and public.user_has_permission(clinic_id, 'medical_records', 'access_medical_record')
);

drop policy if exists "clinical_form_assignments_manage_authorized" on public.clinical_form_assignments;
create policy "clinical_form_assignments_manage_authorized"
on public.clinical_form_assignments for all to authenticated
using (public.user_has_permission(clinic_id, 'medical_records', 'manage'))
with check (public.user_has_permission(clinic_id, 'medical_records', 'manage'));

drop policy if exists "clinical_form_instances_select_authorized" on public.clinical_form_instances;
create policy "clinical_form_instances_select_authorized"
on public.clinical_form_instances for select to authenticated
using (
  deleted_at is null
  and public.can_access_clinical_record(clinic_id, professional_member_id, 'view')
);

drop policy if exists "clinical_form_instances_insert_authorized" on public.clinical_form_instances;
create policy "clinical_form_instances_insert_authorized"
on public.clinical_form_instances for insert to authenticated
with check (public.can_access_clinical_record(clinic_id, professional_member_id, 'create'));

drop policy if exists "clinical_form_instances_update_authorized" on public.clinical_form_instances;
create policy "clinical_form_instances_update_authorized"
on public.clinical_form_instances for update to authenticated
using (public.can_access_clinical_record(clinic_id, professional_member_id, 'edit'))
with check (public.can_access_clinical_record(clinic_id, professional_member_id, 'edit'));

drop policy if exists "clinical_observations_select_authorized" on public.clinical_observations;
create policy "clinical_observations_select_authorized"
on public.clinical_observations for select to authenticated
using (
  deleted_at is null
  and public.can_access_clinical_record(clinic_id, professional_member_id, 'view')
);

drop policy if exists "clinical_observations_insert_authorized" on public.clinical_observations;
create policy "clinical_observations_insert_authorized"
on public.clinical_observations for insert to authenticated
with check (public.can_access_clinical_record(clinic_id, professional_member_id, 'edit'));

grant select, insert, update on public.clinical_form_templates to authenticated;
grant select, insert, update on public.clinical_form_assignments to authenticated;
grant select, insert, update on public.clinical_form_instances to authenticated;
grant select, insert on public.clinical_observations to authenticated;

create or replace function public.seed_clinical_form_templates(
  clinic_uuid uuid,
  actor_uuid uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.clinical_form_templates (
    clinic_id, specialty_slug, name, description, icon_key,
    definition, is_system, active, sort_order, created_by, updated_by
  )
  select
    clinic_uuid, specialty_slug, name, description, icon_key,
    definition, true, true, sort_order, actor_uuid, actor_uuid
  from (
    values
      (
        'general_medicine',
        'Clínica geral',
        'Avaliação clínica abrangente para consultas iniciais e retornos.',
        'stethoscope',
        10,
        $json${
          "sections": [
            {"key":"history","title":"História e antecedentes","description":"Contexto longitudinal e fatores de risco.","columns":2,"fields":[
              {"key":"symptom_onset","label":"Início e evolução dos sintomas","type":"textarea","required":true,"placeholder":"Descreva início, duração e progressão."},
              {"key":"associated_symptoms","label":"Sintomas associados","type":"textarea","required":false},
              {"key":"personal_history","label":"Antecedentes pessoais","type":"textarea","required":false},
              {"key":"family_history","label":"Antecedentes familiares","type":"textarea","required":false},
              {"key":"habits","label":"Hábitos e estilo de vida","type":"multiselect","required":false,"options":[{"value":"smoking","label":"Tabagismo"},{"value":"alcohol","label":"Etilismo"},{"value":"sedentary","label":"Sedentarismo"},{"value":"physical_activity","label":"Atividade física"}]}
            ]},
            {"key":"review","title":"Revisão e exame","description":"Achados direcionados por sistemas.","columns":2,"fields":[
              {"key":"systems_review","label":"Revisão de sistemas","type":"textarea","required":false},
              {"key":"general_condition","label":"Estado geral","type":"select","required":true,"options":[{"value":"good","label":"Bom"},{"value":"regular","label":"Regular"},{"value":"poor","label":"Comprometido"}]},
              {"key":"hydration","label":"Hidratação","type":"select","required":false,"options":[{"value":"normal","label":"Hidratado"},{"value":"mild","label":"Desidratação leve"},{"value":"moderate_severe","label":"Desidratação moderada/grave"}]},
              {"key":"targeted_exam","label":"Exame direcionado","type":"textarea","required":false}
            ]}
          ]
        }$json$::jsonb
      ),
      (
        'cardiology',
        'Cardiologia',
        'Sintomas cardiovasculares, capacidade funcional, riscos e exame cardiológico.',
        'heart-pulse',
        20,
        $json${
          "sections": [
            {"key":"symptoms","title":"Sintomas cardiovasculares","columns":2,"fields":[
              {"key":"chest_pain","label":"Características da dor torácica","type":"textarea","required":false},
              {"key":"dyspnea_nyha","label":"Classe funcional NYHA","type":"select","required":false,"options":[{"value":"I","label":"I - Sem limitação"},{"value":"II","label":"II - Limitação leve"},{"value":"III","label":"III - Limitação importante"},{"value":"IV","label":"IV - Sintomas em repouso"}]},
              {"key":"palpitations","label":"Palpitações","type":"textarea","required":false},
              {"key":"syncope","label":"Síncope ou pré-síncope","type":"textarea","required":false},
              {"key":"edema","label":"Edema","type":"select","required":false,"options":[{"value":"absent","label":"Ausente"},{"value":"mild","label":"Leve"},{"value":"moderate","label":"Moderado"},{"value":"severe","label":"Importante"}]}
            ]},
            {"key":"risk_exam","title":"Risco e exame cardiológico","columns":2,"fields":[
              {"key":"cardiovascular_risks","label":"Fatores de risco","type":"multiselect","required":true,"options":[{"value":"hypertension","label":"Hipertensão"},{"value":"diabetes","label":"Diabetes"},{"value":"dyslipidemia","label":"Dislipidemia"},{"value":"smoking","label":"Tabagismo"},{"value":"obesity","label":"Obesidade"},{"value":"family_history","label":"História familiar"}]},
              {"key":"heart_rhythm","label":"Ritmo cardíaco","type":"select","required":true,"options":[{"value":"regular","label":"Regular"},{"value":"irregular","label":"Irregular"}]},
              {"key":"heart_sounds","label":"Bulhas e sopros","type":"textarea","required":false},
              {"key":"ecg_summary","label":"Resumo do ECG","type":"textarea","required":false},
              {"key":"cardiac_risk_score","label":"Escore de risco documentado","type":"text","required":false,"placeholder":"Informe instrumento, resultado e data."}
            ]}
          ]
        }$json$::jsonb
      ),
      (
        'pediatrics',
        'Pediatria',
        'Crescimento, desenvolvimento, alimentação, vacinação e contexto familiar.',
        'baby',
        30,
        $json${
          "sections": [
            {"key":"guardian_birth","title":"Responsável e história perinatal","columns":2,"fields":[
              {"key":"guardian_name","label":"Responsável presente","type":"text","required":true},
              {"key":"guardian_relationship","label":"Vínculo com a criança","type":"text","required":true},
              {"key":"gestational_age_birth","label":"Idade gestacional ao nascer","type":"number","required":false,"unit":"semanas","min":20,"max":45},
              {"key":"birth_weight","label":"Peso ao nascer","type":"number","required":false,"unit":"g","min":300,"max":7000},
              {"key":"perinatal_history","label":"Intercorrências perinatais","type":"textarea","required":false}
            ]},
            {"key":"development","title":"Crescimento e desenvolvimento","columns":2,"fields":[
              {"key":"feeding","label":"Alimentação atual","type":"textarea","required":true},
              {"key":"vaccination_status","label":"Situação vacinal","type":"select","required":true,"options":[{"value":"updated","label":"Atualizada"},{"value":"delayed","label":"Atrasada"},{"value":"unknown","label":"Não verificada"}]},
              {"key":"development_milestones","label":"Marcos do desenvolvimento","type":"textarea","required":true},
              {"key":"school_social_context","label":"Contexto escolar e social","type":"textarea","required":false},
              {"key":"pediatric_warning_signs","label":"Sinais de alerta","type":"textarea","required":false}
            ]}
          ]
        }$json$::jsonb
      ),
      (
        'gynecology_obstetrics',
        'Ginecologia e obstetrícia',
        'História ginecológica, obstétrica, reprodutiva e rastreamentos.',
        'venus',
        40,
        $json${
          "sections": [
            {"key":"gyne_history","title":"História ginecológica","columns":2,"fields":[
              {"key":"last_menstrual_period","label":"Data da última menstruação","type":"date","required":false,"code_system":"LOINC","code":"8665-2","reportable":true},
              {"key":"menstrual_pattern","label":"Padrão menstrual","type":"textarea","required":false},
              {"key":"contraception","label":"Método contraceptivo","type":"text","required":false},
              {"key":"pregnancy_possibility","label":"Possibilidade de gestação","type":"boolean","required":true},
              {"key":"gynecologic_symptoms","label":"Sintomas ginecológicos","type":"textarea","required":false}
            ]},
            {"key":"obstetric_screening","title":"História obstétrica e rastreamento","columns":2,"fields":[
              {"key":"obstetric_history","label":"História obstétrica","type":"textarea","required":false,"placeholder":"Gestações, partos, abortamentos e intercorrências."},
              {"key":"gestational_age_current","label":"Idade gestacional atual","type":"number","required":false,"unit":"semanas","min":0,"max":45},
              {"key":"cervical_screening","label":"Rastreamento cervical","type":"text","required":false},
              {"key":"breast_screening","label":"Rastreamento mamário","type":"text","required":false},
              {"key":"gyne_exam","label":"Exame ginecológico direcionado","type":"textarea","required":false}
            ]}
          ]
        }$json$::jsonb
      ),
      (
        'mental_health',
        'Saúde mental',
        'Exame do estado mental, risco, escalas e plano terapêutico com sigilo reforçado.',
        'brain',
        50,
        $json${
          "sections": [
            {"key":"mental_status","title":"Exame do estado mental","columns":2,"fields":[
              {"key":"appearance_behavior","label":"Aparência e comportamento","type":"textarea","required":true},
              {"key":"consciousness_orientation","label":"Consciência e orientação","type":"textarea","required":true},
              {"key":"mood_affect","label":"Humor e afeto","type":"textarea","required":true},
              {"key":"thought","label":"Curso e conteúdo do pensamento","type":"textarea","required":true},
              {"key":"perception","label":"Sensopercepção","type":"textarea","required":false},
              {"key":"insight_judgment","label":"Crítica e juízo","type":"textarea","required":false}
            ]},
            {"key":"risk_scales","title":"Risco e instrumentos","columns":2,"fields":[
              {"key":"suicide_risk","label":"Risco de autoagressão/suicídio","type":"select","required":true,"alert_values":["moderate","high"],"options":[{"value":"absent","label":"Não identificado"},{"value":"low","label":"Baixo"},{"value":"moderate","label":"Moderado"},{"value":"high","label":"Alto/imediato"}]},
              {"key":"protective_factors","label":"Fatores de proteção","type":"textarea","required":false},
              {"key":"phq9_score","label":"PHQ-9","type":"number","required":false,"min":0,"max":27,"unit":"pontos"},
              {"key":"gad7_score","label":"GAD-7","type":"number","required":false,"min":0,"max":21,"unit":"pontos"},
              {"key":"safety_plan","label":"Plano de segurança","type":"textarea","required":false},
              {"key":"therapeutic_plan","label":"Plano terapêutico compartilhado","type":"textarea","required":true}
            ]}
          ]
        }$json$::jsonb
      ),
      (
        'dentistry',
        'Odontologia',
        'Avaliação odontológica, periodontal, plano por elemento e materiais utilizados.',
        'smile',
        60,
        $json${
          "sections": [
            {"key":"oral_assessment","title":"Avaliação oral","columns":2,"fields":[
              {"key":"dental_history","label":"Histórico odontológico","type":"textarea","required":true},
              {"key":"oral_hygiene","label":"Higiene oral","type":"select","required":true,"options":[{"value":"good","label":"Boa"},{"value":"regular","label":"Regular"},{"value":"poor","label":"Insatisfatória"}]},
              {"key":"periodontal_condition","label":"Condição periodontal","type":"textarea","required":false},
              {"key":"occlusion_tmj","label":"Oclusão e ATM","type":"textarea","required":false},
              {"key":"soft_tissues","label":"Tecidos moles","type":"textarea","required":false}
            ]},
            {"key":"procedure","title":"Plano e procedimento","columns":2,"fields":[
              {"key":"tooth_surface","label":"Elemento e superfície","type":"text","required":false,"placeholder":"Ex.: 16 - oclusal"},
              {"key":"odontogram_notes","label":"Registro odontográfico","type":"textarea","required":true},
              {"key":"procedure_performed","label":"Procedimento realizado","type":"textarea","required":false},
              {"key":"anesthesia","label":"Anestésico/técnica","type":"text","required":false},
              {"key":"dental_materials","label":"Materiais utilizados","type":"textarea","required":false},
              {"key":"postoperative_guidance","label":"Orientações pós-procedimento","type":"textarea","required":false}
            ]}
          ]
        }$json$::jsonb
      ),
      (
        'physiotherapy',
        'Fisioterapia',
        'Avaliação cinético-funcional, dor, mobilidade, metas e plano de reabilitação.',
        'accessibility',
        70,
        $json${
          "sections": [
            {"key":"functional_assessment","title":"Avaliação funcional","columns":2,"fields":[
              {"key":"referral_diagnosis","label":"Diagnóstico/encaminhamento","type":"text","required":false},
              {"key":"pain_score","label":"Escala de dor","type":"scale","required":true,"min":0,"max":10,"unit":"/10","code_system":"LOINC","code":"72514-3","reportable":true},
              {"key":"pain_region","label":"Região e característica da dor","type":"textarea","required":true},
              {"key":"range_of_motion","label":"Amplitude de movimento","type":"textarea","required":false},
              {"key":"muscle_strength","label":"Força muscular","type":"textarea","required":false},
              {"key":"functional_limitations","label":"Limitações funcionais","type":"textarea","required":true}
            ]},
            {"key":"rehabilitation","title":"Plano de reabilitação","columns":2,"fields":[
              {"key":"functional_scale","label":"Escala funcional aplicada","type":"text","required":false},
              {"key":"short_term_goals","label":"Metas de curto prazo","type":"textarea","required":true},
              {"key":"long_term_goals","label":"Metas de longo prazo","type":"textarea","required":false},
              {"key":"interventions","label":"Intervenções planejadas/realizadas","type":"textarea","required":true},
              {"key":"home_exercises","label":"Exercícios domiciliares","type":"textarea","required":false}
            ]}
          ]
        }$json$::jsonb
      ),
      (
        'dermatology',
        'Dermatologia',
        'Descrição padronizada de lesões, distribuição, dermatoscopia e registro fotográfico.',
        'scan-face',
        80,
        $json${
          "sections": [
            {"key":"lesion_history","title":"História dermatológica","columns":2,"fields":[
              {"key":"lesion_onset","label":"Início e evolução","type":"textarea","required":true},
              {"key":"lesion_location","label":"Localização anatômica","type":"text","required":true},
              {"key":"associated_derm_symptoms","label":"Sintomas associados","type":"multiselect","required":false,"options":[{"value":"itch","label":"Prurido"},{"value":"pain","label":"Dor"},{"value":"bleeding","label":"Sangramento"},{"value":"burning","label":"Ardor"},{"value":"none","label":"Assintomática"}]},
              {"key":"exposures","label":"Exposições e fatores desencadeantes","type":"textarea","required":false}
            ]},
            {"key":"derm_exam","title":"Exame dermatológico","columns":2,"fields":[
              {"key":"lesion_morphology","label":"Morfologia","type":"textarea","required":true},
              {"key":"lesion_distribution","label":"Distribuição","type":"textarea","required":true},
              {"key":"dermoscopy","label":"Dermatoscopia","type":"textarea","required":false},
              {"key":"photo_consent","label":"Consentimento para fotografia clínica","type":"boolean","required":false},
              {"key":"derm_differential","label":"Diagnósticos diferenciais","type":"textarea","required":false},
              {"key":"derm_procedure","label":"Procedimento/coleta realizada","type":"textarea","required":false}
            ]}
          ]
        }$json$::jsonb
      )
  ) defaults(specialty_slug, name, description, icon_key, sort_order, definition)
  where not exists (
    select 1
    from public.clinical_form_templates template
    where template.clinic_id = clinic_uuid
      and template.specialty_slug = defaults.specialty_slug
      and template.deleted_at is null
  );
end;
$$;

revoke all on function public.seed_clinical_form_templates(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.seed_clinical_form_templates(uuid, uuid) to service_role;

create or replace function public.seed_clinical_forms_after_clinic_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_clinical_form_templates(new.id, new.created_by);
  return new;
end;
$$;

drop trigger if exists seed_clinical_forms_after_clinic_insert on public.clinics;
create trigger seed_clinical_forms_after_clinic_insert
after insert on public.clinics
for each row execute function public.seed_clinical_forms_after_clinic_insert();

do $$
declare
  clinic_record record;
begin
  for clinic_record in
    select id, created_by from public.clinics where deleted_at is null
  loop
    perform public.seed_clinical_form_templates(clinic_record.id, clinic_record.created_by);
  end loop;
end $$;

create or replace function public.save_clinical_form_preferences_transaction(
  preferences_payload jsonb,
  active_specialties text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_uuid uuid := auth.uid();
  clinic_uuid uuid := nullif(preferences_payload->>'clinic_id', '')::uuid;
  default_specialty text := preferences_payload->>'default_specialty_slug';
begin
  if actor_uuid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not public.user_has_permission(clinic_uuid, 'medical_records', 'manage', actor_uuid) then
    raise exception 'MEDICAL_RECORD_MANAGE_PERMISSION_REQUIRED' using errcode = '42501';
  end if;
  if coalesce(array_length(active_specialties, 1), 0) = 0 then
    raise exception 'ACTIVE_SPECIALTY_REQUIRED' using errcode = 'check_violation';
  end if;
  if not (default_specialty = any(active_specialties)) then
    raise exception 'DEFAULT_SPECIALTY_MUST_BE_ACTIVE' using errcode = 'check_violation';
  end if;

  update public.clinical_form_templates
  set active = specialty_slug = any(active_specialties),
      updated_by = actor_uuid
  where clinic_id = clinic_uuid and deleted_at is null;

  insert into public.medical_record_preferences (
    clinic_id, required_fields, allow_completed_corrections,
    require_correction_reason, show_nursing_summary, default_specialty_slug,
    allow_professional_template_choice, created_by, updated_by, deleted_at
  ) values (
    clinic_uuid,
    coalesce(
      array(select jsonb_array_elements_text(coalesce(preferences_payload->'required_fields', '[]'::jsonb))),
      array['assessment', 'plan']::text[]
    ),
    coalesce((preferences_payload->>'allow_completed_corrections')::boolean, true),
    coalesce((preferences_payload->>'require_correction_reason')::boolean, true),
    coalesce((preferences_payload->>'show_nursing_summary')::boolean, true),
    default_specialty,
    coalesce((preferences_payload->>'allow_professional_template_choice')::boolean, true),
    actor_uuid, actor_uuid, null
  )
  on conflict (clinic_id) do update
  set required_fields = excluded.required_fields,
      allow_completed_corrections = excluded.allow_completed_corrections,
      require_correction_reason = excluded.require_correction_reason,
      show_nursing_summary = excluded.show_nursing_summary,
      default_specialty_slug = excluded.default_specialty_slug,
      allow_professional_template_choice = excluded.allow_professional_template_choice,
      updated_by = actor_uuid,
      deleted_at = null;
end;
$$;

revoke all on function public.save_clinical_form_preferences_transaction(jsonb, text[])
from public, anon;
grant execute on function public.save_clinical_form_preferences_transaction(jsonb, text[])
to authenticated;

create or replace function public.save_advanced_medical_record_transaction(
  record_payload jsonb,
  complete_record boolean default false,
  transition_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_uuid uuid := auth.uid();
  clinic_uuid uuid := nullif(record_payload->>'clinic_id', '')::uuid;
  encounter_uuid uuid := nullif(record_payload->>'encounter_id', '')::uuid;
  template_uuid uuid := nullif(record_payload->>'clinical_template_id', '')::uuid;
  responses_json jsonb := coalesce(record_payload->'clinical_responses', '{}'::jsonb);
  current_encounter public.clinical_encounters%rowtype;
  selected_template public.clinical_form_templates%rowtype;
  previous_instance public.clinical_form_instances%rowtype;
  saved_record_uuid uuid;
  saved_instance_uuid uuid;
  next_revision integer := 1;
  target_status text;
  section_json jsonb;
  field_json jsonb;
  field_key text;
  field_value jsonb;
  field_type text;
begin
  if actor_uuid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;

  select * into current_encounter
  from public.clinical_encounters
  where id = encounter_uuid and clinic_id = clinic_uuid and deleted_at is null;
  if current_encounter.id is null then raise exception 'ENCOUNTER_NOT_FOUND' using errcode = 'P0002'; end if;

  if not public.can_access_clinical_record(
    current_encounter.clinic_id,
    current_encounter.professional_member_id,
    case when complete_record then 'edit'::public.permission_action else 'edit'::public.permission_action end,
    actor_uuid
  ) then
    raise exception 'MEDICAL_RECORD_PERMISSION_REQUIRED' using errcode = '42501';
  end if;

  if template_uuid is not null then
    select * into selected_template
    from public.clinical_form_templates
    where id = template_uuid
      and clinic_id = clinic_uuid
      and active = true
      and deleted_at is null;
    if selected_template.id is null then raise exception 'CLINICAL_TEMPLATE_NOT_FOUND' using errcode = 'P0002'; end if;
    if jsonb_typeof(responses_json) <> 'object' then raise exception 'CLINICAL_RESPONSES_INVALID' using errcode = 'check_violation'; end if;

    for section_json in select value from jsonb_array_elements(selected_template.definition->'sections')
    loop
      for field_json in select value from jsonb_array_elements(coalesce(section_json->'fields', '[]'::jsonb))
      loop
        field_key := field_json->>'key';
        field_value := responses_json->field_key;
        if complete_record and coalesce((field_json->>'required')::boolean, false) and (
          field_value is null
          or field_value = 'null'::jsonb
          or field_value = '""'::jsonb
          or field_value = '[]'::jsonb
        ) then
          raise exception 'CLINICAL_REQUIRED_FIELD:%', coalesce(field_json->>'label', field_key)
            using errcode = 'check_violation';
        end if;
      end loop;
    end loop;
  end if;

  saved_record_uuid := public.save_medical_record_transaction(
    record_payload,
    complete_record,
    transition_reason
  );

  if template_uuid is null then return saved_record_uuid; end if;

  select * into previous_instance
  from public.clinical_form_instances
  where encounter_id = encounter_uuid and is_current = true and deleted_at is null
  for update;

  target_status := case
    when record_payload->>'status' = 'corrected' then 'corrected'
    when complete_record then 'completed'
    else 'draft'
  end;

  if previous_instance.id is not null
    and previous_instance.status in ('completed', 'corrected')
    and target_status = 'corrected'
  then
    update public.clinical_form_instances
    set is_current = false, updated_by = actor_uuid
    where id = previous_instance.id;
    next_revision := previous_instance.revision_number + 1;
    insert into public.clinical_form_instances (
      clinic_id, template_id, medical_record_id, encounter_id, appointment_id,
      patient_id, professional_member_id, performed_by, template_version,
      template_snapshot, responses, status, revision_number, is_current,
      corrected_from_id, correction_reason, completed_at, created_by, updated_by
    ) values (
      clinic_uuid, template_uuid, saved_record_uuid, encounter_uuid, current_encounter.appointment_id,
      current_encounter.patient_id, current_encounter.professional_member_id, actor_uuid,
      selected_template.version_number, selected_template.definition, responses_json,
      'corrected', next_revision, true, previous_instance.id,
      record_payload->>'correction_reason', now(), actor_uuid, actor_uuid
    ) returning id into saved_instance_uuid;
  elsif previous_instance.id is null then
    insert into public.clinical_form_instances (
      clinic_id, template_id, medical_record_id, encounter_id, appointment_id,
      patient_id, professional_member_id, performed_by, template_version,
      template_snapshot, responses, status, revision_number, is_current,
      completed_at, created_by, updated_by
    ) values (
      clinic_uuid, template_uuid, saved_record_uuid, encounter_uuid, current_encounter.appointment_id,
      current_encounter.patient_id, current_encounter.professional_member_id, actor_uuid,
      selected_template.version_number, selected_template.definition, responses_json,
      target_status, 1, true, case when complete_record then now() else null end,
      actor_uuid, actor_uuid
    ) returning id into saved_instance_uuid;
  else
    if previous_instance.template_id <> template_uuid then
      if previous_instance.status <> 'draft' then
        raise exception 'CLINICAL_TEMPLATE_LOCKED' using errcode = 'check_violation';
      end if;
    end if;
    update public.clinical_form_instances
    set template_id = template_uuid,
        performed_by = actor_uuid,
        template_version = selected_template.version_number,
        template_snapshot = selected_template.definition,
        responses = responses_json,
        status = target_status,
        correction_reason = record_payload->>'correction_reason',
        completed_at = case when complete_record then now() else completed_at end,
        updated_by = actor_uuid
    where id = previous_instance.id
    returning id into saved_instance_uuid;
  end if;

  update public.clinical_observations
  set deleted_at = now(), updated_by = actor_uuid
  where form_instance_id = saved_instance_uuid and deleted_at is null;

  for section_json in select value from jsonb_array_elements(selected_template.definition->'sections')
  loop
    for field_json in select value from jsonb_array_elements(coalesce(section_json->'fields', '[]'::jsonb))
    loop
      field_key := field_json->>'key';
      field_value := responses_json->field_key;
      field_type := coalesce(field_json->>'type', 'text');
      if field_value is not null and field_value <> 'null'::jsonb and field_value <> '""'::jsonb then
        insert into public.clinical_observations (
          clinic_id, form_instance_id, medical_record_id, encounter_id, patient_id,
          professional_member_id, field_key, code_system, code, display, value_type,
          value_text, value_number, value_boolean, value_date, value_json, unit,
          created_by, updated_by
        ) values (
          clinic_uuid, saved_instance_uuid, saved_record_uuid, encounter_uuid,
          current_encounter.patient_id, current_encounter.professional_member_id,
          field_key, field_json->>'code_system', field_json->>'code',
          coalesce(field_json->>'label', field_key),
          case
            when field_type in ('number', 'scale') then 'number'
            when field_type = 'boolean' then 'boolean'
            when field_type = 'date' then 'date'
            when field_type in ('select', 'multiselect') then 'choice'
            when jsonb_typeof(field_value) in ('array', 'object') then 'json'
            else 'text'
          end,
          case when field_type in ('text', 'textarea', 'select') then trim(both '"' from field_value::text) else null end,
          case when field_type in ('number', 'scale') then nullif(trim(both '"' from field_value::text), '')::numeric else null end,
          case when field_type = 'boolean' then field_value::text::boolean else null end,
          case when field_type = 'date' then trim(both '"' from field_value::text)::date else null end,
          case when jsonb_typeof(field_value) in ('array', 'object') then field_value else null end,
          field_json->>'unit', actor_uuid, actor_uuid
        );
      end if;
    end loop;
  end loop;

  return saved_record_uuid;
end;
$$;

revoke all on function public.save_advanced_medical_record_transaction(jsonb, boolean, text)
from public, anon;
grant execute on function public.save_advanced_medical_record_transaction(jsonb, boolean, text)
to authenticated;

revoke execute on function public.save_medical_record_transaction(jsonb, boolean, text)
from authenticated;

-- Remove o atalho de agenda para dados clinicos existentes.
drop policy if exists "medical_records_select_authorized" on public.medical_records;
create policy "medical_records_select_authorized"
on public.medical_records for select to authenticated
using (
  deleted_at is null
  and public.can_access_clinical_record(clinic_id, professional_member_id, 'view')
);

drop policy if exists "medical_records_insert_authorized" on public.medical_records;
create policy "medical_records_insert_authorized"
on public.medical_records for insert to authenticated
with check (public.can_access_clinical_record(clinic_id, professional_member_id, 'create'));

drop policy if exists "medical_records_update_authorized" on public.medical_records;
create policy "medical_records_update_authorized"
on public.medical_records for update to authenticated
using (public.can_access_clinical_record(clinic_id, professional_member_id, 'edit'))
with check (public.can_access_clinical_record(clinic_id, professional_member_id, 'edit'));

drop policy if exists "medical_prescriptions_select_authorized" on public.medical_prescriptions;
create policy "medical_prescriptions_select_authorized"
on public.medical_prescriptions for select to authenticated
using (
  deleted_at is null
  and public.can_access_clinical_record(clinic_id, professional_member_id, 'view')
);

drop policy if exists "medical_prescriptions_insert_authorized" on public.medical_prescriptions;
create policy "medical_prescriptions_insert_authorized"
on public.medical_prescriptions for insert to authenticated
with check (public.can_access_clinical_record(clinic_id, professional_member_id, 'create'));

drop policy if exists "medical_prescriptions_update_authorized" on public.medical_prescriptions;
create policy "medical_prescriptions_update_authorized"
on public.medical_prescriptions for update to authenticated
using (public.can_access_clinical_record(clinic_id, professional_member_id, 'edit'))
with check (public.can_access_clinical_record(clinic_id, professional_member_id, 'edit'));

-- Supporting clinical data follows the same strict record boundary. This removes
-- the historical schedule:manage shortcut from reception and agenda roles.
drop policy if exists "medical_document_events_select_authorized" on public.medical_document_events;
create policy "medical_document_events_select_authorized"
on public.medical_document_events for select to authenticated
using (public.can_access_clinical_record(clinic_id, professional_member_id, 'view'));

drop policy if exists "medical_document_events_insert_authorized" on public.medical_document_events;
create policy "medical_document_events_insert_authorized"
on public.medical_document_events for insert to authenticated
with check (public.can_access_clinical_record(clinic_id, professional_member_id, 'create'));

drop policy if exists "patient_clinical_comments_select_authorized" on public.patient_clinical_comments;
create policy "patient_clinical_comments_select_authorized"
on public.patient_clinical_comments for select to authenticated
using (
  deleted_at is null
  and public.can_access_clinical_record(clinic_id, professional_member_id, 'view')
);

drop policy if exists "patient_clinical_comments_insert_authorized" on public.patient_clinical_comments;
create policy "patient_clinical_comments_insert_authorized"
on public.patient_clinical_comments for insert to authenticated
with check (public.can_access_clinical_record(clinic_id, professional_member_id, 'create'));

drop policy if exists "patient_clinical_comments_update_authorized" on public.patient_clinical_comments;
create policy "patient_clinical_comments_update_authorized"
on public.patient_clinical_comments for update to authenticated
using (public.can_access_clinical_record(clinic_id, professional_member_id, 'edit'))
with check (public.can_access_clinical_record(clinic_id, professional_member_id, 'edit'));

drop policy if exists "medical_record_attachments_select_authorized" on public.medical_record_attachments;
create policy "medical_record_attachments_select_authorized"
on public.medical_record_attachments for select to authenticated
using (
  deleted_at is null
  and public.can_access_clinical_record(clinic_id, professional_member_id, 'view')
);

drop policy if exists "medical_record_attachments_insert_authorized" on public.medical_record_attachments;
create policy "medical_record_attachments_insert_authorized"
on public.medical_record_attachments for insert to authenticated
with check (public.can_access_clinical_record(clinic_id, professional_member_id, 'create'));

drop policy if exists "medical_record_attachments_update_authorized" on public.medical_record_attachments;
create policy "medical_record_attachments_update_authorized"
on public.medical_record_attachments for update to authenticated
using (public.can_access_clinical_record(clinic_id, professional_member_id, 'edit'))
with check (public.can_access_clinical_record(clinic_id, professional_member_id, 'edit'));

drop policy if exists "medical_correction_requests_select_authorized" on public.medical_record_correction_requests;
create policy "medical_correction_requests_select_authorized"
on public.medical_record_correction_requests for select to authenticated
using (public.can_access_clinical_record(clinic_id, professional_member_id, 'view'));

drop policy if exists "medical_correction_requests_insert_authorized" on public.medical_record_correction_requests;
create policy "medical_correction_requests_insert_authorized"
on public.medical_record_correction_requests for insert to authenticated
with check (public.can_access_clinical_record(clinic_id, professional_member_id, 'edit'));

drop policy if exists "medical_correction_requests_update_authorized" on public.medical_record_correction_requests;
create policy "medical_correction_requests_update_authorized"
on public.medical_record_correction_requests for update to authenticated
using (public.can_access_clinical_record(clinic_id, professional_member_id, 'edit'))
with check (public.can_access_clinical_record(clinic_id, professional_member_id, 'edit'));

insert into public.app_migration_history (migration_name, description, source, notes)
values (
  '038_advanced_specialty_clinical_forms.sql',
  'Motor clinico versionado, formularios por especialidade e endurecimento do acesso ao prontuario.',
  'supabase_sql_editor',
  'Primeira fase da estacao clinica configuravel com observacoes estruturadas.'
)
on conflict (migration_name) do nothing;
