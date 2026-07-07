-- Perfis empresariais completos para preenchimento assistido por CNPJ.

alter table public.clinics
  add column if not exists postal_code text,
  add column if not exists address_line text,
  add column if not exists address_number text,
  add column if not exists address_complement text,
  add column if not exists neighborhood text,
  add column if not exists registration_status text;

alter table public.financial_vendors
  add column if not exists legal_name text,
  add column if not exists trade_name text,
  add column if not exists postal_code text,
  add column if not exists address_line text,
  add column if not exists address_number text,
  add column if not exists address_complement text,
  add column if not exists neighborhood text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists registration_status text;

alter table public.financial_health_plans
  add column if not exists legal_name text,
  add column if not exists trade_name text,
  add column if not exists postal_code text,
  add column if not exists address_line text,
  add column if not exists address_number text,
  add column if not exists address_complement text,
  add column if not exists neighborhood text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists registration_status text;

create index if not exists financial_vendors_clinic_document_idx
on public.financial_vendors (clinic_id, document)
where deleted_at is null and document is not null;

create index if not exists financial_health_plans_clinic_document_idx
on public.financial_health_plans (clinic_id, document)
where deleted_at is null and document is not null;
