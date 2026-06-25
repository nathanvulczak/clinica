-- CliniCore - novos modulos de permissao para documentos e estoque.

alter type public.permission_module add value if not exists 'documents';
alter type public.permission_module add value if not exists 'inventory';
