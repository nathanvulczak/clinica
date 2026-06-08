"use client";

import { useEffect } from "react";
import { useToast } from "@/components/ui/toast";

export function BillingStatusToast({
  billing,
  message,
}: {
  billing?: string;
  message?: string;
}) {
  const { toast } = useToast();

  useEffect(() => {
    if (!billing || !message) {
      return;
    }

    toast({
      title: billing === "synced" || billing === "portal_return" ? "Assinatura atualizada" : "Billing",
      description: message,
      variant: billing.includes("failed") || billing.includes("blocked") ? "destructive" : "default",
    });
  }, [billing, message, toast]);

  return null;
}
