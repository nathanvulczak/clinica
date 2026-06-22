"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Radio } from "lucide-react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

export function RealtimeClinicSync({
  clinicId,
  tables,
  visible = false,
}: {
  clinicId: string;
  tables: string[];
  visible?: boolean;
}) {
  const router = useRouter();
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let disposed = false;
    let supabase: SupabaseClient | null = null;
    let channel: RealtimeChannel | null = null;
    const refresh = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => router.refresh(), 450);
    };

    async function connect() {
      const { createSupabaseBrowserClient } = await import("@/lib/supabase/client");
      if (disposed) return;
      supabase = createSupabaseBrowserClient();
      const nextChannel = supabase.channel(`clinic-live:${clinicId}:${tables.join("-")}`);
      for (const table of tables) {
        nextChannel.on(
          "postgres_changes",
          { event: "*", schema: "public", table, filter: `clinic_id=eq.${clinicId}` },
          refresh,
        );
      }
      channel = nextChannel;
      nextChannel.subscribe((status) => setConnected(status === "SUBSCRIBED"));
    }
    void connect();

    return () => {
      disposed = true;
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      if (supabase && channel) void supabase.removeChannel(channel);
    };
  }, [clinicId, router, tables]);

  if (!visible) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <Radio className={connected ? "size-3.5 text-emerald-600" : "size-3.5"} />
      {connected ? "Atualização ao vivo" : "Conectando"}
    </span>
  );
}
