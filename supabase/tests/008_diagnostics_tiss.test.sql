begin;

create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('a1000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-modules@clinicore.test',crypt('test-password',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{"full_name":"Owner Modules"}',now(),now()),
  ('a1000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','doctor-modules@clinicore.test',crypt('test-password',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{"full_name":"Doctor Modules"}',now(),now()),
  ('a1000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','financial-modules@clinicore.test',crypt('test-password',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{"full_name":"Financial Modules"}',now(),now()),
  ('a1000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','reception-modules@clinicore.test',crypt('test-password',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{"full_name":"Reception Modules"}',now(),now());

insert into public.clinics(id,legal_name,trade_name,created_by,updated_by) values('a2000000-0000-0000-0000-000000000001','CliniCore Modules Ltda','CliniCore Modules','a1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001');
update public.clinic_members set id='a3000000-0000-0000-0000-000000000001' where clinic_id='a2000000-0000-0000-0000-000000000001' and user_id='a1000000-0000-0000-0000-000000000001';
insert into public.clinic_members(id,clinic_id,user_id,role,status,joined_at,created_by,updated_by) values
('a3000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002','doctor','active',now(),'a1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001'),
('a3000000-0000-0000-0000-000000000003','a2000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003','financial','active',now(),'a1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001'),
('a3000000-0000-0000-0000-000000000004','a2000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000004','receptionist','active',now(),'a1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001');
insert into public.patients(id,clinic_id,full_name,active,created_by,updated_by) values('a4000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','Paciente Modules',true,'a1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001');
insert into public.financial_health_plans(id,clinic_id,name,ans_registration,tiss_version,active,created_by,updated_by) values('a5000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','Operadora Modules','123456','202511',true,'a1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001');

select ok((select relrowsecurity from pg_class where oid='public.diagnostic_orders'::regclass),'RLS habilitado nos pedidos diagnosticos');
select ok((select relrowsecurity from pg_class where oid='public.tiss_guides'::regclass),'RLS habilitado nas guias TISS');
select ok(has_function_privilege('authenticated','public.create_diagnostic_order_transaction(jsonb)','EXECUTE'),'RPC diagnostica exposta apenas ao cliente autenticado');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000004',true);
select throws_ok($$select public.create_diagnostic_order_transaction(jsonb_build_object('clinic_id','a2000000-0000-0000-0000-000000000001','patient_id','a4000000-0000-0000-0000-000000000001','professional_member_id','a3000000-0000-0000-0000-000000000002','category','laboratory','clinical_indication','Teste','items',jsonb_build_array(jsonb_build_object('name','Hemograma'))))$$,'42501',null,'recepcao nao cria pedido diagnostico apenas por visualizar a fila');

select set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000002',true);
select lives_ok($$select public.create_diagnostic_order_transaction(jsonb_build_object('clinic_id','a2000000-0000-0000-0000-000000000001','patient_id','a4000000-0000-0000-0000-000000000001','professional_member_id','a3000000-0000-0000-0000-000000000002','category','laboratory','priority','routine','clinical_indication','Investigacao clinica','items',jsonb_build_array(jsonb_build_object('code_system','tuss','procedure_code','40304361','name','Hemograma completo','specimen','Sangue total','sort_order',0))))$$,'medico cria pedido com item estruturado');
select is((select count(*)::integer from public.diagnostic_orders where clinic_id='a2000000-0000-0000-0000-000000000001'),1,'pedido diagnostico persistido');
select lives_ok($$select public.save_diagnostic_result_transaction(jsonb_build_object('order_item_id',(select id from public.diagnostic_order_items where clinic_id='a2000000-0000-0000-0000-000000000001' limit 1),'status','final','value_text','Sem alteracoes','flag','normal','report_text','Resultado validado'))$$,'resultado final validado pelo medico');
select is((select status from public.diagnostic_orders where clinic_id='a2000000-0000-0000-0000-000000000001'),'completed','pedido concluido quando todos os itens possuem resultado final');

select set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000003',true);
select lives_ok($$select public.save_patient_coverage_transaction(jsonb_build_object('clinic_id','a2000000-0000-0000-0000-000000000001','patient_id','a4000000-0000-0000-0000-000000000001','health_plan_id','a5000000-0000-0000-0000-000000000001','beneficiary_number','BEN-123','is_primary',true))$$,'financeiro cadastra cobertura do paciente');
select lives_ok($$select public.save_tiss_guide_transaction(jsonb_build_object('clinic_id','a2000000-0000-0000-0000-000000000001','patient_id','a4000000-0000-0000-0000-000000000001','health_plan_id','a5000000-0000-0000-0000-000000000001','coverage_id',(select id from public.patient_health_coverages where clinic_id='a2000000-0000-0000-0000-000000000001' limit 1),'guide_type','consultation','status','ready','service_date',current_date,'items',jsonb_build_array(jsonb_build_object('tuss_code','10101012','description','Consulta em consultorio','service_date',current_date,'quantity',1,'unit_amount_cents',15000))))$$,'financeiro cria guia TISS pronta');
select lives_ok($$select public.create_tiss_batch_transaction(jsonb_build_object('clinic_id','a2000000-0000-0000-0000-000000000001','health_plan_id','a5000000-0000-0000-0000-000000000001','competence',to_char(current_date,'YYYY-MM'),'tiss_version','202511','guide_ids',jsonb_build_array((select id from public.tiss_guides where clinic_id='a2000000-0000-0000-0000-000000000001' limit 1))))$$,'financeiro fecha lote com guias prontas');
select is((select status from public.tiss_guides where clinic_id='a2000000-0000-0000-0000-000000000001'),'batched','guia vinculada fica bloqueada no lote');
reset role;
select is((select count(*)::integer from public.audit_logs where clinic_id='a2000000-0000-0000-0000-000000000001' and module in ('diagnostics','insurance')),5,'operacoes criticas geram auditoria sem duplicidade');

select * from finish();
rollback;
