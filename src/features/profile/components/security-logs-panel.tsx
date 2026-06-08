"use client";

import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { formatDateTimeBr } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

type SecurityLog = {
  id: string;
  action_type: string;
  created_at: string;
  notes: string | null;
  level: string;
  module: string | null;
  record_table: string | null;
  changed_fields: string[];
};

const actionLabels: Record<string, string> = {
  login: "Login realizado",
  logout: "Logout realizado",
  password_changed: "Senha alterada",
  profile_updated: "Perfil atualizado",
  avatar_uploaded: "Imagem de perfil alterada",
  preferences_updated: "Preferências atualizadas",
  clinic_created: "Clínica cadastrada",
  member_invited: "Convite enviado",
  member_added: "Usuário vinculado",
  member_updated: "Usuário atualizado",
  member_role_updated: "Perfil de usuário alterado",
  member_suspended: "Usuário suspenso",
  clinic_updated: "Clínica atualizada",
  record_created: "Registro criado",
  record_updated: "Registro atualizado",
  record_deleted: "Registro excluído",
  subscription_changed: "Assinatura alterada",
  access_denied: "Tentativa de acesso negada",
};

const moduleLabels: Record<string, string> = {
  clinics: "Clínicas",
  members: "Usuários e permissões",
  permissions: "Permissões",
  billing: "Assinatura e pagamentos",
  audit: "Auditoria",
  patients: "Pacientes",
  medical_records: "Prontuário",
  schedule: "Agenda",
  financial: "Financeiro",
  reports: "Relatórios",
};

const actionOptions = [
  ["all", "Todos"],
  ["login", "Login"],
  ["logout", "Logout"],
  ["password_changed", "Senha alterada"],
  ["profile_updated", "Perfil atualizado"],
  ["avatar_uploaded", "Imagem alterada"],
  ["preferences_updated", "Preferências"],
  ["clinic_created", "Clínica criada"],
  ["clinic_updated", "Clínica atualizada"],
  ["member_invited", "Convite enviado"],
  ["member_added", "Usuário vinculado"],
  ["member_updated", "Usuário atualizado"],
  ["member_role_updated", "Perfil alterado"],
  ["member_suspended", "Usuário suspenso"],
  ["record_created", "Registro criado"],
  ["record_updated", "Registro atualizado"],
  ["record_deleted", "Registro excluído"],
  ["subscription_changed", "Assinatura"],
  ["access_denied", "Acesso negado"],
] as const;

function getFriendlyDescription(log: SecurityLog) {
  const changedFields =
    log.changed_fields.length > 0 ? ` Campos alterados: ${log.changed_fields.join(", ")}.` : "";

  if (log.action_type === "clinic_created") {
    return "A clínica foi cadastrada e seu acesso como proprietário foi registrado.";
  }

  if (log.action_type === "clinic_updated") {
    return `O cadastro administrativo da clínica foi atualizado.${changedFields}`;
  }

  if (log.action_type === "profile_updated") {
    return `Seus dados pessoais foram atualizados.${changedFields}`;
  }

  if (log.action_type === "preferences_updated") {
    return "Suas preferências do sistema foram atualizadas.";
  }

  if (log.action_type === "avatar_uploaded") {
    return "Sua imagem de perfil foi atualizada.";
  }

  if (log.action_type === "subscription_changed") {
    return `Sua assinatura teve alteração registrada.${changedFields}`;
  }

  if (log.action_type === "record_updated") {
    if (log.record_table === "clinic_members") {
      return `Seu vínculo, status ou perfil de acesso em uma clínica foi atualizado.${changedFields}`;
    }

    if (log.record_table === "clinics") {
      return `O cadastro da clínica foi atualizado.${changedFields}`;
    }

    if (log.record_table === "profiles") {
      return `Seu perfil teve alteração registrada.${changedFields}`;
    }

    if (log.record_table === "subscriptions") {
      return `Sua assinatura teve alteração registrada.${changedFields}`;
    }

    return `${moduleLabels[log.module ?? ""] ?? "Um registro"} teve alteração registrada.${changedFields}`;
  }

  return log.notes || moduleLabels[log.module ?? ""] || "Evento registrado no sistema.";
}

export function SecurityLogsPanel() {
  const [logs, setLogs] = useState<SecurityLog[]>([]);
  const [actionType, setActionType] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const loadLogs = useCallback(async () => {
    if (document.hidden) {
      return;
    }

    const params = new URLSearchParams();
    params.set("action_type", actionType);

    if (from) {
      params.set("from", from);
    }

    if (to) {
      params.set("to", to);
    }

    setLoading(true);

    try {
      const response = await fetch(`/api/profile/security-logs?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as { logs?: SecurityLog[] };
      setLogs(payload.logs ?? []);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }, [actionType, from, to]);

  useEffect(() => {
    if (!searched) {
      return;
    }

    const interval = window.setInterval(() => void loadLogs(), 20000);
    const handleVisibility = () => {
      if (!document.hidden) {
        void loadLogs();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [loadLogs, searched]);

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-[1fr_160px_160px_auto] md:items-end">
        <div className="grid gap-2">
          <Label htmlFor="security_action_type">Tipo</Label>
          <Select id="security_action_type" value={actionType} onChange={(event) => setActionType(event.target.value)}>
            {actionOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="security_from">De</Label>
          <Input id="security_from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="security_to">Até</Label>
          <Input id="security_to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </div>
        <Button type="button" variant="outline" onClick={() => void loadLogs()} disabled={loading}>
          <Search />
          {loading ? "Filtrando..." : "Filtrar"}
        </Button>
      </div>

      <div className="grid gap-2">
        {!searched ? (
          <p className="text-sm text-muted-foreground">Use os filtros acima e clique em Filtrar para visualizar seus eventos.</p>
        ) : logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum evento encontrado para os filtros aplicados.</p>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="flex flex-col gap-1 rounded-md border px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="font-medium">{actionLabels[log.action_type] ?? "Evento registrado"}</span>
                <p className="text-xs text-muted-foreground">{getFriendlyDescription(log)}</p>
              </div>
              <span className="text-muted-foreground">{formatDateTimeBr(log.created_at)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
