import { redirect } from "next/navigation";
import { ROLE_LABELS } from "@/config/permissions";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PasswordForm } from "@/features/profile/components/password-form";
import { ProfileForm } from "@/features/profile/components/profile-form";
import { listCurrentUserAccessLogs } from "@/repositories/audit";
import { getCurrentProfile } from "@/repositories/profile";

export default async function PerfilPage() {
  const [profile, accessLogs] = await Promise.all([getCurrentProfile(), listCurrentUserAccessLogs()]);

  if (!profile) {
    redirect("/login");
  }

  return (
    <>
      <PageHeader
        title="Meu perfil"
        description="Controle seus dados pessoais, segurança e transparência de acesso. Papéis e permissões são geridos por administradores da clínica."
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle>Dados pessoais</CardTitle>
            <CardDescription>CPF e papel do usuário são protegidos por regras administrativas.</CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm profile={profile} />
          </CardContent>
        </Card>
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Tipo de perfil</CardTitle>
              <CardDescription>Seu papel global na plataforma.</CardDescription>
            </CardHeader>
            <CardContent>
              <Badge>{ROLE_LABELS[profile.platform_role]}</Badge>
              <p className="mt-3 text-sm text-muted-foreground">
                Papéis por clínica ficam em Usuários e permissões. Você não pode alterar seu próprio tipo de perfil.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Segurança</CardTitle>
              <CardDescription>Atualize sua senha de acesso.</CardDescription>
            </CardHeader>
            <CardContent>
              <PasswordForm />
            </CardContent>
          </Card>
        </div>
      </div>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Logins e ações de segurança</CardTitle>
          <CardDescription>Eventos registrados a partir desta versão.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {accessLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum evento recente encontrado.</p>
          ) : (
            accessLogs.map((log) => (
              <div key={log.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <span>{log.action_type}</span>
                <span className="text-muted-foreground">{new Date(log.created_at).toLocaleString("pt-BR")}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </>
  );
}
