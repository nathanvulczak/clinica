import { PageHeader } from "@/components/app/page-header";

export default function ProntuariosLoading() {
  return (
    <>
      <PageHeader
        title="Prontuarios"
        description="Carregando registros clinicos da clinica ativa."
      />
      <div className="grid gap-4">
        <div className="h-12 animate-pulse rounded-lg bg-muted" />
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="h-28 animate-pulse rounded-lg bg-muted" />
          <div className="h-28 animate-pulse rounded-lg bg-muted" />
          <div className="h-28 animate-pulse rounded-lg bg-muted" />
        </div>
        <div className="h-52 animate-pulse rounded-lg bg-muted" />
      </div>
    </>
  );
}
