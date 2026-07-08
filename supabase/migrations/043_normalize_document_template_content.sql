update public.document_templates
set content = replace(replace(replace(content, E'\\r\\n', E'\n'), E'\\n', E'\n'), E'\\r', E'\n'),
    updated_at = now()
where content like E'%\\n%' or content like E'%\\r%';

update public.document_template_versions
set content = replace(replace(replace(content, E'\\r\\n', E'\n'), E'\\n', E'\n'), E'\\r', E'\n')
where content like E'%\\n%' or content like E'%\\r%';

comment on column public.document_templates.content is
  'Conteúdo documental editável. Quebras de linha são armazenadas como caracteres reais ou HTML sanitizado.';

create or replace function public.normalize_document_template_content()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.content := replace(
    replace(
      replace(new.content, E'\\r\\n', E'\n'),
      E'\\n', E'\n'
    ),
    E'\\r', E'\n'
  );
  return new;
end;
$$;

drop trigger if exists normalize_document_templates_content on public.document_templates;
create trigger normalize_document_templates_content
before insert or update of content on public.document_templates
for each row execute function public.normalize_document_template_content();

drop trigger if exists normalize_document_template_versions_content on public.document_template_versions;
create trigger normalize_document_template_versions_content
before insert or update of content on public.document_template_versions
for each row execute function public.normalize_document_template_content();

revoke all on function public.normalize_document_template_content() from public, anon, authenticated;
