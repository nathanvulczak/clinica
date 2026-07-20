-- CliniCore - Completa a timeline canônica com documentos, exames, anexos e correções existentes.

insert into public.clinical_timeline_events(
  clinic_id, encounter_id, patient_id, professional_member_id, event_type, title,
  summary, source_table, source_id, metadata, occurred_at, actor_id, created_at, created_by, updated_by
)
select
  item.clinic_id, item.encounter_id, item.patient_id, item.professional_member_id,
  'clinical_document',
  case when item.status = 'issued' then 'Documento clínico emitido' else 'Documento clínico atualizado' end,
  concat(item.title, ' | Status: ', item.status), 'medical_prescriptions', item.id,
  jsonb_build_object('status', item.status, 'template_key', item.template_key),
  coalesce(item.issued_at, item.updated_at), coalesce(item.updated_by, item.created_by),
  item.created_at, item.created_by, item.updated_by
from public.medical_prescriptions item
where item.deleted_at is null
  and not exists (select 1 from public.clinical_timeline_events timeline where timeline.source_table = 'medical_prescriptions' and timeline.source_id = item.id);

insert into public.clinical_timeline_events(
  clinic_id, encounter_id, patient_id, professional_member_id, event_type, title,
  summary, source_table, source_id, metadata, occurred_at, actor_id, created_at, created_by, updated_by
)
select
  item.clinic_id, item.encounter_id, item.patient_id, item.professional_member_id,
  'document_event', 'Evento de documento clínico',
  concat(item.event_type, case when item.reason is not null then concat(' | ', item.reason) else '' end),
  'medical_document_events', item.id, jsonb_build_object('event_type', item.event_type),
  item.created_at, item.created_by, item.created_at, item.created_by, item.created_by
from public.medical_document_events item
where not exists (select 1 from public.clinical_timeline_events timeline where timeline.source_table = 'medical_document_events' and timeline.source_id = item.id);

insert into public.clinical_timeline_events(
  clinic_id, encounter_id, patient_id, professional_member_id, event_type, title,
  summary, source_table, source_id, metadata, occurred_at, actor_id, created_at, created_by, updated_by
)
select
  item.clinic_id, item.encounter_id, item.patient_id, item.professional_member_id,
  'clinical_comment', 'Comentário clínico registrado', concat('Visibilidade: ', item.visibility),
  'patient_clinical_comments', item.id, jsonb_build_object('visibility', item.visibility),
  item.created_at, item.created_by, item.created_at, item.created_by, item.updated_by
from public.patient_clinical_comments item
where item.encounter_id is not null
  and item.deleted_at is null
  and not exists (select 1 from public.clinical_timeline_events timeline where timeline.source_table = 'patient_clinical_comments' and timeline.source_id = item.id);

insert into public.clinical_timeline_events(
  clinic_id, encounter_id, patient_id, professional_member_id, event_type, title,
  summary, source_table, source_id, metadata, occurred_at, actor_id, created_at, created_by, updated_by
)
select
  item.clinic_id, item.encounter_id, item.patient_id, item.professional_member_id,
  'clinical_attachment',
  case when item.status = 'deleted' then 'Anexo clínico excluído' else 'Anexo clínico registrado' end,
  concat(item.category, ' | ', item.file_name), 'medical_record_attachments', item.id,
  jsonb_build_object('category', item.category, 'status', item.status), item.created_at,
  coalesce(item.updated_by, item.created_by), item.created_at, item.created_by, item.updated_by
from public.medical_record_attachments item
where not exists (select 1 from public.clinical_timeline_events timeline where timeline.source_table = 'medical_record_attachments' and timeline.source_id = item.id);

insert into public.clinical_timeline_events(
  clinic_id, encounter_id, patient_id, professional_member_id, event_type, title,
  summary, source_table, source_id, metadata, occurred_at, actor_id, created_at, created_by, updated_by
)
select
  item.clinic_id, item.encounter_id, item.patient_id, item.professional_member_id,
  'clinical_correction', 'Correção clínica formal solicitada', concat('Status: ', item.status),
  'medical_record_correction_requests', item.id, jsonb_build_object('status', item.status),
  item.created_at, item.created_by, item.created_at, item.created_by, item.updated_by
