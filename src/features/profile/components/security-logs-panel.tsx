"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
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
};

const actionOptions = [
  ["all", "Todos"],
  ["login", "Login"],
  ["logout", "Logout"],
  ["password_changed", "Senha alterada"],
  ["profile_updated", "Perfil atualizado"],
  ["avatar_uploaded", "Imagem alterada"],
  ["preferences_updated", "Preferências"],
] as const;

export function SecurityLogsPanel() {
  const [logs, setLogs] = useState<SecurityLog[]>([]);
  const [actionType, setActionType] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);

  const loadLogs = useCallback(async () => {
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
    } finally {
      setLoading(false);
    }
  }, [actionType, from, to]);

  useEffect(() => {
    void loadLogs();
    const interval = window.setInterval(() => void loadLogs(), 15000);

    return () => window.clearInterval(interval);
  }, [loadLogs]);

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
          <RefreshCw className={loading ? "animate-spin" : ""} />
          Atualizar
        </Button>
      </div>

      <div className="grid gap-2">
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum evento encontrado para os filtros aplicados.</p>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="flex flex-col gap-1 rounded-md border px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="font-medium">{log.action_type}</span>
                {log.notes ? <p className="text-xs text-muted-foreground">{log.notes}</p> : null}
              </div>
              <span className="text-muted-foreground">{formatDateTimeBr(log.created_at)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
