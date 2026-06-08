import { Activity, CalendarDays, Clock, UserRound } from "lucide-react";
import { APPOINTMENT_STATUS_LABELS } from "@/config/schedule";
import { PatientConfirmationForm } from "@/features/schedule/components/patient-confirmation-form";
import { formatDateBr, formatTimeBr } from "@/lib/dates";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AppointmentStatus } from "@/types/domain";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type ConfirmationPageProps = {
  params: Promise<{ token: string }>;
};

export default async function ConfirmarConsultaPage({ params }: ConfirmationPageProps) {
  const { token } = await params;
  const admin = createSupabaseAdminClient();
  const { data: appointment } = await admin
    .from("appointments")
    .select(
      "id, clinic_id, patient_id, professional_member_id, starts_at, ends_at, status, appointment_type, channel, notes",
    )
    .eq("confirmation_token", token)
    .is("deleted_at", null)
    .maybeSingle();

  if (!appointment) {
    return (
      <main className="grid min-h-screen place-items-center bg-background px-4 py-10">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle>Consulta não encontrada</CardTitle>
            <CardDescription>O link pode ter expirado ou ter sido substituído pela clínica.</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  const [{ data: clinic }, { data: patient }, { data: professional }] = await Promise.all([
    admin
      .from("clinics")
      .select("trade_name, email, phone")
      .eq("id", appointment.clinic_id)
      .maybeSingle(),
    admin
      .from("patients")
      .select("full_name, phone, email")
      .eq("id", appointment.patient_id)
      .maybeSingle(),
    admin
      .from("clinic_members")
      .select("role, profile:profiles!clinic_members_user_id_fkey(full_name, email)")
      .eq("id", appointment.professional_member_id)
      .maybeSingle(),
  ]);

  const status = appointment.status as AppointmentStatus;
  const canConfirm = status === "scheduled" || status === "confirmed";
  const professionalProfile = Array.isArray(professional?.profile)
    ? professional?.profile[0]
    : professional?.profile;

  return (
    <main className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto grid w-full max-w-3xl gap-6">
        <div className="grid gap-4 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Activity className="size-7" />
          </div>
          <div>
            <p className="text-sm font-medium uppercase text-muted-foreground">CliniCore</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal">Confirmação de consulta</h1>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>{clinic?.trade_name ?? "Clínica"}</CardTitle>
                <CardDescription>Confira os dados antes de confirmar sua presença.</CardDescription>
              </div>
              <Badge>{APPOINTMENT_STATUS_LABELS[status]}</Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-3 rounded-lg border bg-background p-4 md:grid-cols-2">
              <div className="flex gap-3">
                <UserRound className="mt-0.5 size-5 text-primary" />
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">Paciente</p>
                  <p className="mt-1 font-medium">{patient?.full_name ?? "Não informado"}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <UserRound className="mt-0.5 size-5 text-primary" />
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">Profissional</p>
                  <p className="mt-1 font-medium">
                    {professionalProfile?.full_name ?? "Profissional da clínica"}
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <CalendarDays className="mt-0.5 size-5 text-primary" />
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">Data</p>
                  <p className="mt-1 font-medium">{formatDateBr(appointment.starts_at)}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <Clock className="mt-0.5 size-5 text-primary" />
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">Horário</p>
                  <p className="mt-1 font-medium">
                    {formatTimeBr(appointment.starts_at)} até {formatTimeBr(appointment.ends_at)}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border bg-background p-4 text-sm text-muted-foreground">
              <p>
                {appointment.appointment_type} • {appointment.channel}
              </p>
              {appointment.notes ? <p className="mt-2">{appointment.notes}</p> : null}
            </div>

            <PatientConfirmationForm token={token} disabled={!canConfirm} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
