import { redirect } from "next/navigation";
import { ROLE_LABELS } from "@/config/permissions";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PasswordForm } from "@/features/profile/components/password-form";
import { ProfileForm, ProfilePreferencesForm } from "@/features/profile/components/profile-form";
import { SecurityLogsPanel } from "@/features/profile/components/security-logs-panel";
import { getCurrentProfile } from "@/repositories/profile";

export default async function PerfilPage() {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect("/login");
  }

  return (
    <>
      <PageHeader
        title="Meu perfil"
        description="Controle seus dados pessoais, segurança, preferências e transparência de acesso."
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
          <Card>
            <CardHeader>
              <CardTitle>Preferências</CardTitle>
              <CardDescription>Personalize sua experiência no sistema.</CardDescription>
            </CardHeader>
            <CardContent>
              <ProfilePreferencesForm profile={profile} />
            </CardContent>
          </Card>
        </div>
      </div>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Logins e ações de segurança</CardTitle>
          <CardDescription>Use filtros para consultar eventos. A lista atualiza automaticamente.</CardDescription>
        </CardHeader>
        <CardContent>
          <SecurityLogsPanel />
        </CardContent>
      </Card>
    </>
  );
}
