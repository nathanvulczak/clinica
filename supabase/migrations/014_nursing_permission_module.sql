-- CliniCore - Permissao independente para o modulo de Enfermagem.
-- Execute antes de 015_clinical_encounter_workflow.sql.

alter type public.permission_module add value if not exists 'nursing';
