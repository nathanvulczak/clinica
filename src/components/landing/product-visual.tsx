import {
  Banknote,
  CalendarDays,
  Check,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  HeartPulse,
  Stethoscope,
  UserRound,
} from "lucide-react";

const appointments = [
  { time: "08:30", patient: "Marina Costa", service: "Consulta", tone: "bg-sky-100 text-sky-800" },
  { time: "09:20", patient: "Paulo Mendes", service: "Retorno", tone: "bg-emerald-100 text-emerald-800" },
  { time: "10:10", patient: "Ana Ribeiro", service: "Avaliação", tone: "bg-amber-100 text-amber-900" },
];

export function LandingProductVisual() {
  return (
    <div className="landing-product-scene pointer-events-none absolute inset-y-16 right-[-12%] w-[70%] min-w-[760px] lg:right-[-5%] xl:right-[1%] xl:w-[61%]">
      <div className="landing-window absolute inset-x-0 top-6 overflow-hidden rounded-lg border border-black/10 bg-white shadow-[0_30px_80px_rgb(30_45_42/0.16)]">
        <div className="flex h-9 items-center gap-3 border-b bg-[#f5f5f3] px-3 text-[11px] text-neutral-600">
          <div className="flex size-5 items-center justify-center rounded bg-primary text-white"><HeartPulse className="size-3" /></div>
          <strong className="text-neutral-900">CliniCore</strong>
          <span className="h-4 w-px bg-neutral-300" />
          <span>Painel</span><span>Agenda</span><span>Atendimentos</span><span>Prontuários</span><span>Financeiro</span>
          <ChevronDown className="ml-auto size-3" />
        </div>
        <div className="grid grid-cols-[1.08fr_.92fr] gap-3 bg-[#fbfbfa] p-4">
          <section className="min-w-0">
            <div className="mb-3 flex items-center justify-between">
              <div><p className="text-[11px] text-neutral-500">Agenda de hoje</p><p className="text-sm font-semibold">Operação da clínica</p></div>
              <span className="rounded border bg-white px-2 py-1 text-[10px] text-neutral-600">Semana</span>
            </div>
            <div className="grid grid-cols-[46px_1fr] overflow-hidden rounded-md border bg-white">
              <div className="border-r bg-neutral-50 text-center text-[9px] text-neutral-400">
                {[8, 9, 10, 11].map((hour) => <div key={hour} className="h-[52px] border-b pt-2">{hour}:00</div>)}
              </div>
              <div className="relative">
                {[0, 1, 2, 3].map((row) => <div key={row} className="h-[52px] border-b" />)}
                {appointments.map((item, index) => (
                  <div key={item.patient} className={`landing-appointment absolute left-2 right-2 flex h-10 items-center gap-2 rounded px-2 ${item.tone}`} style={{ top: 8 + index * 52, animationDelay: `${index * 650}ms` }}>
                    <span className="text-[10px] font-semibold">{item.time}</span>
                    <span className="h-5 w-px bg-current opacity-20" />
                    <span className="min-w-0"><span className="block truncate text-[10px] font-semibold">{item.patient}</span><span className="block text-[9px] opacity-70">{item.service}</span></span>
                  </div>
                ))}
              </div>
            </div>
          </section>
          <section className="grid content-start gap-2.5">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-md border bg-white p-2.5"><CalendarDays className="size-3.5 text-sky-600" /><p className="mt-3 text-base font-semibold tabular-nums">18</p><p className="text-[9px] text-neutral-500">Agendados</p></div>
              <div className="rounded-md border bg-white p-2.5"><Clock3 className="size-3.5 text-amber-600" /><p className="mt-3 text-base font-semibold tabular-nums">4</p><p className="text-[9px] text-neutral-500">Aguardando</p></div>
              <div className="rounded-md border bg-white p-2.5"><CircleDollarSign className="size-3.5 text-emerald-600" /><p className="mt-3 text-base font-semibold tabular-nums">12</p><p className="text-[9px] text-neutral-500">Recebidos</p></div>
            </div>
            <div className="rounded-md border bg-white p-3">
              <div className="flex items-center justify-between"><p className="text-[10px] font-semibold">Fluxo assistencial</p><span className="text-[9px] text-neutral-400">tempo real</span></div>
              <div className="mt-3 grid gap-2">
                {[{ icon: UserRound, label: "Paciente chegou", meta: "Recepção", color: "text-sky-600" }, { icon: HeartPulse, label: "Pré-consulta concluída", meta: "Enfermagem", color: "text-rose-600" }, { icon: Stethoscope, label: "Pronto para consulta", meta: "Profissional", color: "text-emerald-600" }].map((item) => (
                  <div key={item.label} className="landing-workflow-row flex items-center gap-2 rounded bg-neutral-50 px-2 py-1.5">
                    <item.icon className={`size-3 ${item.color}`} /><span className="flex-1 text-[9px] font-medium">{item.label}</span><span className="text-[8px] text-neutral-400">{item.meta}</span><Check className="size-3 text-emerald-600" />
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-md border bg-[#162422] p-3 text-white">
              <div className="flex items-center gap-2"><Banknote className="size-3.5 text-emerald-300" /><p className="text-[10px] font-medium">Visão financeira</p></div>
              <div className="mt-3 flex items-end justify-between"><div><p className="text-[9px] text-white/55">Recebido no mês</p><p className="text-lg font-semibold tabular-nums">R$ 42.680</p></div><div className="flex h-9 items-end gap-1">{[38, 62, 48, 78, 66, 92, 76].map((height, index) => <span key={index} className="landing-bar w-2 rounded-sm bg-emerald-300/80" style={{ height: `${height}%`, animationDelay: `${index * 120}ms` }} />)}</div></div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
