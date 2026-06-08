import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function DashboardLoading() {
  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <div className="h-8 w-64 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-full max-w-xl animate-pulse rounded-md bg-muted" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index}>
            <CardHeader>
              <div className="h-4 w-28 animate-pulse rounded-md bg-muted" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-20 animate-pulse rounded-md bg-muted" />
              <div className="mt-3 h-3 w-32 animate-pulse rounded-md bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <div className="h-5 w-40 animate-pulse rounded-md bg-muted" />
        </CardHeader>
        <CardContent>
          <div className="h-32 animate-pulse rounded-md bg-muted" />
        </CardContent>
      </Card>
    </div>
  );
}
