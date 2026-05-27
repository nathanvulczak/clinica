import { PERMISSION_MODULES, ROLE_LABELS } from "@/config/permissions";
import { getActiveClinicContext } from "@/features/clinics/context";
import { formatDateTimeBr } from "@/lib/dates";
import { listClinicMembers } from "@/repositories/clinics";
import { listClinicAuditLogs, type AuditLogFilters } from "@/repositories/audit";
import type { AppRole, PermissionModule } from "@/types/domain";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

const actionTypes = [
  "all",
  "login",
  "logout",
  "record_created",
  "record_updated",
  "record_deleted",
  "clinic_created",
  "member_invited",
  "member_added",
  "member_updated",
  "member_role_updated",
  "member_suspended",
  "profile_updated",
  "avatar_uploaded",
  "preferences_updated",
  "subscription_changed",
  "access_denied",
];

const levels = ["all", "info", "warning", "critical", "security"];

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const { activeClinic } = await getActiveClinicContext();
  const filters: AuditLogFilters = {
    from: params.from,
    to: params.to,
    action_type: params.action_type,
    module: params.module as PermissionModule | "all" | undefined,
    level: params.level,
    user_id: params.user_id,
    role: params.role as AppRole | "all" | undefined,
  };

  const [members, logs] = await Promise.all([
    listClinicMembers(activeClinic?.id),
    listClinicAuditLogs(activeClinic?.id, filters),
  ]);

  return (
    <>
      <PageHeader
        title="Auditoria e logs"
        description="Rastreie ações da clínica ativa com filtros, valores antigos/novos, IP, dispositivo e severidade."
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>
            {activeClinic ? `Contexto atual: ${activeClinic.trade_name}` : "Selecione ou cadastre uma clínica para consultar logs."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] lg:items-end">
            <div className="grid gap-2">
              <Label htmlFor="from">De</Label>
              <Input id="from" name="from" type="date" defaultValue={filters.from ?? ""} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="to">Até</Label>
              <Input id="to" name="to" type="date" defaultValue={filters.to ?? ""} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="action_type">Ação</Label>
              <Select id="action_type" name="action_type" defaultValue={filters.action_type ?? "all"}>
                {actionTypes.map((action) => (
                  <option key={action} value={action}>
                    {action === "all" ? "Todas" : action}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="module">Módulo</Label>
              <Select id="module" name="module" defaultValue={filters.module ?? "all"}>
                <option value="all">Todos</option>
                {PERMISSION_MODULES.map((module) => (
                  <option key={module} value={module}>
                    {module}
                  </option>
                ))}
              </Select>
            </div>
            <Button>Filtrar</Button>
            <div className="grid gap-2">
              <Label htmlFor="level">Nível</Label>
              <Select id="level" name="level" defaultValue={filters.level ?? "all"}>
                {levels.map((level) => (
                  <option key={level} value={level}>
                    {level === "all" ? "Todos" : level}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="role">Tipo de usuário</Label>
              <Select id="role" name="role" defaultValue={filters.role ?? "all"}>
                <option value="all">Todos</option>
                {Object.entries(ROLE_LABELS).map(([role, label]) => (
                  <option key={role} value={role}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-2 lg:col-span-2">
              <Label htmlFor="user_id">Usuário</Label>
              <Select id="user_id" name="user_id" defaultValue={filters.user_id ?? "all"}>
                <option value="all">Todos</option>
                {members.map((member) => (
                  <option key={member.user_id} value={member.user_id}>
                    {member.profile?.full_name ?? member.user_id}
                  </option>
                ))}
              </Select>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Eventos registrados</CardTitle>
          <CardDescription>{logs.length} evento(s) encontrados para a clínica ativa.</CardDescription>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum evento encontrado para os filtros aplicados.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <div className="grid min-w-[1100px] grid-cols-[170px_160px_170px_1fr_170px] bg-muted px-4 py-3 text-xs font-medium uppercase text-muted-foreground">
                <span>Data</span>
                <span>Ação</span>
                <span>Usuário</span>
                <span>Registro</span>
                <span>Detalhes</span>
              </div>
              <div className="min-w-[1100px] divide-y">
                {logs.map((log) => (
                  <div key={log.id} className="grid grid-cols-[170px_160px_170px_1fr_170px] gap-3 px-4 py-3 text-sm">
                    <span className="text-muted-foreground">{formatDateTimeBr(log.created_at)}</span>
                    <div className="grid gap-1">
                      <span className="font-medium">{log.action_type}</span>
                      <Badge>{log.level}</Badge>
                    </div>
                    <div>
                      <p className="font-medium">{log.user?.full_name ?? "Sistema"}</p>
                      <p className="text-xs text-muted-foreground">{log.user?.email ?? log.user_id ?? "sem usuário"}</p>
                    </div>
                    <div>
                      <p className="font-medium">{log.record_table ?? log.module ?? "registro"}</p>
                      <p className="text-xs text-muted-foreground">{log.record_id ?? log.notes ?? "sem referência"}</p>
                      {log.ip_address ? <p className="text-xs text-muted-foreground">IP: {log.ip_address}</p> : null}
                    </div>
                    <details className="text-xs">
                      <summary className="cursor-pointer font-medium text-primary">Ver alterações</summary>
                      <pre className="mt-2 max-h-72 overflow-auto rounded-md bg-muted p-3 text-[11px] leading-5">
                        {JSON.stringify(
                          {
                            anterior: log.old_values,
                            novo: log.new_values,
                            dispositivo: log.user_agent,
                            observacoes: log.notes,
                          },
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
