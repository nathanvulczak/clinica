import { getActiveClinicContext } from "@/features/clinics/context";
import { InviteMemberForm } from "@/features/members/components/invite-member-form";
import { MembersTable } from "@/features/members/components/members-table";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUserId, listClinicMembers } from "@/repositories/clinics";
import { listClinicMemberPermissionOverrides } from "@/repositories/permissions";

export default async function UsuariosPage() {
  const { activeClinic } = await getActiveClinicContext();
  const [members, currentUserId, permissionOverrides] = await Promise.all([
    listClinicMembers(activeClinic?.id),
    getCurrentUserId(),
    listClinicMemberPermissionOverrides(activeClinic?.id),
  ]);

  return (
    <>
      <PageHeader
        title="Usuários e permissões"
        description="Gerencie membros por clínica. O mesmo usuário pode ter papéis diferentes em clínicas diferentes."
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader>
            <CardTitle>Membros da clínica ativa</CardTitle>
            <CardDescription>
              {activeClinic
                ? `Contexto atual: ${activeClinic.trade_name}`
                : "Cadastre uma clínica para começar a vincular usuários."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MembersTable
              members={members}
              currentUserId={currentUserId}
              permissionOverrides={permissionOverrides}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Cadastrar usuário</CardTitle>
            <CardDescription>
              Se o e-mail já existir, o usuário será vinculado imediatamente. Caso contrário, o convite fica registrado.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InviteMemberForm disabled={!activeClinic} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
