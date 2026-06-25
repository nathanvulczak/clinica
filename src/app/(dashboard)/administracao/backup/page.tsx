import { Download, HardDriveDownload, LockKeyhole, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveClinicContext } from "@/features/clinics/context";
import { getClinicAuthorization } from "@/services/authorization/clinic-access";

const backupScopes = [
  {
    scope: "administrative",
    title: "Administrativo",
    description: "Clínica, membros, permissões, identidade visual, cadastros básicos e configurações.",
  },
  {
    scope: "clinical",
    title: "Assistencial",
    description: "Pacientes, agenda, atendimentos, enfermagem, prontuários, documentos e anexos registrados.",
  },
  {
    scope: "financial",
    title: "Financeiro",
    description: "Contas, lançamentos, pagamentos, conciliações, comissões, fornecedores e fechamentos.",
  },
  {
    scope: "complete",
    title: "Completo",
    description: "Pacote unificado da clínica ativa, incluindo dados administrativos, clínicos e financeiros.",
  },
];

export default async function BackupPage() {
  const { activeClinic } = await getActiveClinicContext();
  const authorization = await getClinicAuthorization(activeClinic?.id);
  const canExport = authorization.can("audit", "export") || authorization.can("clinics", "edit");

  return (
    <>
      <PageHeader
        title="Backup"
        description="Exporte uma cópia auditável dos dados da clínica ativa para guarda administrativa."
      />

      {!activeClinic ? (
        <Card>
          <CardHeader>
            <CardTitle>Clínica ativa necessária</CardTitle>
            <CardDescription>Selecione uma clínica para gerar backups.</CardDescription>
          </CardHeader>
        </Card>
      ) : !canExport ? (
        <Card>
          <CardHeader>
            <CardTitle>Acesso restrito</CardTitle>
            <CardDescription>Seu perfil não possui permissão para exportar dados da clínica.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 rounded-lg border p-4 text-sm text-muted-foreground">
              <LockKeyhole className="size-5 text-primary" />
              Solicite permissão de exportação de auditoria ou administração da clínica.
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          <section className="grid gap-3 rounded-lg border bg-card p-4 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-primary" />
                <p className="text-sm font-medium">Backup da clínica ativa</p>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                O arquivo é gerado em JSON para preservar estrutura, rastreabilidade e relacionamento entre registros.
                A exportação fica registrada na auditoria.
              </p>
            </div>
            <Badge className="bg-primary/10 text-primary">{activeClinic.trade_name}</Badge>
          </section>

          <section className="grid gap-3 xl:grid-cols-4">
            {backupScopes.map((item) => (
              <Card key={item.scope}>
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-base">{item.title}</CardTitle>
                    <HardDriveDownload className="size-4 text-primary" />
                  </div>
                  <CardDescription className="min-h-16 text-xs leading-5">{item.description}</CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-2">
                  <Button asChild className="w-full" size="sm">
                    <a href={`/api/admin/backup?scope=${item.scope}`} target="_blank" rel="noreferrer">
                      <Download />
                      Baixar JSON
                    </a>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </section>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Boas práticas</CardTitle>
              <CardDescription>
                Guarde o arquivo em local seguro, com acesso restrito. O backup pode conter dados pessoais,
                financeiros e informações sensíveis de saúde protegidas pela LGPD.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      )}
    </>
  );
}
