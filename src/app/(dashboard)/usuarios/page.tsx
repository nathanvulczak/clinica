import { getActiveClinicContext } from "@/features/clinics/context";
import { UsersWorkspace } from "@/features/members/components/users-workspace";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUserId, listClinicMembers } from "@/repositories/clinics";
import { listClinicMemberPermissionOverrides } from "@/repositories/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function UsuariosPage() {
  const { activeClinic } = await getActiveClinicContext();
  const [members, currentUserId, permissionOverrides] = await Promise.all([
    listClinicMembers(activeClinic?.id),
    getCurrentUserId(),
    listClinicMemberPermissionOverrides(activeClinic?.id),
  ]);
  const supabase = await createSupabaseServerClient();
  const [manageMembersResult, managePermissionsResult] = activeClinic
    ? await Promise.all([
        supabase.rpc("user_has_permission", {
          clinic_uuid: activeClinic.id,
          permission_module: "members",
          permission_action: "manage",
        }),
        supabase.rpc("user_has_permission", {
          clinic_uuid: activeClinic.id,
          permission_module: "permissions",
          permission_action: "manage",
        }),
      ])
    : [{ data: false }, { data: false }];

  return (
    <>
      <PageHeader
        title="Usuários e permissões"
        description="Gerencie membros por clínica. O mesmo usuário pode ter papéis diferentes em clínicas diferentes."
      />
      <Card>
        <CardHeader>
          <CardTitle>Membros da clínica ativa</CardTitle>
          <CardDescription>
            Gerencie acesso, perfil e permissões sem misturar usuários entre clínicas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UsersWorkspace
            members={members}
            currentUserId={currentUserId}
            permissionOverrides={permissionOverrides}
            activeClinicName={activeClinic?.trade_name}
            canManageMembers={manageMembersResult.data === true}
            canManagePermissions={managePermissionsResult.data === true}
          />
        </CardContent>
      </Card>
    </>
  );
}
