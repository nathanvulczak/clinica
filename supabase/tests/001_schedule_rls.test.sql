begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'rls-owner@clinicore.test',
    crypt('test-password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Owner RLS"}',
    now(),
    now()
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'rls-doctor@clinicore.test',
    crypt('test-password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Doctor RLS"}',
    now(),
    now()
  ),
  (
    '10000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'rls-outsider@clinicore.test',
    crypt('test-password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Outsider RLS"}',
    now(),
    now()
  ),
  (
    '10000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'rls-receptionist@clinicore.test',
    crypt('test-password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Receptionist RLS"}',
    now(),
    now()
  ),
  (
    '10000000-0000-0000-0000-000000000005',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'rls-financial@clinicore.test',
    crypt('test-password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Financial RLS"}',
    now(),
    now()
  );

insert into public.clinics (
  id,
  legal_name,
  trade_name,
  created_by,
  updated_by
)
values (
  '20000000-0000-0000-0000-000000000001',
  'CliniCore RLS Teste Ltda',
  'CliniCore RLS Teste',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001'
);

update public.clinic_members
set id = '30000000-0000-0000-0000-000000000001'
where clinic_id = '20000000-0000-0000-0000-000000000001'
  and user_id = '10000000-0000-0000-0000-000000000001';

insert into public.clinic_members (
  id,
  clinic_id,
  user_id,
  role,
  status,
  joined_at,
  created_by,
  updated_by
)
values
  (
    '30000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    'doctor',
    'active',
    now(),
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001'
  ),
  (
    '30000000-0000-0000-0000-000000000003',
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000004',
    'receptionist',
    'active',
    now(),
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001'
  ),
  (
    '30000000-0000-0000-0000-000000000004',
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000005',
    'financial',
    'active',
    now(),
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001'
  );

insert into public.patients (
  id,
  clinic_id,
  full_name,
  active,
  created_by,
  updated_by
)
values (
  '40000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'Paciente RLS',
  true,
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001'
);

insert into public.appointments (
  id,
  clinic_id,
  patient_id,
  professional_member_id,
  starts_at,
  ends_at,
  status,
  appointment_type,
  channel,
  created_by,
  updated_by
)
values
  (
    '50000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    now() + interval '1 day',
    now() + interval '1 day 30 minutes',
    'scheduled',
    'Consulta owner',
    'Presencial',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001'
  ),
  (
    '50000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000002',
    now() + interval '2 days',
    now() + interval '2 days 30 minutes',
    'scheduled',
    'Consulta doctor',
    'Presencial',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001'
  );

set local role authenticated;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select ok(
  public.user_has_permission(
    '20000000-0000-0000-0000-000000000001',
    'schedule',
    'manage'
  ),
  'owner pode gerenciar a agenda'
);
select ok(
  public.user_has_permission(
    '20000000-0000-0000-0000-000000000001',
    'billing',
    'manage'
  ),
  'owner pode gerenciar a assinatura'
);
select is(
  (select count(*)::integer from public.appointments),
  2,
  'owner visualiza todos os compromissos da clinica'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select ok(
  public.user_has_permission(
    '20000000-0000-0000-0000-000000000001',
    'schedule',
    'view'
  ),
  'doctor pode visualizar a agenda'
);
select ok(
  not public.user_has_permission(
    '20000000-0000-0000-0000-000000000001',
    'schedule',
    'manage'
  ),
  'doctor nao recebe visao ampla por padrao'
);
select ok(
  not public.user_has_permission(
    '20000000-0000-0000-0000-000000000001',
    'billing',
    'view'
  ),
  'doctor nao acessa assinatura por padrao'
);
select ok(
  not public.user_has_permission(
    '20000000-0000-0000-0000-000000000001',
    'audit',
    'view'
  ),
  'doctor nao acessa auditoria por padrao'
);
select is(
  (select count(*)::integer from public.appointments),
  1,
  'doctor visualiza somente os compromissos vinculados ao seu membro'
);
select is(
  (
    select professional_member_id
    from public.appointments
    limit 1
  ),
  '30000000-0000-0000-0000-000000000002'::uuid,
  'o compromisso visivel pertence ao doctor autenticado'
);
select throws_ok(
  $$
    update public.appointments
    set status = 'billed'
    where id = '50000000-0000-0000-0000-000000000002'
  $$,
  '23514',
  null,
  'transicoes operacionais invalidas sao bloqueadas'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select ok(
  public.user_has_permission(
    '20000000-0000-0000-0000-000000000001',
    'schedule',
    'manage'
  ),
  'recepcao recebe visao ampla e operacao da agenda'
);
select is(
  (select count(*)::integer from public.appointments),
  2,
  'recepcao visualiza todos os compromissos da clinica'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select ok(
  not public.user_has_permission(
    '20000000-0000-0000-0000-000000000001',
    'schedule',
    'view'
  ),
  'financeiro nao acessa agenda clinica por padrao'
);
select ok(
  public.user_has_permission(
    '20000000-0000-0000-0000-000000000001',
    'billing',
    'view'
  ),
  'financeiro pode consultar assinatura sem gerencia-la'
);
select ok(
  not public.user_has_permission(
    '20000000-0000-0000-0000-000000000001',
    'schedule',
    'manage'
  ),
  'financeiro nao recebe operacao ampla por padrao'
);
select is(
  (select count(*)::integer from public.appointments),
  0,
  'financeiro sem agenda propria nao acessa dados clinicos de compromissos'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select is(
  (select count(*)::integer from public.appointments),
  0,
  'usuario sem vinculo nao visualiza compromissos'
);

select * from finish();

rollback;
