import { ACTIVE_CARE_STATUSES } from "@/config/clinical-workflow";
import { PLAN_LIMITS } from "@/config/plans";
import { DashboardWorkspace } from "@/features/dashboard/components/dashboard-workspace";
import { getActiveClinicContext } from "@/features/clinics/context";
import { getClinicBrandingSettings } from "@/repositories/clinic-branding";
import { listClinicMembers } from "@/repositories/clinics";
import { listClinicalEncounters } from "@/repositories/clinical-workflow";
import { getDashboardPreferences } from "@/repositories/dashboard";
import { getFinancialWorkspace } from "@/repositories/financial";
import { getCurrentProfile } from "@/repositories/profile";
import { listAppointments } from "@/repositories/schedule";
import { getCurrentSubscription } from "@/repositories/subscriptions";
import { getClinicAuthorization } from "@/services/authorization/clinic-access";
import { getBillingAuthorization } from "@/services/billing/authorization";
import type { PlanSlug } from "@/types/domain";

function todayInSaoPaulo() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ access?: string; module?: string }>;
}) {
  const params = await searchParams;
  const { clinics, activeClinic } = await getActiveClinicContext();
  const [authorization, billingAuthorization, profile] = await Promise.all([
    getClinicAuthorization(activeClinic?.id),
    getBillingAuthorization(activeClinic),
    getCurrentProfile(),
  ]);
  const today = todayInSaoPaulo();
  const [subscription, members, appointments, encounters, financial, preferences, branding] = await Promise.all([
    billingAuthorization.canView && billingAuthorization.ownerUserId
      ? getCurrentSubscription(billingAuthorization.ownerUserId)
      : Promise.resolve(null),
    authorization.can("members", "view") || authorization.can("members", "manage")
      ? listClinicMembers(activeClinic?.id)
      : Promise.resolve([]),
    activeClinic ? listAppointments(activeClinic.id, { date: today }) : Promise.resolve([]),
    activeClinic ? listClinicalEncounters(activeClinic.id, { statuses: ACTIVE_CARE_STATUSES }) : Promise.resolve([]),
    activeClinic ? getFinancialWorkspace(activeClinic.id, { scope: "overview" }) : Promise.resolve(null),
    getDashboardPreferences(activeClinic?.id),
    activeClinic ? getClinicBrandingSettings(activeClinic.id) : Promise.resolve(null),
  ]);
  const planLimit = subscription?.plan_slug ? PLAN_LIMITS[subscription.plan_slug as PlanSlug] : null;
  const canCreateClinic = billingAuthorization.initialSignup || authorization.can("clinics", "create");
  const activeAppointments = appointments.filter((item) => !["cancelled", "no_show"].includes(item.status));
  const nextAppointments = activeAppointments
    .filter((item) => new Date(item.ends_at).getTime() >= Date.now())
    .slice(0, 6)
    .map((appointment) => ({
      id: appointment.id,
      starts_at: appointment.starts_at,
      ends_at: appointment.ends_at,
      status: appointment.status,
      patient_name: appointment.patient?.social_name || appointment.patient?.full_name || "Paciente",
      professional_name: appointment.professional?.profile?.full_name ?? "Profissional",
      service_name: appointment.service?.name ?? appointment.appointment_type,
    }));

  return (
    <DashboardWorkspace
      accessDenied={params.access === "denied"}
      deniedModule={params.module}
      activeClinicId={activeClinic?.id ?? null}
      activeClinicName={activeClinic?.trade_name ?? "Clínica pendente"}
      clinicLogoUrl={branding?.compact_logo_url ?? branding?.horizontal_logo_url ?? null}
      firstName={profile?.full_name?.split(" ")[0] ?? "bem-vindo"}
      canCreateClinic={canCreateClinic}
      canViewBilling={billingAuthorization.canView}
      canViewMembers={authorization.can("members", "view") || authorization.can("members", "manage")}
      canViewAudit={authorization.can("audit", "view")}
      canViewFinancial={Boolean(financial?.access.canView)}
      subscriptionPlan={subscription?.plan_slug ?? "pendente"}
      clinicsCount={clinics.length}
      planLimit={planLimit}
      membersCount={members.length}
      preferences={preferences}
      metrics={{
        activeAppointments: activeAppointments.length,
        confirmedAppointments: appointments.filter((item) => item.status === "confirmed").length,
        checkedIn: appointments.filter((item) => item.status === "checked_in").length,
        waitingTriage: encounters.filter(
          (item) => item.status === "waiting_triage" || item.status === "triage_in_progress",
        ).length,
        readyForConsultation: encounters.filter((item) => item.status === "ready_for_consultation").length,
        inConsultation: encounters.filter((item) => item.status === "consultation_in_progress").length,
        cashConfirmedCents: financial?.metrics.receivablePaidCents ?? 0,
      }}
      nextAppointments={nextAppointments}
    />
  );
}