from public.medical_record_correction_requests item
where not exists (select 1 from public.clinical_timeline_events timeline where timeline.source_table = 'medical_record_correction_requests' and timeline.source_id = item.id);

create or replace function public.timeline_from_diagnostic_order_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare order_row public.diagnostic_orders%rowtype;
begin
  select * into order_row from public.diagnostic_orders where id = new.order_id;
  if order_row.encounter_id is not null then
    perform public.insert_clinical_timeline_event(
      order_row.encounter_id, 'diagnostic_event', 'Evento de exame registrado',
      concat(new.event_type, case when new.next_status is not null then concat(' | ', new.next_status) else '' end),
      'diagnostic_order_events', new.id, jsonb_build_object('event_type', new.event_type, 'status', new.next_status),
      new.created_at, new.created_by
    );
  end if;
  return new;
end;
$$;

create or replace function public.timeline_from_diagnostic_result()
returns trigger language plpgsql security definer set search_path = public as $$
declare order_row public.diagnostic_orders%rowtype;
begin
  select * into order_row from public.diagnostic_orders where id = new.order_id;
  if order_row.encounter_id is not null then
    perform public.insert_clinical_timeline_event(
      order_row.encounter_id, 'diagnostic_result', 'Resultado de exame registrado',
      concat('Status: ', new.status, ' | Classificação: ', new.flag),
      'diagnostic_results', new.id, jsonb_build_object('status', new.status, 'flag', new.flag),
      new.resulted_at, coalesce(new.updated_by, new.created_by)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists clinical_timeline_from_diagnostic_order_event on public.diagnostic_order_events;
create trigger clinical_timeline_from_diagnostic_order_event after insert on public.diagnostic_order_events
for each row execute function public.timeline_from_diagnostic_order_event();
drop trigger if exists clinical_timeline_from_diagnostic_result on public.diagnostic_results;
create trigger clinical_timeline_from_diagnostic_result after insert or update of status, resulted_at on public.diagnostic_results
for each row execute function public.timeline_from_diagnostic_result();

insert into public.clinical_timeline_events(
  clinic_id, encounter_id, patient_id, professional_member_id, event_type, title,
  summary, source_table, source_id, metadata, occurred_at, actor_id, created_at, created_by, updated_by
)
select
  event.clinic_id, order_row.encounter_id, order_row.patient_id, order_row.professional_member_id,
  'diagnostic_event', 'Evento de exame registrado',
  concat(event.event_type, case when event.next_status is not null then concat(' | ', event.next_status) else '' end),
  'diagnostic_order_events', event.id, jsonb_build_object('event_type', event.event_type, 'status', event.next_status),
  event.created_at, event.created_by, event.created_at, event.created_by, event.created_by
from public.diagnostic_order_events event
join public.diagnostic_orders order_row on order_row.id = event.order_id
where order_row.encounter_id is not null
  and not exists (select 1 from public.clinical_timeline_events timeline where timeline.source_table = 'diagnostic_order_events' and timeline.source_id = event.id);

insert into public.clinical_timeline_events(
  clinic_id, encounter_id, patient_id, professional_member_id, event_type, title,
  summary, source_table, source_id, metadata, occurred_at, actor_id, created_at, created_by, updated_by
)
select
  result.clinic_id, order_row.encounter_id, result.patient_id, result.professional_member_id,
  'diagnostic_result', 'Resultado de exame registrado',
  concat('Status: ', result.status, ' | Classificação: ', result.flag), 'diagnostic_results', result.id,
  jsonb_build_object('status', result.status, 'flag', result.flag), result.resulted_at,
  coalesce(result.updated_by, result.created_by), result.created_at, result.created_by, result.updated_by
from public.diagnostic_results result
join public.diagnostic_orders order_row on order_row.id = result.order_id
where order_row.encounter_id is not null
  and not exists (select 1 from public.clinical_timeline_events timeline where timeline.source_table = 'diagnostic_results' and timeline.source_id = result.id);

insert into public.app_migration_history(migration_name, description, source, notes)
values (
  '052_clinical_timeline_backfill.sql',
  'Completa a timeline canônica com documentos, exames, comentários, anexos e correções existentes.',
  'pipeline',
  'Backfill idempotente por tabela e registro de origem; conteúdo clínico permanece protegido pelo RLS do atendimento.'
)
on conflict (migration_name) do nothing;
