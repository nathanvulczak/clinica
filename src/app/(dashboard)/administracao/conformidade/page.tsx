import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveClinicContext } from "@/features/clinics/context";
import { ComplianceWorkspace } from "@/features/compliance/components/compliance-workspace";
import { getComplianceWorkspace } from "@/repositories/compliance";
import { getClinicAuthorization } from "@/services/authorization/clinic-access";

export default async function CompliancePage() {
  const { activeClinic } = await getActiveClinicContext();
  if (!activeClinic) redirect("/dashboard?clinic=required");
  const authorization = await getClinicAuthorization(activeClinic.id);
  if (!authorization.can("clinics", "view") && !authorization.can("audit", "view")) {
    return <Card><CardHeader><CardTitle>Acesso restrito</CardTitle><CardDescription>Seu perfil não possui acesso à área de conformidade.</CardDescription></CardHeader></Card>;
  }
  const workspace = await getComplianceWorkspace(activeClinic.id);
  return <div className="grid gap-5"><PageHeader title="Conformidade e LGPD" description="Retenção, solicitações de titulares, incidentes e documentos institucionais." /><ComplianceWorkspace settings={workspace.settings} requests={workspace.requests} canEdit={authorization.can("clinics", "edit")} /></div>;
}
