-- CliniCore - Pacotes imersivos por especialidade.
-- Execute after 043_normalize_document_template_content.sql.

create or replace function public.seed_specialty_immersion_templates(
  clinic_uuid uuid,
  actor_uuid uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.clinical_form_templates (
    clinic_id, specialty_slug, name, description, icon_key,
    definition, is_system, active, sort_order, created_by, updated_by
  )
  select
    clinic_uuid, specialty_slug, name, description, icon_key,
    definition, true, true, sort_order, actor_uuid, actor_uuid
  from (
    values
      (
        'nutrition',
        'Nutricao',
        'Avaliacao nutricional com antropometria, metas, plano alimentar e evolucao corporal.',
        'apple',
        80,
        $json${
          "sections": [
            {"key":"anthropometry","title":"Antropometria e composicao corporal","description":"Medidas estruturadas para acompanhamento visual e evolutivo.","columns":3,"fields":[
              {"key":"current_weight","label":"Peso atual","type":"number","required":true,"unit":"kg","min":1,"max":400,"reportable":true},
              {"key":"height_cm","label":"Altura","type":"number","required":true,"unit":"cm","min":30,"max":260,"reportable":true},
              {"key":"waist_cm","label":"Cintura","type":"number","required":false,"unit":"cm","min":20,"max":250,"reportable":true},
              {"key":"hip_cm","label":"Quadril","type":"number","required":false,"unit":"cm","min":20,"max":250,"reportable":true},
              {"key":"body_fat_percent","label":"Gordura corporal","type":"number","required":false,"unit":"%","min":1,"max":80,"reportable":true},
              {"key":"muscle_mass_kg","label":"Massa muscular","type":"number","required":false,"unit":"kg","min":1,"max":200,"reportable":true}
            ]},
            {"key":"nutrition_context","title":"Rotina, objetivos e conduta","columns":2,"fields":[
              {"key":"nutrition_goal","label":"Objetivo principal","type":"select","required":true,"options":[{"value":"weight_loss","label":"Emagrecimento"},{"value":"hypertrophy","label":"Hipertrofia"},{"value":"clinical_nutrition","label":"Nutricao clinica"},{"value":"sports","label":"Performance esportiva"},{"value":"maintenance","label":"Manutencao"}]},
              {"key":"dietary_pattern","label":"Padrao alimentar atual","type":"textarea","required":true},
              {"key":"restrictions_preferences","label":"Restricoes, alergias e preferencias","type":"textarea","required":false},
              {"key":"nutrition_plan","label":"Plano alimentar / conduta","type":"textarea","required":true},
              {"key":"nutrition_targets","label":"Metas ate o retorno","type":"textarea","required":true}
            ]}
          ]
        }$json$::jsonb
      ),
      (
        'aesthetics',
        'Estetica e procedimentos',
        'Mapeamento facial/corporal, produtos, lote, plano de sessoes e orientacoes pos-procedimento.',
        'sparkles',
        90,
        $json${
          "sections": [
            {"key":"procedure_plan","title":"Planejamento do procedimento","columns":2,"fields":[
              {"key":"aesthetic_area","label":"Area tratada","type":"multiselect","required":true,"options":[{"value":"face","label":"Face"},{"value":"neck","label":"Pescoco"},{"value":"abdomen","label":"Abdomen"},{"value":"glutes","label":"Gluteos"},{"value":"legs","label":"Pernas"},{"value":"arms","label":"Bracos"}]},
              {"key":"procedure_type","label":"Tipo de procedimento","type":"select","required":true,"options":[{"value":"injectable","label":"Injetavel"},{"value":"peeling","label":"Peeling"},{"value":"laser","label":"Laser"},{"value":"skin_booster","label":"Skin booster"},{"value":"body_contouring","label":"Corporal"},{"value":"other","label":"Outro"}]},
              {"key":"indication","label":"Indicacao / objetivo","type":"textarea","required":true},
              {"key":"contraindications_checked","label":"Contraindicacoes checadas","type":"boolean","required":true}
            ]},
            {"key":"products_orientation","title":"Produtos e orientacoes","columns":2,"fields":[
              {"key":"products_used","label":"Produtos, lotes e validade","type":"textarea","required":false,"placeholder":"Produto, lote, validade, quantidade."},
              {"key":"technique","label":"Tecnica aplicada","type":"textarea","required":true},
              {"key":"post_care","label":"Cuidados pos-procedimento","type":"textarea","required":true},
              {"key":"next_session_plan","label":"Plano da proxima sessao","type":"textarea","required":false}
            ]}
          ]
        }$json$::jsonb
      ),
      (
        'nursing_care',
        'Enfermagem',
        'Assistencia de enfermagem, protocolos, feridas, medicacoes, escalas e orientacoes.',
        'clipboard-check',
        100,
        $json${
          "sections": [
            {"key":"nursing_protocol","title":"Protocolo assistencial","columns":2,"fields":[
              {"key":"nursing_reason","label":"Motivo do atendimento","type":"textarea","required":true},
              {"key":"risk_scale","label":"Escala / classificacao aplicada","type":"select","required":false,"options":[{"value":"none","label":"Nao aplicada"},{"value":"pain","label":"Dor"},{"value":"fall_risk","label":"Risco de queda"},{"value":"wound","label":"Ferida"},{"value":"other","label":"Outra"}]},
              {"key":"nursing_interventions","label":"Intervencoes realizadas","type":"textarea","required":true},
              {"key":"medication_administered","label":"Medicacao administrada","type":"textarea","required":false,"placeholder":"Medicamento, dose, via, lote se aplicavel."}
            ]},
            {"key":"wound_followup","title":"Feridas, curativos e orientacoes","columns":2,"fields":[
              {"key":"wound_location","label":"Localizacao da ferida/curativo","type":"text","required":false},
              {"key":"wound_aspect","label":"Aspecto / evolucao","type":"textarea","required":false},
              {"key":"materials_used","label":"Materiais utilizados","type":"textarea","required":false},
              {"key":"nursing_orientation","label":"Orientacoes ao paciente","type":"textarea","required":true}
            ]}
          ]
        }$json$::jsonb
      ),
      (
        'speech_therapy',
        'Fonoaudiologia',
        'Avaliacao de voz, fala, linguagem, degluticao, audicao e plano terapeutico.',
        'waves',
        110,
        $json${
          "sections": [
            {"key":"communication_assessment","title":"Comunicacao e linguagem","columns":2,"fields":[
              {"key":"main_communication_complaint","label":"Queixa principal","type":"textarea","required":true},
              {"key":"language_findings","label":"Achados de linguagem","type":"textarea","required":false},
              {"key":"speech_findings","label":"Achados de fala/articulacao","type":"textarea","required":false},
              {"key":"voice_quality","label":"Qualidade vocal","type":"select","required":false,"options":[{"value":"adequate","label":"Adequada"},{"value":"rough","label":"Rouca"},{"value":"breathy","label":"Soprosa"},{"value":"strained","label":"Tensa"},{"value":"unstable","label":"Instavel"}]}
            ]},
            {"key":"swallowing_hearing_plan","title":"Degluticao, audicao e plano","columns":2,"fields":[
              {"key":"swallowing_findings","label":"Degluticao","type":"textarea","required":false},
              {"key":"hearing_findings","label":"Audicao / triagem auditiva","type":"textarea","required":false},
              {"key":"therapy_plan","label":"Plano terapeutico","type":"textarea","required":true},
              {"key":"home_exercises","label":"Exercicios orientados","type":"textarea","required":false}
            ]}
          ]
        }$json$::jsonb
      )
  ) defaults(specialty_slug, name, description, icon_key, sort_order, definition)
  where not exists (
    select 1
    from public.clinical_form_templates template
    where template.clinic_id = clinic_uuid
      and template.specialty_slug = defaults.specialty_slug
      and template.deleted_at is null
  );
end;
$$;

revoke all on function public.seed_specialty_immersion_templates(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.seed_specialty_immersion_templates(uuid, uuid) to service_role;

create or replace function public.seed_clinical_forms_after_clinic_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_clinical_form_templates(new.id, new.created_by);
  perform public.seed_specialty_immersion_templates(new.id, new.created_by);
  return new;
end;
$$;

do $$
declare
  clinic_record record;
begin
  for clinic_record in
    select id, created_by from public.clinics where deleted_at is null
  loop
    perform public.seed_specialty_immersion_templates(clinic_record.id, clinic_record.created_by);
  end loop;
end $$;
