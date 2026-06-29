begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

select ok(
  to_regclass('public.app_migration_history') is not null,
  'historico explicito de migrations existe'
);
select ok(
  to_regprocedure('public.save_nursing_assessment_transaction(jsonb,boolean,text)') is not null,
  'salvamento de pre-consulta e transacional'
);
select ok(
  to_regprocedure('public.save_medical_record_transaction(jsonb,boolean,text)') is not null,
  'salvamento de prontuario e transacional'
);
select ok(
  to_regprocedure('public.create_financial_payment_transaction(jsonb,jsonb)') is not null,
  'baixa financeira e ledger sao transacionais'
);
select ok(
  not has_function_privilege('anon', 'public.repair_missing_profile(uuid)', 'EXECUTE'),
  'anon nao executa reparo administrativo de perfil'
);
select ok(
  not has_function_privilege('authenticated', 'public.repair_missing_profile(uuid)', 'EXECUTE'),
  'usuario autenticado nao executa reparo administrativo de perfil'
);
select ok(
  not has_function_privilege('anon', 'public.user_has_permission(uuid,permission_module,permission_action,uuid)', 'EXECUTE'),
  'anon nao consulta permissoes internas'
);
select ok(
  has_function_privilege('authenticated', 'public.user_has_permission(uuid,permission_module,permission_action,uuid)', 'EXECUTE'),
  'usuario autenticado pode avaliar apenas as proprias permissoes'
);
select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'clinical_attachments_select_authorized'
  ),
  'anexos clinicos possuem policy de leitura restrita'
);
select is(
  (
    select count(*)::integer
    from public.financial_payments fp
    where fp.status = 'confirmed'
      and fp.deleted_at is null
      and not exists (
        select 1
        from public.financial_ledger_entries fle
        where fle.payment_id = fp.id
          and fle.source_type = 'payment'
      )
  ),
  0,
  'todo pagamento confirmado possui movimento no ledger'
);

select * from finish();

rollback;
