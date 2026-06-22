"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Building2, Check, ChevronDown } from "lucide-react";
import { setActiveClinicAction } from "@/features/clinics/context-actions";
import type { Clinic } from "@/types/domain";
import { useToast } from "@/components/ui/toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ClinicSwitcher({
  clinics,
  activeClinicId,
}: {
  clinics: Clinic[];
  activeClinicId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();
  const activeClinic = clinics.find((clinic) => clinic.id === activeClinicId);

  if (clinics.length === 0) {
    return (
      <div className="flex h-7 max-w-44 items-center gap-1.5 rounded-[5px] px-2 text-[12px] text-muted-foreground">
        <Building2 className="size-3.5" />
        <span className="truncate">Nenhuma clínica</span>
      </div>
    );
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={pending}
          className="flex h-7 max-w-48 items-center gap-1.5 rounded-[5px] px-2 text-[12px] text-foreground/75 outline-none transition-colors duration-75 hover:bg-black/[0.055] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 data-[state=open]:bg-black/[0.055] disabled:opacity-50"
          title="Selecionar clínica ativa"
        >
          <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{activeClinic?.trade_name ?? "Selecionar clínica"}</span>
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-60">
        {clinics.map((clinic) => (
          <DropdownMenuItem
            key={clinic.id}
            disabled={pending || clinic.id === activeClinicId}
            onSelect={() => {
              const formData = new FormData();
              formData.set("clinic_id", clinic.id);
              toast({
                title: "Clínica ativa",
                description: `${clinic.trade_name} agora é o contexto ativo.`,
              });
              startTransition(() => {
                void setActiveClinicAction(formData).then(() => router.refresh());
              });
            }}
          >
            <span className="min-w-0 flex-1 truncate">{clinic.trade_name}</span>
            {clinic.id === activeClinicId ? <Check className="size-3.5" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
