begin;

create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '81000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'documents-owner@clinicore.test',
    crypt('test-password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{"full_name":"Documents Owner"}', now(), now()
  ),
  (
    '81000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'documents-outsider@clinicore.test',
    crypt('test-password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{"full_name":"Documents Outsider"}', now(), now()
  );

insert into public.clinics (id, legal_name, trade_name, created_by, updated_by)
values (
  '82000000-0000-0000-0000-000000000001',
  'CliniCore Documentos Teste Ltda',
  'CliniCore Documentos Teste',
  '81000000-0000-0000-0000-000000000001',
  '81000000-0000-0000-0000-000000000001'
);

insert into public.patients (id, clinic_id, full_name, active, created_by, updated_by)
values
  (
    '83000000-0000-0000-0000-000000000001',
    '82000000-0000-0000-0000-000000000001',
    'Paciente correto', true,
    '81000000-0000-0000-0000-000000000001',
    '81000000-0000-0000-0000-000000000001'
  ),
  (
    '83000000-0000-0000-0000-000000000002',
    '82000000-0000-0000-0000-000000000001',
    'Paciente incompatível', true,
    '81000000-0000-0000-0000-000000000001',
    '81000000-0000-0000-0000-000000000001'
  );

insert into public.appointments (
  id, clinic_id, patient_id, professional_member_id, starts_at, ends_at,
  status, created_by, updated_by
)
values (
  '84000000-0000-0000-0000-000000000001',
  '82000000-0000-0000-0000-000000000001',
  '83000000-0000-0000-0000-000000000001',
  (select id from public.clinic_members where clinic_id = '82000000-0000-0000-0000-000000000001' limit 1),
  now() + interval '1 day', now() + interval '1 day 30 minutes',
  'scheduled',
  '81000000-0000-0000-0000-000000000001',
  '81000000-0000-0000-0000-000000000001'
);

create temporary table document_test_result (document_id uuid, document_number text);
grant select, insert, update on table pg_temp.document_test_result to authenticated;

select has_table('public', 'generated_document_events', 'eventos documentais existem');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.generated_document_events'::regclass),
  'RLS esta habilitado nos eventos documentais'
);
select ok(
  (select count(*) from public.document_templates where clinic_id = '82000000-0000-0000-0000-000000000001') >= 7,
  'nova clinica recebe biblioteca documental inicial'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000001', true);

select throws_ok(
  $$
    select public.save_generated_document_transaction(
      jsonb_build_object(
        'clinic_id', '82000000-0000-0000-0000-000000000001',
        'template_id', (
          select id from public.document_templates
          where clinic_id = '82000000-0000-0000-0000-000000000001'
          order by created_at limit 1
        ),
        'patient_id', '83000000-0000-0000-0000-000000000002',
        'appointment_id', '84000000-0000-0000-0000-000000000001',
        'title', 'Contexto incompatível',
        'content', repeat('Conteudo documental seguro e rastreavel. ', 4),
        'status', 'draft'
      )
    )
  $$,
  '23503',
  null,
  'consulta e paciente incompatíveis sao rejeitados'
);

insert into pg_temp.document_test_result (document_id)
select public.save_generated_document_transaction(
  jsonb_build_object(
    'clinic_id', '82000000-0000-0000-0000-000000000001',
    'template_id', (
      select id from public.document_templates
      where clinic_id = '82000000-0000-0000-0000-000000000001'
      order by created_at limit 1
    ),
    'title', 'Documento de teste transacional',
    'content', repeat('Conteudo documental seguro e rastreavel. ', 4),
    'status', 'draft'
  )
);

select is(
  (select status from public.generated_documents where id = (select document_id from pg_temp.document_test_result)),
  'draft',
  'emissao pode ser salva como rascunho'
);

update pg_temp.document_test_result
set document_number = public.issue_generated_document_transaction(document_id);

select matches(
  (select document_number from pg_temp.document_test_result),
  '^DOC-[0-9]{4}-[0-9]{6}$',
  'documento emitido recebe numeracao anual da clinica'
);
select is(
  (select count(*)::integer from public.generated_document_events where document_id = (select document_id from pg_temp.document_test_result)),
  2,
  'rascunho e emissao geram eventos distintos'
);

select public.cancel_generated_document_transaction(
  (select document_id from pg_temp.document_test_result),
  'Cancelamento formal para teste automatizado.'
);

select is(
  (select status from public.generated_documents where id = (select document_id from pg_temp.document_test_result)),
  'cancelled',
  'cancelamento preserva o documento com novo status'
);

insert into pg_temp.document_test_result (document_id)
select public.save_generated_document_transaction(
  jsonb_build_object(
    'clinic_id', '82000000-0000-0000-0000-000000000001',
    'template_id', (
      select id from public.document_templates
      where clinic_id = '82000000-0000-0000-0000-000000000001'
      order by created_at limit 1
    ),
    'title', 'Emissao direta pela central',
    'content', repeat('Conteudo documental seguro e rastreavel. ', 4),
    'status', 'issued'
  )
);

select ok(
  exists (
    select 1 from public.generated_documents
    where title = 'Emissao direta pela central'
      and status = 'issued'
      and document_number ~ '^DOC-[0-9]{4}-[0-9]{6}$'
  ),
  'documento pode ser emitido diretamente pelo fluxo principal'
);

select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000002', true);
select is(
  (select count(*)::integer from public.generated_documents),
  0,
  'usuario sem vinculo nao visualiza documentos da clinica'
);

select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000001', true);
update public.document_templates
set content = E'TITULO\\n\\nPaciente: {{paciente_nome}} e conteudo documental suficiente para emissao segura e rastreavel.'
where clinic_id = '82000000-0000-0000-0000-000000000001'
  and id = (select id from public.document_templates where clinic_id = '82000000-0000-0000-0000-000000000001' order by created_at limit 1);

select ok(
  not exists (
    select 1 from public.document_templates
    where clinic_id = '82000000-0000-0000-0000-000000000001'
      and position(chr(92) || 'n' in content) > 0
  ),
  'modelos convertem sequencias literais de quebra de linha antes de salvar'
);

select * from finish();
rollback;
