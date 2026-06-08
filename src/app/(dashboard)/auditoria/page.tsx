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

const actionLabels: Record<string, string> = {
  all: "Todas",
  login: "Login realizado",
  logout: "Logout realizado",
  record_created: "Registro criado",
  record_updated: "Registro atualizado",
  record_deleted: "Registro excluído",
  clinic_created: "Clínica cadastrada",
  member_invited: "Convite enviado",
  member_added: "Usuário vinculado",
  member_updated: "Usuário atualizado",
  member_role_updated: "Perfil de usuário alterado",
  member_suspended: "Usuário suspenso",
  clinic_updated: "Clínica atualizada",
  profile_updated: "Perfil atualizado",
  avatar_uploaded: "Imagem de perfil alterada",
  preferences_updated: "Preferências alteradas",
  subscription_changed: "Assinatura alterada",
  access_denied: "Acesso negado",
};

const moduleLabels: Record<string, string> = {
  clinics: "Clínicas",
  members: "Usuários",
  permissions: "Permissões",
  billing: "Assinatura",
  audit: "Auditoria",
  patients: "Pacientes",
  medical_records: "Prontuário",
  schedule: "Agenda",
  financial: "Financeiro",
  reports: "Relatórios",
};

const tableLabels: Record<string, string> = {
  profiles: "Perfil do usuário",
  clinics: "Clínica",
  clinic_members: "Membro da clínica",
  subscriptions: "Assinatura",
  invoices: "Pagamento",
  role_permissions: "Permissões do perfil",
  member_permissions: "Permissões do usuário",
};

const actionTypes = Object.keys(actionLabels);
const levels = ["all", "info", "warning", "critical", "security"];
const ignoredAuditFields = new Set(["id", "created_at", "updated_at", "deleted_at", "created_by", "updated_by", "metadata"]);

const fieldLabels: Record<string, string> = {
  legal_name: "Razão social/responsável",
  trade_name: "Nome da clínica",
  document: "CPF/CNPJ",
  email: "E-mail",
  phone: "Telefone",
  city: "Cidade",
  state: "UF",
  role: "Perfil de acesso",
  status: "Status",
  joined_at: "Entrada na clínica",
  invited_by: "Convidado por",
  full_name: "Nome completo",
  cpf: "CPF",
  platform_role: "Perfil global",
  avatar_url: "Imagem de perfil",
  app_preferences: "Preferências",
  plan_slug: "Plano",
  current_period_start: "Início do ciclo",
  current_period_end: "Fim do ciclo",
  cancel_at_period_end: "Cancelamento no fim do ciclo",
  stripe_customer_id: "Cliente Stripe",
  stripe_subscription_id: "Assinatura Stripe",
  amount_due: "Valor cobrado",
  amount_paid: "Valor pago",
  hosted_invoice_url: "Link da fatura",
};

function formatJson(value: Record<string, unknown> | null) {
  if (!value) {
    return "Sem dados registrados.";
  }

  return JSON.stringify(value, null, 2);
}

function formatAuditValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "Não informado";
  }

  if (typeof value === "boolean") {
    return value ? "Sim" : "Não";
  }

  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      return formatDateTimeBr(value);
    }

    return value;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return JSON.stringify(value);
}

function getAuditChanges(log: {
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
}) {
  const keys = new Set([...Object.keys(log.old_values ?? {}), ...Object.keys(log.new_values ?? {})]);

  return [...keys]
    .filter((key) => !ignoredAuditFields.has(key))
    .map((key) => ({
      key,
      label: fieldLabels[key] ?? key,
      oldValue: formatAuditValue(log.old_values?.[key]),
      newValue: formatAuditValue(log.new_values?.[key]),
    }))
    .filter((change) => change.oldValue !== change.newValue);
}

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
        description="Rastreie ações da clínica ativa com filtros, valores anteriores, valores substituídos, IP, dispositivo e severidade."
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
                    {actionLabels[action]}
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
                    {moduleLabels[module] ?? module}
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
            <p className="text-sm text-muted-foreground">
              Nenhum evento encontrado. Se a clínica acabou de ser criada, confirme se as migrations 005 e 006 foram aplicadas no Supabase.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <div className="grid min-w-[1120px] grid-cols-[170px_180px_180px_1fr_180px] bg-muted px-4 py-3 text-xs font-medium uppercase text-muted-foreground">
                <span>Data</span>
                <span>Ação</span>
                <span>Usuário</span>
                <span>Registro afetado</span>
                <span>Alterações</span>
              </div>
              <div className="min-w-[1120px] divide-y">
                {logs.map((log) => {
                  const changes = getAuditChanges(log);

                  return (
                    <div key={log.id} className="grid grid-cols-[170px_180px_180px_1fr_180px] gap-3 px-4 py-3 text-sm">
                      <span className="text-muted-foreground">{formatDateTimeBr(log.created_at)}</span>
                      <div className="grid gap-1">
                        <span className="font-medium">{actionLabels[log.action_type] ?? log.action_type}</span>
                        <Badge>{log.level}</Badge>
                      </div>
                      <div>
                        <p className="font-medium">{log.user?.full_name ?? "Sistema"}</p>
                        <p className="text-xs text-muted-foreground">{log.user?.email ?? log.user_id ?? "sem usuário"}</p>
                      </div>
                      <div>
                        <p className="font-medium">
                          {tableLabels[log.record_table ?? ""] ?? moduleLabels[log.module ?? ""] ?? "Registro do sistema"}
                        </p>
                        <p className="text-xs text-muted-foreground">{log.notes ?? "Evento auditado."}</p>
                        {log.record_id ? <p className="text-xs text-muted-foreground">ID: {log.record_id}</p> : null}
                        {log.ip_address ? <p className="text-xs text-muted-foreground">IP: {log.ip_address}</p> : null}
                      </div>
                      <details className="text-xs">
                        <summary className="cursor-pointer font-medium text-primary">Ver dados</summary>
                        <div className="mt-2 grid gap-3">
                          {changes.length > 0 ? (
                            <div className="overflow-hidden rounded-md border">
                              <div className="grid grid-cols-[130px_1fr_1fr] bg-muted px-3 py-2 font-medium">
                                <span>Campo</span>
                                <span>Antes</span>
                                <span>Depois</span>
                              </div>
                              {changes.map((change) => (
                                <div key={change.key} className="grid grid-cols-[130px_1fr_1fr] gap-2 border-t px-3 py-2">
                                  <span className="font-medium">{change.label}</span>
                                  <span className="break-words text-muted-foreground">{change.oldValue}</span>
                                  <span className="break-words">{change.newValue}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-muted-foreground">Nenhuma alteração de campo relevante foi registrada.</p>
                          )}
                          <details>
                            <summary className="cursor-pointer text-muted-foreground">Ver JSON técnico</summary>
                            <div className="mt-2 grid gap-2">
                              <div>
                                <p className="mb-1 font-medium">Dado anterior</p>
                                <pre className="max-h-44 overflow-auto rounded-md bg-muted p-3 text-[11px] leading-5">
                                  {formatJson(log.old_values)}
                                </pre>
                              </div>
                              <div>
                                <p className="mb-1 font-medium">Substituído por</p>
                                <pre className="max-h-44 overflow-auto rounded-md bg-muted p-3 text-[11px] leading-5">
                                  {formatJson(log.new_values)}
                                </pre>
                              </div>
                            </div>
                          </details>
                          {log.user_agent ? <p className="text-muted-foreground">Dispositivo: {log.user_agent}</p> : null}
                        </div>
                      </details>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
