import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPlatformAccess } from "@/services/authorization/platform-access";

export default async function PlatformConsoleLayout({ children }: { children: React.ReactNode }) {
  const access = await getPlatformAccess();
  if (!access.allowed) redirect("/console/login");
  if (access.mfaRequired) {
    const supabase = await createSupabaseServerClient();
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (!access.mfaEnrolled || aal?.currentLevel !== "aal2") redirect(`/console/mfa?${access.mfaEnrolled ? "verify=required" : "setup=required"}`);
  }
  return <div className="min-h-screen bg-slate-950 text-slate-100">{children}</div>;
}
