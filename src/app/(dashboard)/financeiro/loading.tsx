import { LoaderCircle } from "lucide-react";

export default function FinanceiroLoading() {
  return (
    <div className="grid gap-5">
      <div className="h-16 animate-pulse rounded-lg bg-muted" />
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" />
        Carregando modulo financeiro...
      </div>
      <div className="grid gap-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-lg bg-muted" />
    </div>
  );
}
