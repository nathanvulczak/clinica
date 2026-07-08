alter table public.document_templates
  add column if not exists page_settings jsonb not null default '{"marginTop":18,"marginRight":18,"marginBottom":18,"marginLeft":18,"fontFamily":"serif","fontSize":11.5,"lineHeight":1.6,"orientation":"portrait"}'::jsonb;

alter table public.document_template_versions
  add column if not exists page_settings jsonb not null default '{"marginTop":18,"marginRight":18,"marginBottom":18,"marginLeft":18,"fontFamily":"serif","fontSize":11.5,"lineHeight":1.6,"orientation":"portrait"}'::jsonb;

comment on column public.document_templates.page_settings is
  'Configuração visual A4 do editor documental: margens, tipografia e orientação.';

comment on column public.document_template_versions.page_settings is
  'Snapshot da configuração visual utilizada na versão do modelo.';

