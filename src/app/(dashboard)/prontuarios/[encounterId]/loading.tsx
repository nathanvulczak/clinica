import { PageHeader } from "@/components/app/page-header";

export default function MedicalRecordLoading() {
  return (
    <>
      <PageHeader
        title="Prontuario do atendimento"
        description="Carregando ficha clinica com seguranca."
      />
      <div className="grid gap-4">
        <div className="h-24 animate-pulse rounded-lg bg-muted" />
        <div className="h-40 animate-pulse rounded-lg bg-muted" />
        <div className="h-80 animate-pulse rounded-lg bg-muted" />
      </div>
    </>
  );
}
