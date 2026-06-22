import { LockKeyhole } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveClinicContext } from "@/features/clinics/context";
import {
  getDefaultFinancialSubsection,
  isValidFinancialSubsection,
  type FinancialSection,
} from "@/features/financial/navigation";
import { FinancialWorkspace } from "@/features/financial/components/financial-workspace";
import { getFinancialWorkspace } from "@/repositories/financial";
import { auditDeniedModuleAccess } from "@/services/authorization/clinic-access";

function normalizeSection(value?: string): FinancialSection {
  return [
    "overview",
    "receivables",
    "payables",
    "accounts",
    "reconciliation",
    "commissions",
    "settings",
  ].includes(value ?? "")
    ? (value as FinancialSection)
    : "overview";
}

export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const section = normalizeSection(params.section);
  const activeView = isValidFinancialSubsection(section, params.view)
    ? params.view
    : getDefaultFinancialSubsection(section);
  const { activeClinic } = await getActiveClinicContext();
  const data = await getFinancialWorkspace(activeClinic?.id, { scope: section });

  if (activeClinic && !data.access.canView) {
    await auditDeniedModuleAccess(
      activeClinic.id,
      "financial",
      "Tentativa de acesso ao módulo financeiro sem permissão de visualização.",
    );
  }

  return (
    <div className="financial-density grid gap-4">
      {!activeClinic ? (
        <Card>
          <CardHeader>
            <CardTitle>Clínica ativa necessária</CardTitle>
            <CardDescription>Selecione uma clínica para acessar o Financeiro.</CardDescription>
          </CardHeader>
        </Card>
      ) : !data.access.canView ? (
        <Card>
          <CardHeader>
            <CardTitle>Acesso restrito</CardTitle>
            <CardDescription>Seu perfil não possui acesso ao módulo Financeiro.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 rounded-lg border p-4 text-sm text-muted-foreground">
              <LockKeyhole className="size-5 text-primary" />
              Usuários sem acesso ao módulo ainda podem lançar cobranças de atendimento se a clínica liberar essa rotina.
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <FinancialWorkspace data={data} section={section} activeView={activeView} />
        </>
      )}
    </div>
  );
}
