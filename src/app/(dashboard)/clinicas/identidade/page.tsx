import { redirect } from "next/navigation";
import { Palette } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ClinicBrandingForm } from "@/features/clinics/components/clinic-branding-form";
import { getActiveClinicContext } from "@/features/clinics/context";
import { getClinicBrandingSettings } from "@/repositories/clinic-branding";
import { getClinicAuthorization } from "@/services/authorization/clinic-access";

export default async function ClinicBrandingPage() {
  const { activeClinic } = await getActiveClinicContext();
  if (!activeClinic) redirect("/dashboard?clinic=required");
  const authorization = await getClinicAuthorization(activeClinic.id);
  if (!authorization.can("clinics", "edit")) {
    return <Card><CardHeader><CardTitle>Acesso restrito</CardTitle><CardDescription>Seu perfil não pode alterar a identidade documental da clínica.</CardDescription></CardHeader><CardContent className="flex items-center gap-3 text-sm text-muted-foreground"><Palette className="size-5 text-primary" />Solicite a permissão de edição de clínicas ao responsável.</CardContent></Card>;
  }
  const branding = await getClinicBrandingSettings(activeClinic.id);
  return <div className="grid gap-5"><PageHeader title="Identidade e documentos" description="Marca, cabeçalho e informações institucionais aplicadas aos documentos da clínica." /><ClinicBrandingForm branding={branding} /></div>;
}
