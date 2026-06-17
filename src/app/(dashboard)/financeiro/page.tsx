import { LockKeyhole } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveClinicContext } from "@/features/clinics/context";
import {
  FinancialSectionNav,
  type FinancialSection,
} from "@/features/financial/components/financial-section-nav";
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
  const { activeClinic } = await getActiveClinicContext();
  const data = await getFinancialWorkspace(activeClinic?.id);

  if (activeClinic && !data.access.canView) {
    await auditDeniedModuleAccess(
      activeClinic.id,
      "financial",
      "Tentativa de acesso ao modulo financeiro sem permissao de visualizacao.",
    );
  }

  return (
    <>
      <PageHeader
        title="Financeiro"
        description="Recebimentos, pagamentos, caixa, conciliacao, comissoes e documentos financeiros da clinica."
      />

      {!activeClinic ? (
        <Card>
          <CardHeader>
            <CardTitle>Clinica ativa necessaria</CardTitle>
            <CardDescription>Selecione uma clinica para acessar o Financeiro.</CardDescription>
          </CardHeader>
        </Card>
      ) : !data.access.canView ? (
        <Card>
          <CardHeader>
            <CardTitle>Acesso restrito</CardTitle>
            <CardDescription>Seu perfil nao possui acesso ao modulo Financeiro.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 rounded-lg border p-4 text-sm text-muted-foreground">
              <LockKeyhole className="size-5 text-primary" />
              Usuarios sem acesso ao modulo ainda podem lancar cobrancas de atendimento se a clinica liberar essa rotina.
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5">
          <FinancialSectionNav activeSection={section} />
          <FinancialWorkspace data={data} section={section} />
        </div>
      )}
    </>
  );
}
