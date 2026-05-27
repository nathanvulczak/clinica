import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { getActiveClinicContext } from "@/features/clinics/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/repositories/profile";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [profile, clinicContext] = await Promise.all([getCurrentProfile(), getActiveClinicContext()]);

  return (
    <AppShell
      profile={profile}
      clinics={clinicContext.clinics}
      activeClinic={clinicContext.activeClinic}
    >
      {children}
    </AppShell>
  );
}
