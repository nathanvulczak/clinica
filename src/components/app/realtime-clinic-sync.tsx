"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

export function RealtimeClinicSync({
  clinicId,
  tables,
}: {
  clinicId: string;
  tables: string[];
}) {
  const router = useRouter();
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      nextChannel.subscribe();
    }
    void connect();

    return () => {
      disposed = true;
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      if (supabase && channel) void supabase.removeChannel(channel);
    };
  }, [clinicId, router, tables]);

  return null;
}
