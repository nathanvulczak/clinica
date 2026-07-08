begin;

create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '91000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'forms-owner@clinicore.test',
    crypt('test-password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{"full_name":"Owner Forms"}', now(), now()
  ),
  (
    '91000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'forms-doctor@clinicore.test',
    crypt('test-password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{"full_name":"Doctor Forms"}', now(), now()
  ),
  (
    '91000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'forms-reception@clinicore.test',
    crypt('test-password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{"full_name":"Reception Forms"}', now(), now()
  );

insert into public.clinics (id, legal_name, trade_name, created_by, updated_by)
values (
  '92000000-0000-0000-0000-000000000001',
  'CliniCore Formularios Ltda', 'CliniCore Formularios',
  '91000000-0000-0000-0000-000000000001',
  '91000000-0000-0000-0000-000000000001'
);

update public.clinic_members
set id = '93000000-0000-0000-0000-000000000001'
where clinic_id = '92000000-0000-0000-0000-000000000001'
  and user_id = '91000000-0000-0000-0000-000000000001';

insert into public.clinic_members (
  id, clinic_id, user_id, role, status, joined_at, created_by, updated_by
) values
  (
    '93000000-0000-0000-0000-000000000002',
    '92000000-0000-0000-0000-000000000001',
    '91000000-0000-0000-0000-000000000002',
    'doctor', 'active', now(),
    '91000000-0000-0000-0000-000000000001',
    '91000000-0000-0000-0000-000000000001'
  ),
  (
    '93000000-0000-0000-0000-000000000003',
    '92000000-0000-0000-0000-000000000001',
    '91000000-0000-0000-0000-000000000003',
    'receptionist', 'active', now(),
    '91000000-0000-0000-0000-000000000001',
    '91000000-0000-0000-0000-000000000001'
  );

insert into public.patients (id, clinic_id, full_name, active, created_by, updated_by)
values (
  '94000000-0000-0000-0000-000000000001',
  '92000000-0000-0000-0000-000000000001',
  'Paciente Formulario', true,
  '91000000-0000-0000-0000-000000000001',
  '91000000-0000-0000-0000-000000000001'
);

insert into public.appointments (
  id, clinic_id, patient_id, professional_member_id, starts_at, ends_at,
  status, created_by, updated_by
) values (
  '95000000-0000-0000-0000-000000000001',
  '92000000-0000-0000-0000-000000000001',
  '94000000-0000-0000-0000-000000000001',
  '93000000-0000-0000-0000-000000000002',
  now() + interval '1 day', now() + interval '1 day 30 minutes',
  'scheduled',
  '91000000-0000-0000-0000-000000000001',
  '91000000-0000-0000-0000-000000000001'
);

insert into public.clinical_encounters (
  id, clinic_id, appointment_id, patient_id, professional_member_id, status,
  preconsultation_mode, preconsultation_required, arrived_at, created_by, updated_by
) values (
  '96000000-0000-0000-0000-000000000001',
  '92000000-0000-0000-0000-000000000001',
  '95000000-0000-0000-0000-000000000001',
  '94000000-0000-0000-0000-000000000001',
  '93000000-0000-0000-0000-000000000002',
  'ready_for_consultation', 'disabled', false, now(),
  '91000000-0000-0000-0000-000000000001',
  '91000000-0000-0000-0000-000000000001'
);

select is(
  (select count(*)::integer from public.clinical_form_templates where clinic_id = '92000000-0000-0000-0000-000000000001'),
  12,
  'nova clinica recebe doze pacotes de especialidade'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.clinical_form_instances'::regclass),
  'RLS esta habilitado nas instancias clinicas'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.save_medical_record_transaction(jsonb,boolean,text)',
    'EXECUTE'
  ),
  'RPC antiga nao fica exposta ao cliente autenticado'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000003', true);

select throws_ok(
  $$
    select public.save_advanced_medical_record_transaction(
      jsonb_build_object(
        'clinic_id', '92000000-0000-0000-0000-000000000001',
        'encounter_id', '96000000-0000-0000-0000-000000000001',
        'status', 'draft'
      ), false, null
    )
  $$,
  '42501', null,
  'recepcao nao acessa prontuario por possuir gestao da agenda'
);

reset role;
select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'medical_document_events',
        'patient_clinical_comments',
        'medical_record_attachments',
        'medical_record_correction_requests'
      )
      and (coalesce(qual, '') ilike '%schedule%' or coalesce(with_check, '') ilike '%schedule%')
  ),
  0,
  'dados clinicos auxiliares nao usam permissao da agenda'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000002', true);

select throws_ok(
  $$
    select public.save_advanced_medical_record_transaction(
      jsonb_build_object(
        'clinic_id', '92000000-0000-0000-0000-000000000001',
        'encounter_id', '96000000-0000-0000-0000-000000000001',
        'status', 'completed',
        'assessment', 'Avaliacao teste',
        'plan', 'Plano teste',
        'clinical_template_id', (
          select id from public.clinical_form_templates
          where clinic_id = '92000000-0000-0000-0000-000000000001'
            and specialty_slug = 'general_medicine'
        ),
        'clinical_responses', '{}'::jsonb
      ), true, 'Conclusao teste'
    )
  $$,
  '23514', null,
  'campos obrigatorios da especialidade sao validados no banco'
);

select ok(
  public.save_advanced_medical_record_transaction(
    jsonb_build_object(
      'clinic_id', '92000000-0000-0000-0000-000000000001',
      'encounter_id', '96000000-0000-0000-0000-000000000001',
      'status', 'completed',
      'chief_complaint', 'Consulta especializada',
      'assessment', 'Avaliacao registrada',
      'plan', 'Plano registrado',
      'follow_up_required', false,
      'completed_at', now(),
      'clinical_template_id', (
        select id from public.clinical_form_templates
        where clinic_id = '92000000-0000-0000-0000-000000000001'
          and specialty_slug = 'general_medicine'
      ),
      'clinical_responses', jsonb_build_object(
        'symptom_onset', 'Inicio ha dois dias',
        'general_condition', 'good',
        'habits', jsonb_build_array('physical_activity'),
        '_visual_maps', jsonb_build_object(
          'general_medicine', jsonb_build_object(
            'preset', 'none',
            'entries', jsonb_build_object()
          )
        )
      )
    ), true, 'Consulta especializada concluida.'
  ) is not null,
  'medico conclui prontuario e formulario na mesma transacao'
);

select is(
  (select status from public.clinical_form_instances where encounter_id = '96000000-0000-0000-0000-000000000001'),
  'completed',
  'instancia especializada fica concluida'
);
select ok(
  (select count(*) from public.clinical_observations where encounter_id = '96000000-0000-0000-0000-000000000001') >= 3,
  'respostas geram observacoes estruturadas'
);
select ok(
  (
    select responses ? '_visual_maps'
    from public.clinical_form_instances
    where encounter_id = '96000000-0000-0000-0000-000000000001'
  ),
  'metadados visuais do formulario permanecem salvos na instancia clinica'
);

select * from finish();
rollback;
