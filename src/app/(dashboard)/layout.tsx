import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { getActiveClinicContext } from "@/features/clinics/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/repositories/profile";
import {
  getAllowedNavigation,
  getClinicAuthorization,
} from "@/services/authorization/clinic-access";
import { getBillingAuthorization } from "@/services/billing/authorization";
import { getPlatformAccess } from "@/services/authorization/platform-access";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [profile, clinicContext, platformAccess] = await Promise.all([
    getCurrentProfile(),
    getActiveClinicContext(),
    getPlatformAccess(),
  ]);
  const [authorization, billingAuthorization] = await Promise.all([
    getClinicAuthorization(clinicContext.activeClinic?.id),
    getBillingAuthorization(clinicContext.activeClinic),
  ]);
  const allowedNavigation = getAllowedNavigation(authorization, {
    allowInitialSetup: billingAuthorization.initialSignup,
  });

  if (billingAuthorization.canView && !allowedNavigation.includes("billing")) {
    allowedNavigation.push("billing");
  }
  if (platformAccess.allowed) {
    allowedNavigation.push("platform");
  }

  return (
    <AppShell
      profile={profile}
      clinics={clinicContext.clinics}
      activeClinic={clinicContext.activeClinic}
      allowedNavigation={allowedNavigation}
    >
      {children}
    </AppShell>
  );
}
