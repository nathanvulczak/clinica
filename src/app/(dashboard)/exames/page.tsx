import { redirect } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { getActiveClinicContext } from "@/features/clinics/context";
import { DiagnosticsWorkspace } from "@/features/diagnostics/components/diagnostics-workspace";
import { getDiagnosticsWorkspace } from "@/repositories/diagnostics";

const validSections = new Set(["overview", "orders", "results", "alerts", "reports", "preferences"]);

export default async function DiagnosticsPage({ searchParams }: { searchParams: Promise<{ section?: string; query?: string; status?: string }> }) {
  const [params, { activeClinic }] = await Promise.all([searchParams, getActiveClinicContext()]);
  if (!activeClinic) redirect("/dashboard?clinic=required");
  const data = await getDiagnosticsWorkspace(activeClinic.id);
  if (!data.access.canView) return <div className="grid min-h-64 place-items-center rounded-md border bg-card text-center"><div><LockKeyhole className="mx-auto size-6 text-muted-foreground" /><p className="mt-3 text-sm font-semibold">Acesso diagnóstico restrito</p><p className="mt-1 text-xs text-muted-foreground">Solicite a permissão Exames e diagnóstico.</p></div></div>;
  const preferred = typeof data.preferences.defaultSection === "string" ? data.preferences.defaultSection : "overview";
  const section = validSections.has(params.section ?? "") ? params.section! : validSections.has(preferred) ? preferred : "overview";
  return <DiagnosticsWorkspace data={data} section={section} query={params.query ?? ""} status={params.status ?? String(data.preferences.savedStatus ?? "all")} />;
}
