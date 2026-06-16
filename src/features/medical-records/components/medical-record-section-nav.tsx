"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, FileText, LoaderCircle, Settings2, Stethoscope, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";

const sections = [
  { id: "queue", label: "Fila clinica", icon: Stethoscope },
  { id: "records", label: "Registros", icon: FileText },
  { id: "patients", label: "Pacientes", icon: UsersRound },
  { id: "reports", label: "Relatorios", icon: BarChart3 },
  { id: "preferences", label: "Preferencias", icon: Settings2 },
] as const;

export type MedicalRecordSection = (typeof sections)[number]["id"];

export function MedicalRecordSectionNav({ activeSection }: { activeSection: MedicalRecordSection }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="grid gap-2">
      <nav className="flex gap-2 overflow-x-auto border-b pb-3">
        {sections.map((item) => {
          const active = activeSection === item.id;

          return (
            <Button
              key={item.id}
              type="button"
              variant={active ? "secondary" : "ghost"}
              size="sm"
              disabled={pending && !active}
              onClick={() => {
                if (active) return;
                startTransition(() => {
                  router.push(`/prontuarios?section=${item.id}`, { scroll: false });
                });
              }}
            >
              <item.icon />
              {item.label}
            </Button>
          );
        })}
      </nav>
      {pending ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
          <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" />
          Carregando secao...
        </div>
      ) : null}
    </div>
  );
}
