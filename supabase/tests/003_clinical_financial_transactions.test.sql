begin;

create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '61000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'transaction-owner@clinicore.test',
  crypt('test-password', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Owner Transacional"}',
  now(),
  now()
);

insert into public.clinics (id, legal_name, trade_name, created_by, updated_by)
values (
  '62000000-0000-0000-0000-000000000001',
  'CliniCore Transacoes Ltda',
  'CliniCore Transacoes',
  '61000000-0000-0000-0000-000000000001',
  '61000000-0000-0000-0000-000000000001'
);

update public.clinic_members
set id = '63000000-0000-0000-0000-000000000001'
where clinic_id = '62000000-0000-0000-0000-000000000001'
  and user_id = '61000000-0000-0000-0000-000000000001';

insert into public.patients (id, clinic_id, full_name, active, created_by, updated_by)
values (
  '64000000-0000-0000-0000-000000000001',
  '62000000-0000-0000-0000-000000000001',
  'Paciente Transacional',
  true,
  '61000000-0000-0000-0000-000000000001',
  '61000000-0000-0000-0000-000000000001'
);

insert into public.appointments (
  id, clinic_id, patient_id, professional_member_id, starts_at, ends_at,
  status, created_by, updated_by
) values (
  '65000000-0000-0000-0000-000000000001',
  '62000000-0000-0000-0000-000000000001',
  '64000000-0000-0000-0000-000000000001',
  '63000000-0000-0000-0000-000000000001',
  now() + interval '1 day',
  now() + interval '1 day 30 minutes',
  'scheduled',
  '61000000-0000-0000-0000-000000000001',
  '61000000-0000-0000-0000-000000000001'
);

insert into public.clinical_encounters (
  id, clinic_id, appointment_id, patient_id, professional_member_id, status,
  preconsultation_mode, preconsultation_required, arrived_at, created_by, updated_by
) values (
  '66000000-0000-0000-0000-000000000001',
  '62000000-0000-0000-0000-000000000001',
  '65000000-0000-0000-0000-000000000001',
  '64000000-0000-0000-0000-000000000001',
  '63000000-0000-0000-0000-000000000001',
  'waiting_triage',
  'required',
  true,
  now(),
  '61000000-0000-0000-0000-000000000001',
  '61000000-0000-0000-0000-000000000001'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select ok(
  public.save_nursing_assessment_transaction(
    jsonb_build_object(
      'clinic_id', '62000000-0000-0000-0000-000000000001',
      'encounter_id', '66000000-0000-0000-0000-000000000001',
      'status', 'completed',
      'chief_complaint', 'Teste transacional',
      'risk_level', 'routine',
      'completed_at', now()
    ),
    true,
    'Pre-consulta concluida no teste.'
  ) is not null,
  'pre-consulta salva em transacao unica'
);
select is(
  (select status::text from public.clinical_encounters where id = '66000000-0000-0000-0000-000000000001'),
  'ready_for_consultation',
  'pre-consulta concluida libera atendimento'
);
select is(
  (select count(*)::integer from public.nursing_assessments where encounter_id = '66000000-0000-0000-0000-000000000001'),
  1,
  'pre-consulta gera uma unica ficha'
);

select ok(
  public.save_medical_record_transaction(
    jsonb_build_object(
      'clinic_id', '62000000-0000-0000-0000-000000000001',
      'encounter_id', '66000000-0000-0000-0000-000000000001',
      'status', 'completed',
      'chief_complaint', 'Consulta de teste',
      'assessment', 'Avaliacao registrada',
      'follow_up_required', false,
      'completed_at', now()
    ),
    true,
    'Consulta concluida no teste.'
  ) is not null,
  'prontuario salvo em transacao unica'
);
select is(
  (select status::text from public.clinical_encounters where id = '66000000-0000-0000-0000-000000000001'),
  'consultation_completed',
  'prontuario concluido encerra atendimento'
);

reset role;
insert into public.financial_accounts (
  id, clinic_id, name, account_type, opening_balance_cents, current_balance_cents,
  created_by, updated_by
) values (
  '67000000-0000-0000-0000-000000000001',
  '62000000-0000-0000-0000-000000000001',
  'Conta Transacional',
  'checking',
  0,
  0,
  '61000000-0000-0000-0000-000000000001',
  '61000000-0000-0000-0000-000000000001'
);
insert into public.financial_entries (
  id, clinic_id, entry_type, origin, status, description, amount_cents,
  issue_date, due_date, competence_date, created_by, updated_by
) values (
  '68000000-0000-0000-0000-000000000001',
  '62000000-0000-0000-0000-000000000001',
  'receivable',
  'manual',
  'pending',
  'Recebimento transacional',
  10000,
  current_date,
  current_date,
  current_date,
  '61000000-0000-0000-0000-000000000001',
  '61000000-0000-0000-0000-000000000001'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select ok(
  public.create_financial_payment_transaction(
    jsonb_build_object(
      'clinic_id', '62000000-0000-0000-0000-000000000001',
      'entry_id', '68000000-0000-0000-0000-000000000001',
      'account_id', '67000000-0000-0000-0000-000000000001',
      'direction', 'in',
      'amount_cents', 10000,
      'fee_cents', 250,
      'net_amount_cents', 9750,
      'paid_at', now(),
      'created_by', '61000000-0000-0000-0000-000000000001'
    ),
    jsonb_build_object(
      'direction', 'in',
      'amount_cents', 10000,
      'fee_cents', 250,
      'net_amount_cents', 9750,
      'occurred_at', now(),
      'description', 'Recebimento transacional',
      'source_type', 'payment'
    )
  ) is not null,
  'pagamento, saldo e ledger sao gravados juntos'
);
select is(
  (select current_balance_cents from public.financial_accounts where id = '67000000-0000-0000-0000-000000000001'),
  9750,
  'saldo recebe o valor liquido'
);
select is(
  (select count(*)::integer from public.financial_payments where entry_id = '68000000-0000-0000-0000-000000000001'),
  1,
  'baixa financeira foi criada'
);
select is(
  (select count(*)::integer from public.financial_ledger_entries where entry_id = '68000000-0000-0000-0000-000000000001'),
  1,
  'ledger imutavel recebeu o movimento'
);

select * from finish();
rollback;
