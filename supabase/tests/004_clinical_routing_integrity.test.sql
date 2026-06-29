begin;

create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '71000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'routing-owner@clinicore.test',
  crypt('test-password', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Owner Routing"}',
  now(),
  now()
);

insert into public.clinics (id, legal_name, trade_name, created_by, updated_by)
values (
  '72000000-0000-0000-0000-000000000001',
  'CliniCore Routing Ltda',
  'CliniCore Routing',
  '71000000-0000-0000-0000-000000000001',
  '71000000-0000-0000-0000-000000000001'
);

update public.clinic_members
set id = '73000000-0000-0000-0000-000000000001'
where clinic_id = '72000000-0000-0000-0000-000000000001'
  and user_id = '71000000-0000-0000-0000-000000000001';

insert into public.patients (id, clinic_id, full_name, active, created_by, updated_by)
values (
  '74000000-0000-0000-0000-000000000001',
  '72000000-0000-0000-0000-000000000001',
  'Paciente Routing',
  true,
  '71000000-0000-0000-0000-000000000001',
  '71000000-0000-0000-0000-000000000001'
);

insert into public.appointments (
  id, clinic_id, patient_id, professional_member_id, starts_at, ends_at,
  status, checked_in_at, created_by, updated_by
) values (
  '75000000-0000-0000-0000-000000000001',
  '72000000-0000-0000-0000-000000000001',
  '74000000-0000-0000-0000-000000000001',
  '73000000-0000-0000-0000-000000000001',
  now() + interval '1 day',
  now() + interval '1 day 30 minutes',
  'checked_in',
  now(),
  '71000000-0000-0000-0000-000000000001',
  '71000000-0000-0000-0000-000000000001'
);

delete from public.clinical_encounter_events
where clinic_id = '72000000-0000-0000-0000-000000000001';
delete from public.clinical_encounters
where appointment_id = '75000000-0000-0000-0000-000000000001';

select ok(
  not has_function_privilege(
    'authenticated',
    'public.ensure_clinical_encounter_for_appointment(uuid,uuid,uuid)',
    'EXECUTE'
  ),
  'cliente autenticado nao executa reparo com actor arbitrario'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

select is(
  (
    public.ensure_clinical_encounter_for_appointment(
      '75000000-0000-0000-0000-000000000001',
      '72000000-0000-0000-0000-000000000001',
      '71000000-0000-0000-0000-000000000001'
    )->>'created'
  )::boolean,
  true,
  'atendimento ausente e recriado atomicamente'
);
select is(
  (select count(*)::integer from public.clinical_encounters where appointment_id = '75000000-0000-0000-0000-000000000001'),
  1,
  'existe um unico atendimento por agendamento'
);
select is(
  (select count(*)::integer from public.clinical_encounter_events where event_type = 'patient_arrived' and clinic_id = '72000000-0000-0000-0000-000000000001'),
  1,
  'criacao e evento assistencial sao gravados juntos'
);
select is(
  (
    public.ensure_clinical_encounter_for_appointment(
      '75000000-0000-0000-0000-000000000001',
      '72000000-0000-0000-0000-000000000001',
      '71000000-0000-0000-0000-000000000001'
    )->>'created'
  )::boolean,
  false,
  'segunda execucao reutiliza o atendimento existente'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', true);

select is(
  (
    public.route_clinical_encounter(
      (select id from public.clinical_encounters where appointment_id = '75000000-0000-0000-0000-000000000001'),
      true,
      null
    )
  ).status::text,
  'waiting_triage',
  'decisao encaminha o paciente para enfermagem'
);

select is(
  (
    public.route_clinical_encounter(
      (select id from public.clinical_encounters where appointment_id = '75000000-0000-0000-0000-000000000001'),
      false,
      'Correcao de teste para atendimento direto.'
    )
  ).status::text,
  'ready_for_consultation',
  'correcao auditavel libera atendimento direto'
);

select * from finish();
rollback;
