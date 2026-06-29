import { createDatabaseClient } from "./database-utils.mjs";

const client = createDatabaseClient();
await client.connect();

try {
  const { rows } = await client.query(`
    select
      count(*) filter (
        where a.status in ('checked_in', 'in_triage', 'in_progress', 'completed', 'billing_pending', 'billed')
          and ce.id is null
      )::integer as appointments_without_encounter,
      count(*) filter (
        where ce.id is not null
          and (ce.clinic_id <> a.clinic_id or ce.patient_id <> a.patient_id or ce.professional_member_id <> a.professional_member_id)
      )::integer as encounters_with_broken_links,
      count(*) filter (
        where ce.status = 'awaiting_preconsultation_decision'
      )::integer as awaiting_route_decision,
      count(*) filter (
        where ce.status = 'waiting_triage'
      )::integer as waiting_triage,
      count(*) filter (
        where ce.status = 'ready_for_consultation'
      )::integer as ready_for_consultation
    from public.appointments a
    left join public.clinical_encounters ce
      on ce.appointment_id = a.id
     and ce.deleted_at is null
    where a.deleted_at is null
  `);

  const result = rows[0];
  const healthy =
    result.appointments_without_encounter === 0 && result.encounters_with_broken_links === 0;
  console.log(`${healthy ? "OK" : "FAIL"} fluxo clinico`, result);
  if (!healthy) process.exitCode = 1;
} finally {
  await client.end();
}
