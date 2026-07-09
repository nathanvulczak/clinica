import { redirect } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { getActiveClinicContext } from "@/features/clinics/context";
import { DiagnosticsWorkspace } from "@/features/diagnostics/components/diagnostics-workspace";
import { getDiagnosticsWorkspace } from "@/repositories/diagnostics";

const validSections = new Set(["overview", "open", "awaiting-return", "received", "validated", "alerts", "reports", "preferences"]);
const legacySections: Record<string, string> = {
  orders: "open",
  results: "received",
};

export default async function DiagnosticsPage({ searchParams }: { searchParams: Promise<{ section?: string; query?: string; status?: string }> }) {
  const [params, { activeClinic }] = await Promise.all([searchParams, getActiveClinicContext()]);
  if (!activeClinic) redirect("/dashboard?clinic=required");
  const data = await getDiagnosticsWorkspace(activeClinic.id);
  if (!data.access.canView) return <div className="grid min-h-64 place-items-center rounded-md border bg-card text-center"><div><LockKeyhole className="mx-auto size-6 text-muted-foreground" /><p className="mt-3 text-sm font-semibold">Acesso diagnóstico restrito</p><p className="mt-1 text-xs text-muted-foreground">Solicite a permissão Exames e diagnóstico.</p></div></div>;
  const preferred = typeof data.preferences.defaultSection === "string" ? data.preferences.defaultSection : "overview";
  const requestedSection = legacySections[params.section ?? ""] ?? params.section;
  const preferredSection = legacySections[preferred] ?? preferred;
  const section = validSections.has(requestedSection ?? "") ? requestedSection! : validSections.has(preferredSection) ? preferredSection : "overview";
  return <DiagnosticsWorkspace data={data} section={section} query={params.query ?? ""} status={params.status ?? String(data.preferences.savedStatus ?? "all")} />;
}
