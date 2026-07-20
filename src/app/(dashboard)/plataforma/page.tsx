import Link from "next/link";
import { Activity, AlertTriangle, Database, KeyRound, LifeBuoy, ShieldCheck, Users, Webhook } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { endBreakGlassAction, requestBreakGlassAction, runPlatformDiagnosticsAction } from "@/features/platform/actions";
import { getPlatformSnapshot } from "@/repositories/platform";
import { getPlatformAccess, type PlatformScope } from "@/services/authorization/platform-access";
import { ROLE_LABELS } from "@/config/permissions";

const sections: Array<{ key: PlatformScope; label: string }> = [
  { key: "overview", label: "Visão geral" },
  { key: "health", label: "Saúde e integrações" },
  { key: "access", label: "Acessos e controle" },
  { key: "billing", label: "Billing" },
  { key: "audit", label: "Auditoria técnica" },
  { key: "diagnostics", label: "Diagnósticos" },
];

function dateTime(value: string | null | undefined) {
  if (!value) return "Não informado";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value));
}

function Metric({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Activity }) {
  return (
    <div className="rounded-md border bg-card px-3 py-2.5">
      <div className="flex items-center justify-between gap-2"><span className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</span><Icon className="size-3.5 text-primary" /></div>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export default async function PlatformPage({ searchParams }: { searchParams: Promise<{ section?: string; diagnostics?: string; error?: string; break_glass?: string }> }) {
  const access = await getPlatformAccess();
  const params = await searchParams;
  const snapshot = await getPlatformSnapshot();

  if (!access.allowed) {
    return <><PageHeader title="Plataforma" description="Administração técnica global do CliniCore." /><Card><CardHeader><CardTitle>Acesso restrito</CardTitle><CardDescription>Este espaço é reservado às funções técnicas da plataforma. O acesso clínico continua sendo administrado pela própria clínica.</CardDescription></CardHeader></Card></>;
  }

  const requestedSection = sections.some((item) => item.key === params.section) ? (params.section as PlatformScope) : "overview";
  const sectionAllowed = access.can(requestedSection);
  const roleLabel = access.role ? ROLE_LABELS[access.role] : "Função técnica";
  const mutedBadge = "bg-muted text-muted-foreground";

  return (
    <>
      <PageHeader title="Controle da plataforma" description="Saúde, governança e operação técnica sem expor prontuários, laudos ou conteúdo clínico." action={<Badge className="bg-primary/10 text-primary">{roleLabel}</Badge>} />
      <div className="grid gap-4">
        <nav className="flex flex-wrap gap-1 rounded-md border bg-card p-1" aria-label="Seções do controle da plataforma">
          {sections.map((item) => <Link key={item.key} href={`/plataforma?section=${item.key}`} className={`rounded px-2.5 py-1.5 text-xs transition-colors ${requestedSection === item.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>{item.label}</Link>)}
        </nav>

        {params.error ? <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"><AlertTriangle className="size-4" />A ação não pôde ser concluída. Verifique a permissão e tente novamente.</div> : null}
        {params.diagnostics === "complete" ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">Diagnósticos técnicos registrados com sucesso.</div> : null}
        {params.break_glass === "requested" ? <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">Solicitação de acesso emergencial registrada para aprovação. Nenhum dado clínico foi aberto.</div> : null}
        {params.break_glass === "ended" ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">Solicitação encerrada.</div> : null}

        {!sectionAllowed ? <Card><CardHeader><CardTitle>Seção restrita</CardTitle><CardDescription>Seu papel técnico não possui acesso a esta área.</CardDescription></CardHeader></Card> : null}

        {sectionAllowed && requestedSection === "overview" ? <>
          <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Clínicas ativas" value={snapshot.metrics.clinics} icon={Activity} />
            <Metric label="Usuários" value={snapshot.metrics.users} icon={Users} />
            <Metric label="Assinaturas" value={snapshot.metrics.activeSubscriptions} icon={Webhook} />
            <Metric label="Auditoria em 24h" value={snapshot.metrics.auditEvents24h} icon={ShieldCheck} />
            <Metric label="Logins em 24h" value={snapshot.metrics.loginEvents24h} icon={KeyRound} />
            <Metric label="Acessos negados" value={snapshot.metrics.deniedEvents24h} icon={AlertTriangle} />
            <Metric label="Eventos billing" value={snapshot.metrics.pendingBillingEvents} icon={Webhook} />
            <Metric label="Migrations" value={snapshot.migrations.length} icon={Database} />
          </section>
          <section className="grid gap-4 lg:grid-cols-2">
            <Card><CardHeader><CardTitle className="text-base">Clínicas cadastradas</CardTitle><CardDescription>Somente dados administrativos e status técnico.</CardDescription></CardHeader><CardContent className="grid gap-2">{snapshot.clinics.slice(0, 8).map((clinic) => <div key={clinic.id} className="flex items-center justify-between gap-3 rounded border px-3 py-2 text-xs"><span className="min-w-0 truncate font-medium">{clinic.name}</span><Badge className={mutedBadge}>{clinic.status === "active" ? "Ativa" : "Suspensa"}</Badge></div>)}</CardContent></Card>
            <Card><CardHeader><CardTitle className="text-base">Últimas migrations</CardTitle><CardDescription>Controle do versionamento aplicado no banco.</CardDescription></CardHeader><CardContent className="grid gap-2">{snapshot.migrations.slice(0, 8).map((migration) => <div key={migration.migration_name} className="flex items-center justify-between gap-3 rounded border px-3 py-2 text-xs"><span className="min-w-0 truncate font-medium">{migration.migration_name}</span><span className="shrink-0 text-muted-foreground">{dateTime(migration.applied_at)}</span></div>)}</CardContent></Card>
          </section>
        </> : null}

        {sectionAllowed && requestedSection === "health" ? <section className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start"><Card><CardHeader><CardTitle className="text-base">Saúde técnica</CardTitle><CardDescription>Últimas verificações registradas sem conteúdo assistencial.</CardDescription></CardHeader><CardContent className="grid gap-2">{snapshot.health.length ? snapshot.health.slice(0, 12).map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded border px-3 py-2 text-xs"><div className="min-w-0"><p className="font-medium">{item.check_name}</p><p className="truncate text-muted-foreground">{item.summary}</p></div><Badge className={mutedBadge}>{item.status}</Badge></div>) : <p className="text-sm text-muted-foreground">Ainda não há verificações registradas.</p>}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">Executar verificações</CardTitle><CardDescription>Registra checks técnicos no painel.</CardDescription></CardHeader><CardContent><form action={runPlatformDiagnosticsAction}><Button type="submit"><Activity />Executar diagnóstico</Button></form></CardContent></Card></section> : null}

        {sectionAllowed && requestedSection === "access" ? <section className="grid gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle className="text-base">Funções da plataforma</CardTitle><CardDescription>Separação entre administração, suporte, billing e segurança.</CardDescription></CardHeader><CardContent className="grid gap-2">{snapshot.users.filter((user) => user.role.startsWith("platform_")).map((user) => <div key={user.id} className="rounded border px-3 py-2 text-xs"><p className="font-medium">{user.name}</p><p className="text-muted-foreground">{user.email ?? "E-mail não informado"} · {ROLE_LABELS[user.role as keyof typeof ROLE_LABELS] ?? user.role}</p></div>)}{!snapshot.users.some((user) => user.role.startsWith("platform_")) ? <p className="text-sm text-muted-foreground">Nenhum operador técnico foi configurado.</p> : null}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">Acesso emergencial</CardTitle><CardDescription>Somente leitura, motivo obrigatório, duração limitada e aprovação registrada. Não abre prontuários.</CardDescription></CardHeader><CardContent><form action={requestBreakGlassAction} className="grid gap-3"><label className="grid gap-1 text-xs font-medium">Escopo<select name="scope" className="h-9 rounded border bg-background px-2 text-sm"><option value="technical_readonly">Técnico</option><option value="support_readonly">Suporte</option><option value="security_review">Segurança</option></select></label><label className="grid gap-1 text-xs font-medium">Duração<input name="duration" type="number" min="5" max="60" defaultValue="15" className="h-9 rounded border bg-background px-2 text-sm" /></label><label className="grid gap-1 text-xs font-medium">Motivo<textarea name="reason" required minLength={10} className="min-h-20 rounded border bg-background px-2 py-1.5 text-sm" placeholder="Explique a necessidade técnica." /></label><Button type="submit"><KeyRound />Solicitar acesso emergencial</Button></form></CardContent></Card><Card className="lg:col-span-2"><CardHeader><CardTitle className="text-base">Solicitações recentes</CardTitle><CardDescription>Solicitações expiradas não concedem acesso.</CardDescription></CardHeader><CardContent className="grid gap-2">{snapshot.grants.map((grant) => <div key={grant.id} className="flex flex-wrap items-center justify-between gap-3 rounded border px-3 py-2 text-xs"><div><p className="font-medium">{grant.scope} · {grant.status}</p><p className="text-muted-foreground">{grant.reason}</p></div><div className="flex items-center gap-2"><span className="text-muted-foreground">até {dateTime(grant.expires_at)}</span>{["requested", "approved", "active"].includes(grant.status) && access.can("controls") ? <form action={endBreakGlassAction}><input type="hidden" name="grant_id" value={grant.id} /><Button type="submit" size="sm" variant="outline">Encerrar</Button></form> : null}</div></div>)}{!snapshot.grants.length ? <p className="text-sm text-muted-foreground">Nenhuma solicitação registrada.</p> : null}</CardContent></Card></section> : null}

        {sectionAllowed && requestedSection === "billing" ? <Card><CardHeader><CardTitle className="text-base">Billing da plataforma</CardTitle><CardDescription>Visão agregada de planos e assinaturas, sem dados de cartão.</CardDescription></CardHeader><CardContent className="grid gap-2">{snapshot.subscriptions.map((item) => <div key={item.owner_user_id} className="flex flex-wrap items-center justify-between gap-3 rounded border px-3 py-2 text-xs"><span className="font-medium">Plano {item.plan_slug}</span><span>{item.status}</span><span className="text-muted-foreground">renovação {dateTime(item.current_period_end)}</span></div>)}</CardContent></Card> : null}

        {sectionAllowed && requestedSection === "audit" ? <Card><CardHeader><CardTitle className="text-base">Auditoria técnica</CardTitle><CardDescription>Eventos operacionais sem valores antigos/novos e sem conteúdo clínico.</CardDescription></CardHeader><CardContent className="grid gap-2">{snapshot.technicalAudit.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded border px-3 py-2 text-xs"><span className="font-medium">{item.action_type}</span><span>{item.module}</span><span>{item.level}</span><span className="text-muted-foreground">{dateTime(item.created_at)}</span></div>)}</CardContent></Card> : null}

        {sectionAllowed && requestedSection === "diagnostics" ? <Card><CardHeader><CardTitle className="text-base">Diagnósticos do sistema</CardTitle><CardDescription>Os testes devem consultar metadados e usar uma clínica técnica fictícia quando criarem dados.</CardDescription></CardHeader><CardContent className="grid gap-3"><div className="flex items-start gap-2 rounded border bg-muted/20 p-3 text-xs text-muted-foreground"><LifeBuoy className="mt-0.5 size-4 shrink-0 text-primary" />Testes de RLS, integridade, timeline, Stripe e migrations continuam no pipeline de verificação. O painel registra o resultado, mas não executa consultas de prontuário.</div><form action={runPlatformDiagnosticsAction}><Button type="submit"><Database />Registrar diagnóstico técnico</Button></form></CardContent></Card> : null}
      </div>
    </>
  );
}
