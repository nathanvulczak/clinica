"use client";

import { useEffect } from "react";
import { useToast } from "@/components/ui/toast";

const clinicMessages: Record<string, string> = {
  created: "Clínica cadastrada e proprietário vinculado.",
  updated: "Cadastro da clínica atualizado.",
};

export function ClinicStatusToast({ status }: { status?: string }) {
  const { toast } = useToast();

  useEffect(() => {
    if (!status || !clinicMessages[status]) {
      return;
    }

    toast({
      title: "Clínica",
      description: clinicMessages[status],
    });
  }, [status, toast]);

  return null;
}
