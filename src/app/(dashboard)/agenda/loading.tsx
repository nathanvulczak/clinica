function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />;
}

export default function AgendaLoading() {
  return (
    <div className="grid gap-6" aria-label="Carregando agenda">
      <div className="flex items-start justify-between gap-6">
        <div className="grid gap-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-[520px] max-w-full" />
        </div>
        <Skeleton className="h-10 w-44" />
      </div>

      <div className="rounded-md border p-5">
        <div className="grid gap-4 xl:grid-cols-[160px_minmax(240px,1fr)_220px_120px]">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>

      <div className="rounded-md border p-5">
        <div className="flex justify-between gap-4">
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-9 w-64" />
        </div>
        <Skeleton className="mt-5 h-[360px] w-full" />
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28 w-full" />
        ))}
      </div>
    </div>
  );
}
