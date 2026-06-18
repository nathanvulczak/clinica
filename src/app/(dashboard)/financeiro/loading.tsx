import { LoaderCircle } from "lucide-react";

export default function FinanceiroLoading() {
  return (
    <div className="grid gap-5">
      <div className="sticky top-0 z-20 -mx-4 -mt-4 border-b bg-background/95 px-4 pt-3 shadow-sm backdrop-blur lg:-mx-6 lg:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="size-8 animate-pulse rounded-md bg-muted" />
            <div className="grid gap-1">
              <div className="h-3 w-24 animate-pulse rounded bg-muted" />
              <div className="h-3 w-48 animate-pulse rounded bg-muted" />
            </div>
          </div>
          <div className="h-7 w-32 animate-pulse rounded-md bg-muted" />
        </div>
        <div className="mt-3 flex gap-2 overflow-hidden pb-2">
          {Array.from({ length: 7 }).map((_, index) => (
            <div key={index} className="h-9 w-32 shrink-0 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
        <div className="flex gap-2 border-t py-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-8 w-28 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" />
        Carregando módulo financeiro...
      </div>
      <div className="grid gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-lg bg-muted" />
    </div>
  );
}
