-- Fase 2.4 - Repara dados de referência de billing.
-- Necessário se um reset manual apagou clinic_plans.

insert into public.clinic_plans (slug, name, amount_cents, currency, max_clinics, active)
values
  ('singular', 'Singular', 10990, 'brl', 1, true),
  ('duo', 'Duo', 15990, 'brl', 2, true),
  ('master', 'Master', 20990, 'brl', 3, true)
on conflict (slug) do update
set name = excluded.name,
    amount_cents = excluded.amount_cents,
    currency = excluded.currency,
    max_clinics = excluded.max_clinics,
    active = excluded.active,
    updated_at = now();
