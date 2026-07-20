begin;

create extension if not exists pgtap with schema extensions;
select plan(15);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('a9000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-flow@clinicore.test',crypt('test-password',gen_salt('bf')),now(),'{}','{"full_name":"Owner Flow"}',now(),now()),
  ('a9000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','doctor-flow@clinicore.test',crypt('test-password',gen_salt('bf')),now(),'{}','{"full_name":"Doctor Flow"}',now(),now());

insert into public.clinics(id, legal_name, trade_name, created_by, updated_by)
values ('a9100000-0000-0000-0000-000000000001','CliniCore Flow Ltda','CliniCore Flow','a9000000-0000-0000-0000-000000000001','a9000000-0000-0000-0000-000000000001');
update public.clinic_members
set id = 'a9200000-0000-0000-0000-000000000001'
where clinic_id = 'a9100000-0000-0000-0000-000000000001'
  and user_id = 'a9000000-0000-0000-0000-000000000001';
insert into public.clinic_members(id, clinic_id, user_id, role, status, joined_at, created_by, updated_by)
values ('a9200000-0000-0000-0000-000000000002','a9100000-0000-0000-0000-000000000001','a9000000-0000-0000-0000-000000000002','doctor','active',now(),'a9000000-0000-0000-0000-000000000001','a9000000-0000-0000-0000-000000000001');
insert into public.patients(id, clinic_id, full_name, active, created_by, updated_by)
values ('a9300000-0000-0000-0000-000000000001','a9100000-0000-0000-0000-000000000001','Paciente Flow',true,'a9000000-0000-0000-0000-000000000001','a9000000-0000-0000-0000-000000000001');
insert into public.appointments(id, clinic_id, patient_id, professional_member_id, starts_at, ends_at, status, appointment_type, channel, created_by, updated_by)
values ('a9400000-0000-0000-0000-000000000001','a9100000-0000-0000-0000-000000000001','a9300000-0000-0000-0000-000000000001','a9200000-0000-0000-0000-000000000002',now() + interval '1 day',now() + interval '1 day 30 minutes','scheduled','Consulta','Presencial','a9000000-0000-0000-0000-000000000001','a9000000-0000-0000-0000-000000000001');

select ok((select relrowsecurity from pg_class where oid = 'public.platform_access_grants'::regclass), 'RLS no control plane');
select ok((select relrowsecurity from pg_class where oid = 'public.clinical_timeline_events'::regclass), 'RLS na timeline canonica');
select ok((select count(*) from public.clinical_field_mappings where clinic_id = 'a9100000-0000-0000-0000-000000000001') >= 10, 'mapeamento oficial enfermagem-prontuario criado');
select ok((select count(*) from pg_enum where enumtypid = 'public.app_role'::regtype and enumlabel in ('platform_support','platform_billing','platform_security')) = 3, 'papeis globais separados');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','a9000000-0000-0000-0000-000000000001',true);
update public.appointments set status = 'checked_in' where id = 'a9400000-0000-0000-0000-000000000001';
select is((select status::text from public.clinical_encounters where appointment_id = 'a9400000-0000-0000-0000-000000000001'),'awaiting_preconsultation_decision','chegada cria atendimento');
select lives_ok($$select public.route_clinical_encounter((select id from public.clinical_encounters where appointment_id = 'a9400000-0000-0000-0000-000000000001'), true, null)$$, 'rota para enfermagem');
select is((select status::text from public.clinical_encounters where appointment_id = 'a9400000-0000-0000-0000-000000000001'),'waiting_triage','atendimento aguarda pre-consulta');
select lives_ok($$select public.transition_clinical_encounter((select id from public.clinical_encounters where appointment_id = 'a9400000-0000-0000-0000-000000000001'),'triage_in_progress',null)$$, 'inicia enfermagem');
insert into public.nursing_assessments(clinic_id, encounter_id, patient_id, professional_member_id, performed_by, status, chief_complaint, weight_kg, height_cm, bmi, created_by, updated_by)
select clinic_id, id, patient_id, professional_member_id, 'a9000000-0000-0000-0000-000000000001', 'completed', 'Avaliação inicial', 80, 180, 24.69, 'a9000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000001'
from public.clinical_encounters where appointment_id = 'a9400000-0000-0000-0000-000000000001';
select lives_ok($$select public.transition_clinical_encounter((select id from public.clinical_encounters where appointment_id = 'a9400000-0000-0000-0000-000000000001'),'ready_for_consultation',null)$$, 'libera prontuario apos enfermagem');
select set_config('request.jwt.claim.sub','a9000000-0000-0000-0000-000000000002',true);
select lives_ok($$select public.transition_clinical_encounter((select id from public.clinical_encounters where appointment_id = 'a9400000-0000-0000-0000-000000000001'),'consultation_in_progress',null)$$, 'inicia prontuario');
insert into public.medical_records(clinic_id, encounter_id, appointment_id, patient_id, professional_member_id, performed_by, status, chief_complaint, created_by, updated_by)
select clinic_id, id, appointment_id, patient_id, professional_member_id, 'a9000000-0000-0000-0000-000000000002', 'completed', 'Avaliação inicial', 'a9000000-0000-0000-0000-000000000002', 'a9000000-0000-0000-0000-000000000002'
from public.clinical_encounters where appointment_id = 'a9400000-0000-0000-0000-000000000001';
select lives_ok($$select public.transition_clinical_encounter((select id from public.clinical_encounters where appointment_id = 'a9400000-0000-0000-0000-000000000001'),'consultation_completed',null)$$, 'encerra consulta');
select set_config('request.jwt.claim.sub','a9000000-0000-0000-0000-000000000001',true);
select lives_ok($$update public.appointments set status = 'billing_pending' where id = 'a9400000-0000-0000-0000-000000000001'$$, 'libera cobranca pela agenda');
select is((select status::text from public.clinical_encounters where appointment_id = 'a9400000-0000-0000-0000-000000000001'),'billing_pending','status final antes da cobranca');
select ok((select count(*) from public.clinical_timeline_events where encounter_id = (select id from public.clinical_encounters where appointment_id = 'a9400000-0000-0000-0000-000000000001')) >= 6, 'timeline canonica registra etapas');
select ok((select count(*) from public.clinical_timeline_events where encounter_id = (select id from public.clinical_encounters where appointment_id = 'a9400000-0000-0000-0000-000000000001' ) and source_table = 'nursing_assessments') >= 1, 'timeline identifica origem enfermagem');
reset role;

select * from finish();
rollback;
