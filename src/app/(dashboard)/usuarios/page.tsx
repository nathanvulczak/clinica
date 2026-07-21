import { getActiveClinicContext } from "@/features/clinics/context";
import { UsersWorkspace } from "@/features/members/components/users-workspace";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUserId, listClinicMembers } from "@/repositories/clinics";
import { listClinicInvitations } from "@/repositories/invitations";
import { listClinicMemberPermissionOverrides } from "@/repositories/permissions";
import { redirect } from "next/navigation";
import {
  auditDeniedModuleAccess,
  getClinicAuthorization,
} from "@/services/authorization/clinic-access";

export default async function UsuariosPage() {
  const { activeClinic } = await getActiveClinicContext();
  const authorization = await getClinicAuthorization(activeClinic?.id);

  if (
    activeClinic &&
    !authorization.can("members", "view") &&
    !authorization.can("members", "manage")
  ) {
    await auditDeniedModuleAccess(
      activeClinic.id,
      "members",
      "Tentativa de acesso direto ao módulo de usuários sem permissão.",
    );
    redirect("/dashboard?access=denied&module=members");
  }

  const [members, invitations, currentUserId, permissionOverrides] = await Promise.all([
    listClinicMembers(activeClinic?.id),
    listClinicInvitations(activeClinic?.id),
    getCurrentUserId(),
    listClinicMemberPermissionOverrides(activeClinic?.id),
  ]);
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
            invitations={invitations}
            currentUserId={currentUserId}
            permissionOverrides={permissionOverrides}
            activeClinicName={activeClinic?.trade_name}
            canManageMembers={authorization.can("members", "manage")}
            canManagePermissions={authorization.can("permissions", "manage")}
          />
        </CardContent>
      </Card>
    </>
  );
}
