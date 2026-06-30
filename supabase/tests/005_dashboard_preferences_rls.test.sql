begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '16000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'dashboard-owner@clinicore.test',
    crypt('test-password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{"full_name":"Dashboard Owner"}', now(), now()
  ),
  (
    '16000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'dashboard-member@clinicore.test',
    crypt('test-password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{"full_name":"Dashboard Member"}', now(), now()
  ),
  (
    '16000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'dashboard-outsider@clinicore.test',
    crypt('test-password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{"full_name":"Dashboard Outsider"}', now(), now()
  );

insert into public.clinics (id, legal_name, trade_name, created_by, updated_by)
values (
  '26000000-0000-0000-0000-000000000001',
  'Dashboard RLS Teste Ltda',
  'Dashboard RLS Teste',
  '16000000-0000-0000-0000-000000000001',
  '16000000-0000-0000-0000-000000000001'
);

insert into public.clinic_members (
  clinic_id, user_id, role, status, joined_at, created_by, updated_by
)
values (
  '26000000-0000-0000-0000-000000000001',
  '16000000-0000-0000-0000-000000000002',
  'doctor', 'active', now(),
  '16000000-0000-0000-0000-000000000001',
  '16000000-0000-0000-0000-000000000001'
);

select has_table('public', 'dashboard_preferences', 'preferencias do dashboard existem');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.dashboard_preferences'::regclass),
  'RLS esta habilitado nas preferencias do dashboard'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000001', true);

insert into public.dashboard_preferences (
  clinic_id, user_id, visible_widgets, layout, created_by, updated_by
)
values (
  '26000000-0000-0000-0000-000000000001',
  '16000000-0000-0000-0000-000000000001',
  array['agenda'],
  '[{"i":"agenda","x":0,"y":0,"w":3,"h":3}]'::jsonb,
  '16000000-0000-0000-0000-000000000001',
  '16000000-0000-0000-0000-000000000001'
);

select is(
  (select count(*)::integer from public.dashboard_preferences),
  1,
  'usuario visualiza a propria preferencia na clinica'
);

select set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000002', true);
select is(
  (select count(*)::integer from public.dashboard_preferences),
  0,
  'membro nao visualiza a preferencia de outro usuario'
);

insert into public.dashboard_preferences (
  clinic_id, user_id, visible_widgets, layout, created_by, updated_by
)
values (
  '26000000-0000-0000-0000-000000000001',
  '16000000-0000-0000-0000-000000000002',
  array['care'],
  '[{"i":"care","x":0,"y":0,"w":3,"h":3}]'::jsonb,
  '16000000-0000-0000-0000-000000000002',
  '16000000-0000-0000-0000-000000000002'
);

select is(
  (select count(*)::integer from public.dashboard_preferences),
  1,
  'membro pode manter apenas a propria preferencia'
);

select set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000001', true);
select is(
  (select count(*)::integer from public.dashboard_preferences),
  1,
  'owner tambem permanece isolado da preferencia do membro'
);

select set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$
    insert into public.dashboard_preferences (
      clinic_id, user_id, visible_widgets, layout, created_by, updated_by
    ) values (
      '26000000-0000-0000-0000-000000000001',
      '16000000-0000-0000-0000-000000000003',
      array['agenda'], '[]'::jsonb,
      '16000000-0000-0000-0000-000000000003',
      '16000000-0000-0000-0000-000000000003'
    )
  $$,
  '42501',
  null,
  'usuario sem vinculo nao grava preferencias na clinica'
);

select * from finish();

rollback;
