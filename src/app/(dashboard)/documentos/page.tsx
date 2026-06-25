import { redirect } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveClinicContext } from "@/features/clinics/context";
import { DocumentsWorkspace } from "@/features/documents/components/documents-workspace";
import { getDocumentsWorkspace } from "@/repositories/documents";

const validSections = new Set(["templates", "contracts", "consents", "history", "preferences"]);

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const [{ section }, { activeClinic }] = await Promise.all([searchParams, getActiveClinicContext()]);
  if (!activeClinic) redirect("/dashboard?clinic=required");

  const data = await getDocumentsWorkspace(activeClinic.id);
  const activeSection = validSections.has(section ?? "") ? section ?? "templates" : "templates";

  if (!data.access.canView) {
    return (
      <>
        <PageHeader title="Documentos" description="Contratos, termos, consentimentos e histórico documental." />
        <Card>
          <CardHeader>
            <CardTitle>Acesso restrito</CardTitle>
            <CardDescription>Seu perfil não possui permissão para visualizar documentos.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-3 text-sm text-muted-foreground">
            <LockKeyhole className="size-5 text-primary" />
            Solicite acesso ao responsável pela clínica.
          </CardContent>
        </Card>
      </>
    );
  }

  return <DocumentsWorkspace data={data} section={activeSection} />;
}
