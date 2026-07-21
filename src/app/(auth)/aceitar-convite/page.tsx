import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, ArrowLeft, Building2, ShieldCheck } from "lucide-react";
import { AcceptInviteForm } from "@/features/members/components/accept-invite-form";
import { InviteSessionBootstrap } from "@/features/members/components/invite-session-bootstrap";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const clinicId = params.clinic;
  const invitationId = params.invitation;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <InviteSessionBootstrap />;
  }

  if (!clinicId) {
    redirect("/login?invite=invalid");
  }

  const admin = createSupabaseAdminClient();
  let invitationInfo: { role: string; expires_at: string } | null = null;
  if (invitationId) {
    const { data: invitation } = await admin
      .from("clinic_invitations")
      .select("id, status, expires_at, user_id, email, role")
      .eq("id", invitationId)
      .eq("clinic_id", clinicId)
      .maybeSingle();
    const invitationExpired = invitation && new Date(invitation.expires_at).getTime() <= Date.now();
    const invitationEmailMismatch = invitation && invitation.user_id !== user.id;
    if (!invitation || invitationExpired || invitationEmailMismatch || !["pending", "sent"].includes(invitation.status)) {
      redirect("/login?invite=expired");
    }
    invitationInfo = invitation;
  }
  const { data: membership } = await admin
    .from("clinic_members")
    .select("id, status, role, clinic:clinics!clinic_members_clinic_id_fkey(trade_name)")
    .eq("clinic_id", clinicId)
    .eq("user_id", user.id)
    .in("status", ["invited", "active"])
    .is("deleted_at", null)
    .maybeSingle();

  if (!membership) {
    redirect("/login?invite=invalid");
  }

  const clinic = membership.clinic as unknown as { trade_name?: string | null } | null;

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 py-10">
      <div className="grid w-full max-w-lg gap-5">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Activity className="size-5" />
            </span>
            CliniCore
          </Link>
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">
              <ArrowLeft />
              Voltar ao login
            </Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="mb-3 flex size-11 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Building2 className="size-5" />
            </div>
            <CardTitle>Ative seu acesso</CardTitle>
            <CardDescription>
              Você foi convidado para {clinic?.trade_name ?? "uma clínica"}. Defina sua senha para concluir
              o vínculo com segurança.
            </CardDescription>
            {invitationInfo ? (
              <div className="mt-3 grid gap-1 rounded-md border bg-muted/35 p-3 text-xs text-muted-foreground">
                <p><span className="font-medium text-foreground">Perfil:</span> {invitationInfo.role}</p>
                <p><span className="font-medium text-foreground">Valido ate:</span> {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(invitationInfo.expires_at))}</p>
              </div>
            ) : null}
          </CardHeader>
          <CardContent className="grid gap-5">
            <AcceptInviteForm clinicId={clinicId} invitationId={invitationId} />
            <div className="flex gap-3 rounded-md border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
              Seu perfil, clínica e permissões já foram preparados. A senha é criada somente por você.
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
