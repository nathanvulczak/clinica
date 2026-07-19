-- CliniCore - Reconcilia o historico de migrations de ambientes aplicados manualmente.
-- Este arquivo nao reaplica schema: registra somente o baseline operacional existente.

insert into public.app_migration_history (migration_name, description, source, notes)
select migration_name,
       'Migration historica reconciliada a partir do schema existente.',
       'baseline_reconciled',
       'Nao reaplica SQL. Use apenas em ambiente cuja estrutura ja foi validada.'
from unnest(array[
  '001_initial_enterprise_foundation.sql',
  '002_clinic_context_members_foundation.sql',
  '003_billing_profile_hardening.sql',
  '004_clinic_creation_policy_fix.sql',
  '005_audit_profile_members_storage.sql',
  '006_audit_visibility_and_performance.sql',
  '007_repair_billing_reference_data.sql',
  '008_schedule_foundation.sql',
  '009_registration_catalog.sql',
  '010_professional_registration.sql',
  '011_member_invite_access.sql',
  '012_schedule_operations_security.sql',
  '013_rbac_module_access_hardening.sql',
  '014_nursing_permission_module.sql',
  '015_clinical_encounter_workflow.sql',
  '016_clinical_role_presets.sql',
  '017_repair_missing_clinical_encounters.sql',
  '018_nursing_assessments.sql',
  '019_nursing_module_preferences.sql',
  '020_medical_records_module.sql',
  '021_medical_records_documents_lgpd.sql',
  '022_medical_records_polish.sql',
  '023_financial_module.sql',
  '024_financial_reconciliation.sql',
  '025_financial_enterprise_foundation.sql',
  '026_financial_payables_documents.sql',
  '027_financial_commissions_bank_imports.sql',
  '028_financial_monthly_close_realtime.sql',
  '029_commission_settlements_clinic_branding.sql',
  '030_permission_backup_dashboard_alignment.sql',
  '031_role_permissions_unique_active.sql',
  '032_documents_inventory_enums.sql',
  '033_documents_inventory_operations.sql',
  '034_security_transactions_quality.sql',
  '035_clinical_encounter_routing_integrity.sql',
  '036_schedule_dashboard_experience.sql',
  '037_intelligent_document_issuance.sql',
  '038_advanced_specialty_clinical_forms.sql',
  '039_diagnostics_insurance_permission_modules.sql',
  '040_diagnostics_tiss_foundation.sql',
  '041_company_registration_profiles.sql',
  '042_document_editor_page_settings.sql',
  '043_normalize_document_template_content.sql',
  '044_specialty_immersion_packs.sql',
  '045_diagnostic_requests_attachments.sql'
]) as migration_name
on conflict (migration_name) do nothing;

insert into public.app_migration_history (migration_name, description, source, notes)
values (
  '048_reconcile_migration_history.sql',
  'Reconcilia o baseline de migrations historicas sem reaplicar schema.',
  'pipeline',
  'Proxima migration deve ser aplicada normalmente com checksum.'
)
on conflict (migration_name) do nothing;
