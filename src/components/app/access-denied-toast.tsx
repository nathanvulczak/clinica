"use client";

import { useEffect } from "react";
import { MODULE_LABELS } from "@/config/permissions";
import type { PermissionModule } from "@/types/domain";
import { useToast } from "@/components/ui/toast";

export function AccessDeniedToast({
  denied,
  module,
}: {
  denied?: boolean;
  module?: string;
}) {
  const { toast } = useToast();

  useEffect(() => {
    if (!denied) {
      return;
    }

    const moduleLabel = MODULE_LABELS[module as PermissionModule] ?? "este módulo";
    toast({
      title: "Acesso não autorizado",
      description: `Seu perfil não possui permissão para acessar ${moduleLabel}. Solicite a liberação a um administrador da clínica.`,
      variant: "destructive",
    });
  }, [denied, module, toast]);

  return null;
}
