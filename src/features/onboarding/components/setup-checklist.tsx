"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Rocket, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ClinicSetupStep } from "@/features/onboarding/setup-progress";

export function SetupChecklist({ steps }: { steps: ClinicSetupStep[] }) {
  const [open, setOpen] = useState(false);
  const completed = useMemo(() => steps.filter((step) => step.complete).length, [steps]);
  const nextStep = steps.find((step) => !step.complete);
  if (!steps.length || completed === steps.length) return null;

  return (
    <div className="fixed bottom-5 right-5 z-40 w-[min(360px,calc(100vw-2rem))]">
      {open ? (
        <section className="overflow-hidden rounded-lg border bg-card shadow-[0_16px_45px_rgb(15_23_42/0.16)]">
          <header className="flex items-start justify-between gap-3 border-b px-4 py-3"><div><div className="flex items-center gap-2"><Rocket className="size-4 text-primary" /><p className="text-sm font-semibold">Implantação da clínica</p></div><p className="mt-1 text-xs text-muted-foreground">{completed} de {steps.length} etapas concluídas</p></div><Button type="button" size="icon" variant="ghost" className="size-8" onClick={() => setOpen(false)} aria-label="Recolher implantação"><X /></Button></header>
          <div className="h-1 bg-muted"><div className="h-full bg-primary transition-[width] duration-150" style={{ width: `${(completed / steps.length) * 100}%` }} /></div>
          <div className="max-h-[390px] overflow-y-auto p-2">{steps.map((step, index) => <Link key={step.key} href={step.href} className={`flex gap-3 rounded-md px-2.5 py-2.5 transition-colors duration-150 ${step.complete ? "opacity-60" : "hover:bg-muted/50"}`}><span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${step.complete ? "bg-emerald-600 text-white" : "border bg-background text-muted-foreground"}`}>{step.complete ? <Check className="size-3" /> : <span className="text-[10px]">{index + 1}</span>}</span><span><span className="block text-sm font-medium">{step.title}</span><span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{step.description}</span></span></Link>)}</div>
        </section>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="ml-auto flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-left shadow-[0_10px_30px_rgb(15_23_42/0.12)] transition-transform duration-150 hover:-translate-y-0.5"><span className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary"><Rocket className="size-4" /></span><span><span className="block text-xs font-semibold">Implantação {completed}/{steps.length}</span><span className="block max-w-56 truncate text-[11px] text-muted-foreground">{nextStep?.title}</span></span><ChevronDown className="size-4 rotate-180 text-muted-foreground" /></button>
      )}
    </div>
  );
}
