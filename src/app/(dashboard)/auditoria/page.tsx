import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const auditEvents = [
  "login",
  "logout",
  "record_created",
  "record_updated",
  "record_deleted",
  "medical_record_viewed",
  "permission_changed",
  "subscription_changed",
  "access_denied",
];

export default function AuditoriaPage() {
  return (
    <>
      <PageHeader
        title="Auditoria e logs"
        description="A migration cria a tabela audit_logs com IP, user agent, valores antigos/novos, severidade e vínculo com clínica."
      />
      <Card>
        <CardHeader>
          <CardTitle>Eventos rastreáveis</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {auditEvents.map((event) => (
            <div key={event} className="rounded-md border bg-background px-3 py-2 text-sm">
              {event}
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
