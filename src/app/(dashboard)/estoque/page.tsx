import { redirect } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveClinicContext } from "@/features/clinics/context";
import { InventoryWorkspace } from "@/features/inventory/components/inventory-workspace";
import { getInventoryWorkspace } from "@/repositories/inventory";

const validSections = new Set(["overview", "items", "batches", "movements", "care", "settings"]);

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const [{ section }, { activeClinic }] = await Promise.all([searchParams, getActiveClinicContext()]);
  if (!activeClinic) redirect("/dashboard?clinic=required");

  const data = await getInventoryWorkspace(activeClinic.id);
  const activeSection = validSections.has(section ?? "") ? section ?? "overview" : "overview";

  if (!data.access.canView) {
    return (
      <>
        <PageHeader title="Estoque" description="Materiais, lotes, validade e consumo por atendimento." />
        <Card>
          <CardHeader>
            <CardTitle>Acesso restrito</CardTitle>
            <CardDescription>Seu perfil não possui permissão para visualizar o estoque.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-3 text-sm text-muted-foreground">
            <LockKeyhole className="size-5 text-primary" />
            Solicite acesso ao responsável pela clínica.
          </CardContent>
        </Card>
      </>
    );
  }

  return <InventoryWorkspace data={data} section={activeSection} />;
}
