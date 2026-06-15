import { LoaderCircle } from "lucide-react";

export function PageLoading({
  title = "Carregando informações",
  rows = 4,
}: {
  title?: string;
  rows?: number;
}) {
  return (
    <div className="grid gap-6" role="status" aria-live="polite">
      <div className="flex items-center gap-3 border-b pb-4">
        <LoaderCircle className="size-5 animate-spin text-primary motion-reduce:animate-none" />
        <p className="text-sm font-medium">{title}</p>
      </div>
      <div className="grid gap-3">
        {Array.from({ length: rows }).map((_, index) => (
          <div
            key={index}
            className="h-20 animate-pulse rounded-lg border bg-muted/60 motion-reduce:animate-none"
          />
        ))}
      </div>
    </div>
  );
}
