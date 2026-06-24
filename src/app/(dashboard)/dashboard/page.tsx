import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  CreditCard,
  ShieldCheck,
  Stethoscope,
  Users,
  Wallet,
} from "lucide-react";
import { ACTIVE_CARE_STATUSES } from "@/config/clinical-workflow";
import { PLAN_LIMITS } from "@/config/plans";
import { AccessDeniedToast } from "@/components/app/access-denied-toast";
import { RealtimeClinicSync } from "@/components/app/realtime-clinic-sync";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getActiveClinicContext } from "@/features/clinics/context";
import { formatCurrencyBRL } from "@/lib/utils";
import { listClinicMembers } from "@/repositories/clinics";
import { listClinicalEncounters } from "@/repositories/clinical-workflow";
import { getFinancialWorkspace } from "@/repositories/financial";
import { getCurrentProfile } from "@/repositories/profile";
import { listAppointments } from "@/repositories/schedule";
import { getCurrentSubscription } from "@/repositories/subscriptions";
import { getClinicAuthorization } from "@/services/authorization/clinic-access";
import { getBillingAuthorization } from "@/services/billing/authorization";
import type { AppointmentSummary, PlanSlug } from "@/types/domain";

const appointmentStatus: Record<string, string> = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
  checked_in: "Paciente chegou",
  in_progress: "Em atendimento",
  completed: "Concluído",
  cancelled: "Cancelado",
  no_show: "Faltou",
};

function todayInSaoPaulo() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(date);
}

function DashboardMetric({ icon: Icon, label, value, detail, tone }: { icon: typeof Activity; label: string; value: string; detail: string; tone?: "success" | "warning" }) {
  return <div className="rounded-lg border bg-card p-3.5"><div className="flex items-center justify-between gap-3"><p className="text-xs font-medium text-muted-foreground">{label}</p><Icon className={tone === "success" ? "size-4 text-emerald-600" : tone === "warning" ? "size-4 text-amber-600" : "size-4 text-primary"} /></div><p className="mt-2 text-xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>;
}

