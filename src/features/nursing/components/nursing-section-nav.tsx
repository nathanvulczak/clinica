"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, FileText, LoaderCircle, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const sections = [
  { id: "queue", label: "Fila", icon: ClipboardList },
  { id: "records", label: "Registros", icon: FileText },
  { id: "preferences", label: "Preferências", icon: Settings2 },
] as const;

export type NursingSection = (typeof sections)[number]["id"];

export function NursingSectionNav({ activeSection }: { activeSection: NursingSection }) {
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
                  router.push(`/enfermagem?section=${item.id}`, { scroll: false });
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
          Carregando seção...
        </div>
      ) : null}
    </div>
  );
}
