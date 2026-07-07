import { redirect } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { getActiveClinicContext } from "@/features/clinics/context";
import { InsuranceWorkspace } from "@/features/insurance/components/insurance-workspace";
import { getInsuranceWorkspace } from "@/repositories/insurance";

const validSections = new Set(["overview", "coverages", "guides", "batches", "glosses", "reports", "preferences"]);
export default async function InsurancePage({ searchParams }: { searchParams: Promise<{ section?: string; query?: string; status?: string }> }) { const [params, { activeClinic }] = await Promise.all([searchParams, getActiveClinicContext()]); if (!activeClinic) redirect("/dashboard?clinic=required"); const data = await getInsuranceWorkspace(activeClinic.id); if (!data.access.canView) return <div className="grid min-h-64 place-items-center rounded-md border bg-card text-center"><div><LockKeyhole className="mx-auto size-6 text-muted-foreground" /><p className="mt-3 text-sm font-semibold">Acesso ao faturamento restrito</p><p className="mt-1 text-xs text-muted-foreground">Solicite a permissão Convênios e TISS.</p></div></div>; const preferred = typeof data.preferences.defaultSection === "string" ? data.preferences.defaultSection : "overview"; const section = validSections.has(params.section ?? "") ? params.section! : validSections.has(preferred) ? preferred : "overview"; return <InsuranceWorkspace data={data} section={section} query={params.query ?? ""} status={params.status ?? String(data.preferences.savedGuideStatus ?? "all")} />; }