function AppointmentRow({ appointment }: { appointment: AppointmentSummary }) {
  const patient = appointment.patient?.social_name || appointment.patient?.full_name || "Paciente";
  return <div className="grid grid-cols-[58px_1fr_auto] items-center gap-3 border-b py-2.5 last:border-b-0"><span className="text-sm font-medium tabular-nums">{formatTime(appointment.starts_at)}</span><div className="min-w-0"><p className="truncate text-sm font-medium">{patient}</p><p className="truncate text-xs text-muted-foreground">{appointment.professional?.profile?.full_name ?? "Profissional"} | {appointment.service?.name ?? appointment.appointment_type}</p></div><Badge className={appointment.status === "confirmed" || appointment.status === "checked_in" ? "bg-emerald-500/10 text-emerald-700" : undefined}>{appointmentStatus[appointment.status] ?? appointment.status}</Badge></div>;
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ access?: string; module?: string }> }) {
  const params = await searchParams;
  const { clinics, activeClinic } = await getActiveClinicContext();
  const [authorization, billingAuthorization, profile] = await Promise.all([
    getClinicAuthorization(activeClinic?.id),
    getBillingAuthorization(activeClinic),
    getCurrentProfile(),
  ]);
  const today = todayInSaoPaulo();
  const [subscription, members, appointments, encounters, financial] = await Promise.all([
    billingAuthorization.canView && billingAuthorization.ownerUserId ? getCurrentSubscription(billingAuthorization.ownerUserId) : Promise.resolve(null),
    authorization.can("members", "view") || authorization.can("members", "manage") ? listClinicMembers(activeClinic?.id) : Promise.resolve([]),
    activeClinic ? listAppointments(activeClinic.id, { date: today }) : Promise.resolve([]),
    activeClinic ? listClinicalEncounters(activeClinic.id, { statuses: ACTIVE_CARE_STATUSES }) : Promise.resolve([]),
    activeClinic ? getFinancialWorkspace(activeClinic.id, { scope: "overview" }) : Promise.resolve(null),
  ]);
  const planLimit = subscription?.plan_slug ? PLAN_LIMITS[subscription.plan_slug as PlanSlug] : 0;
  const canCreateClinic = billingAuthorization.initialSignup || authorization.can("clinics", "create");
  const activeAppointments = appointments.filter((item) => !["cancelled", "no_show"].includes(item.status));
  const nextAppointments = activeAppointments.filter((item) => new Date(item.ends_at).getTime() >= Date.now()).slice(0, 6);
  const checkedIn = appointments.filter((item) => item.status === "checked_in").length;
  const waitingTriage = encounters.filter((item) => item.status === "waiting_triage" || item.status === "triage_in_progress").length;
  const readyForConsultation = encounters.filter((item) => item.status === "ready_for_consultation").length;
  const inConsultation = encounters.filter((item) => item.status === "consultation_in_progress").length;

  return <div className="grid gap-5">
    <AccessDeniedToast denied={params.access === "denied"} module={params.module} />
    <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-4"><div><div className="flex flex-wrap items-center gap-2"><p className="text-xs font-medium uppercase text-primary">Operação da clínica</p>{activeClinic ? <RealtimeClinicSync clinicId={activeClinic.id} tables={["appointments", "clinical_encounters", "financial_entries", "financial_payments"]} /> : null}</div><h1 className="mt-1 text-xl font-semibold">Olá, {profile?.full_name?.split(" ")[0] ?? "bem-vindo"}</h1><p className="mt-1 text-sm text-muted-foreground">Agenda, atendimento e caixa em uma visão direta do dia.</p></div>{canCreateClinic ? <Button asChild variant="outline"><Link href="/clinicas/nova"><Building2 />Nova clínica</Link></Button> : null}</header>

    <section className="grid gap-3 lg:grid-cols-4">
      <DashboardMetric icon={CalendarDays} label="Agenda de hoje" value={String(activeAppointments.length)} detail={`${appointments.filter((item) => item.status === "confirmed").length} confirmados`} />
      <DashboardMetric icon={Clock3} label="Na recepção" value={String(checkedIn)} detail="Pacientes com chegada registrada" tone={checkedIn ? "warning" : undefined} />
      <DashboardMetric icon={Stethoscope} label="Fluxo assistencial" value={String(waitingTriage + readyForConsultation + inConsultation)} detail={`${inConsultation} em consulta`} tone={inConsultation ? "success" : undefined} />
      <DashboardMetric icon={Wallet} label="Caixa confirmado" value={formatCurrencyBRL(financial?.metrics.receivablePaidCents ?? 0)} detail="Recebimentos carregados no financeiro" tone="success" />
    </section>

    <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
      <section className="rounded-lg border bg-card"><div className="flex items-center justify-between border-b px-4 py-3"><div><p className="text-sm font-medium">Próximos atendimentos</p><p className="mt-0.5 text-xs text-muted-foreground">Agenda operacional de hoje</p></div><Button asChild size="sm" variant="ghost"><Link href="/agenda">Abrir agenda<ArrowRight /></Link></Button></div><div className="px-4">{nextAppointments.length ? nextAppointments.map((item) => <AppointmentRow key={item.id} appointment={item} />) : <p className="py-10 text-center text-sm text-muted-foreground">Nenhum atendimento pendente para hoje.</p>}</div></section>
      <section className="rounded-lg border bg-card"><div className="border-b px-4 py-3"><p className="text-sm font-medium">Fluxo assistencial</p><p className="mt-0.5 text-xs text-muted-foreground">Movimento atual entre recepção e consulta</p></div><div className="grid gap-1 p-3"><div className="flex items-center justify-between rounded-md px-3 py-2.5 text-sm hover:bg-muted/30"><span className="flex items-center gap-2"><Clock3 className="size-4 text-amber-600" />Pré-consulta</span><strong className="tabular-nums">{waitingTriage}</strong></div><div className="flex items-center justify-between rounded-md px-3 py-2.5 text-sm hover:bg-muted/30"><span className="flex items-center gap-2"><CheckCircle2 className="size-4 text-emerald-600" />Prontos para consulta</span><strong className="tabular-nums">{readyForConsultation}</strong></div><div className="flex items-center justify-between rounded-md px-3 py-2.5 text-sm hover:bg-muted/30"><span className="flex items-center gap-2"><Activity className="size-4 text-primary" />Em atendimento</span><strong className="tabular-nums">{inConsultation}</strong></div></div><div className="border-t p-3"><Button asChild className="w-full" variant="outline"><Link href="/atendimentos">Acompanhar atendimentos<ArrowRight /></Link></Button></div></section>
    </div>

    <section className="grid gap-3 rounded-lg border bg-card p-4 lg:grid-cols-[1fr_auto] lg:items-center"><div><div className="flex items-center gap-2"><CreditCard className="size-4 text-primary" /><p className="text-sm font-medium">Contexto administrativo</p></div><div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm"><span><strong>{activeClinic?.trade_name ?? "Clínica pendente"}</strong></span>{billingAuthorization.canView ? <span className="text-muted-foreground">Plano <strong className="capitalize text-foreground">{subscription?.plan_slug ?? "pendente"}</strong> | {clinics.length} de {planLimit || "-"} clínicas</span> : null}{authorization.can("members", "view") || authorization.can("members", "manage") ? <span className="flex items-center gap-1.5 text-muted-foreground"><Users className="size-3.5" />{members.length} membros</span> : null}{authorization.can("audit", "view") ? <span className="flex items-center gap-1.5 text-muted-foreground"><ShieldCheck className="size-3.5" />Auditoria ativa</span> : null}</div></div>{financial?.access.canView ? <Button asChild size="sm"><Link href="/financeiro">Abrir financeiro<ArrowRight /></Link></Button> : null}</section>
  </div>;
}
