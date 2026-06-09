import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function UsuariosLoading() {
  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <div className="h-8 w-72 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-full max-w-2xl animate-pulse rounded-md bg-muted" />
      </div>
      <Card>
        <CardHeader className="grid gap-2">
          <div className="h-5 w-52 animate-pulse rounded-md bg-muted" />
          <div className="h-4 w-80 max-w-full animate-pulse rounded-md bg-muted" />
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex justify-between gap-4 border-b pb-5">
            <div className="h-10 w-48 animate-pulse rounded-md bg-muted" />
            <div className="h-10 w-40 animate-pulse rounded-md bg-muted" />
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_190px_180px]">
            <div className="h-10 animate-pulse rounded-md bg-muted" />
            <div className="h-10 animate-pulse rounded-md bg-muted" />
            <div className="h-10 animate-pulse rounded-md bg-muted" />
          </div>
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-40 animate-pulse rounded-lg border bg-muted/70" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
