-- Garante que cada preset/permissao ativa exista uma unica vez por clinica.

with ranked as (
  select
    id,
    row_number() over (
      partition by clinic_id, role, module, action
      order by updated_at desc nulls last, created_at desc nulls last, id desc
    ) as row_position
  from public.role_permissions
  where deleted_at is null
)
update public.role_permissions permissions
set
  deleted_at = now(),
  updated_at = now()
from ranked
where permissions.id = ranked.id
  and ranked.row_position > 1;

create unique index if not exists idx_role_permissions_unique_active
on public.role_permissions (
  coalesce(clinic_id, '00000000-0000-0000-0000-000000000000'::uuid),
  role,
  module,
  action
)
where deleted_at is null;
