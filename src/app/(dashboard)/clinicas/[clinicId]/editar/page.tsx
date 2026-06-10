import { notFound, redirect } from "next/navigation";
import { ClinicForm } from "@/features/clinics/components/clinic-form";
import { getClinicById } from "@/repositories/clinics";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getClinicAuthorization } from "@/services/authorization/clinic-access";

export default async function EditarClinicaPage({
  params,
}: {
  params: Promise<{ clinicId: string }>;
}) {
  const { clinicId } = await params;
  const authorization = await getClinicAuthorization(clinicId);

  if (!authorization.can("clinics", "edit")) {
    redirect("/dashboard?access=denied&module=clinics");
  }

  const clinic = await getClinicById(clinicId);

  if (!clinic) {
    notFound();
  }

  return (
    <>
      <PageHeader
        title="Editar clínica"
        description="Atualize os dados administrativos da clínica ativa com rastreabilidade em auditoria."
      />
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>{clinic.trade_name}</CardTitle>
          <CardDescription>Alterações ficam registradas com usuário responsável, data, antes e depois.</CardDescription>
        </CardHeader>
        <CardContent>
          <ClinicForm clinic={clinic} />
        </CardContent>
      </Card>
    </>
  );
}
