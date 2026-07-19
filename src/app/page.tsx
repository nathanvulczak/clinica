import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileClock,
  HeartPulse,
  LockKeyhole,
  ShieldCheck,
  Stethoscope,
  UsersRound,
} from "lucide-react";
import { PlanCards } from "@/features/billing/components/plan-cards";
import { LandingProductVisual } from "@/components/landing/product-visual";
import { Button } from "@/components/ui/button";

const modules = [
  { icon: CalendarDays, title: "Agenda que organiza o dia", description: "Visualize profissionais, horários, confirmações, faltas e bloqueios sem perder o contexto da clínica." },
  { icon: UsersRound, title: "Cadastros conectados", description: "Pacientes, profissionais, serviços e consultórios alimentam toda a operação sem duplicidade de informações." },
  { icon: HeartPulse, title: "Pré-consulta estruturada", description: "A enfermagem registra sinais vitais e observações com campos definidos pela própria clínica." },
  { icon: Stethoscope, title: "Prontuário por atendimento", description: "Evoluções, documentos, anexos e histórico clínico ficam disponíveis apenas para quem possui autorização." },
  { icon: Banknote, title: "Financeiro por clínica", description: "Recebimentos, pagamentos, conciliação, recorrências e auditoria financeira em um fluxo único." },
  { icon: ShieldCheck, title: "Permissões e auditoria", description: "Cada ação sensível registra responsável, data, alterações e clínica, com isolamento completo entre operações." },
];

const workflow = [
  "A recepção agenda e envia a confirmação ao paciente.",
  "A chegada direciona o atendimento para enfermagem ou consulta direta.",
  "O profissional registra a evolução e encerra o prontuário.",
  "A cobrança é liberada e passa a compor o financeiro da clínica.",
];

export default function Home() {
  return (
    <main className="overflow-hidden bg-background">
      <header className="absolute inset-x-0 top-0 z-30 border-b border-black/5 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center px-5 lg:px-8">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold"><span className="flex size-7 items-center justify-center rounded-md bg-primary text-white"><HeartPulse className="size-4" /></span>CliniCore</Link>
          <nav className="ml-10 hidden items-center gap-6 text-[13px] text-muted-foreground lg:flex"><a href="#plataforma" className="hover:text-foreground">Plataforma</a><a href="#fluxo" className="hover:text-foreground">Como funciona</a><a href="#seguranca" className="hover:text-foreground">Segurança</a><a href="#planos" className="hover:text-foreground">Planos</a></nav>
          <div className="ml-auto flex items-center gap-2"><Button asChild variant="ghost" size="sm"><Link href="/login">Entrar</Link></Button><Button asChild size="sm"><Link href="/cadastro">Começar agora<ArrowRight /></Link></Button></div>
        </div>
      </header>

      <section className="relative flex h-[78vh] min-h-[620px] max-h-[760px] items-center border-b bg-[#f5f7f6] pt-14">
        <LandingProductVisual />
        <div className="relative z-10 mx-auto w-full max-w-[1440px] px-5 lg:px-8">
          <div className="max-w-[590px]">
            <p className="text-[13px] font-medium text-primary">Gestão clínica, assistencial e financeira em um só lugar</p>
            <h1 className="mt-4 text-[42px] font-semibold leading-[1.08] tracking-normal text-foreground lg:text-[54px]">CliniCore</h1>
            <p className="mt-5 max-w-[540px] text-base leading-7 text-neutral-600">Uma plataforma para clínicas que precisam organizar a agenda, acompanhar cada etapa do atendimento e manter o financeiro sob controle, com segurança e rastreabilidade.</p>
            <div className="mt-7 flex flex-wrap gap-2.5"><Button asChild size="lg"><Link href="/cadastro">Criar minha conta<ArrowRight /></Link></Button><Button asChild size="lg" variant="outline"><a href="#plataforma">Conhecer a plataforma</a></Button></div>
            <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-xs text-neutral-500"><span className="flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-emerald-600" />Dados isolados por clínica</span><span className="flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-emerald-600" />Acessos personalizados</span><span className="flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-emerald-600" />Auditoria completa</span></div>
          </div>
        </div>
      </section>

      <section id="plataforma" className="border-b bg-white py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="max-w-2xl"><p className="text-xs font-medium uppercase text-primary">A operação inteira conversa</p><h2 className="mt-3 text-3xl font-semibold tracking-normal">Do agendamento ao recebimento, sem perder o fio do atendimento.</h2><p className="mt-4 text-sm leading-6 text-muted-foreground">O CliniCore conecta os módulos que a equipe utiliza todos os dias. Cada usuário encontra apenas as informações e ações necessárias para sua função.</p></div>
          <div className="mt-10 grid gap-x-8 gap-y-10 md:grid-cols-2 xl:grid-cols-3">{modules.map((item) => <article key={item.title} className="border-t pt-4"><div className="flex size-8 items-center justify-center rounded-md bg-muted"><item.icon className="size-4 text-primary" /></div><h3 className="mt-4 text-base font-semibold">{item.title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p></article>)}</div>
        </div>
      </section>

      <section id="fluxo" className="border-b bg-[#172220] py-16 text-white lg:py-20">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 lg:grid-cols-[.8fr_1.2fr] lg:px-8">
          <div><p className="text-xs font-medium uppercase text-emerald-300">Fluxo configurável</p><h2 className="mt-3 text-3xl font-semibold">A clínica define como o cuidado avança.</h2><p className="mt-4 text-sm leading-6 text-white/60">Com ou sem pré-consulta, o sistema libera cada etapa no momento certo e mantém o histórico de quem realizou cada ação.</p></div>
          <ol className="grid gap-1">{workflow.map((item, index) => <li key={item} className="grid grid-cols-[42px_1fr] items-center border-b border-white/10 py-4"><span className="text-sm font-medium text-emerald-300">0{index + 1}</span><span className="text-sm text-white/85">{item}</span></li>)}</ol>
        </div>
      </section>

      <section id="seguranca" className="border-b bg-white py-16 lg:py-20">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 lg:grid-cols-3 lg:px-8">
          <div><LockKeyhole className="size-5 text-primary" /><h2 className="mt-4 text-2xl font-semibold">Segurança que acompanha a rotina</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Proteção não aparece apenas no login. Ela acompanha visualizações, alterações, permissões e decisões financeiras.</p></div>
          <div className="border-l pl-6"><Building2 className="size-5 text-sky-600" /><h3 className="mt-4 text-base font-semibold">Isolamento por clínica</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Usuários podem participar de diferentes clínicas, mantendo papéis e permissões independentes em cada uma.</p></div>
          <div className="border-l pl-6"><FileClock className="size-5 text-amber-600" /><h3 className="mt-4 text-base font-semibold">Histórico auditável</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Alterações críticas preservam contexto, responsável e valores anteriores para apoiar segurança e conformidade.</p></div>
        </div>
      </section>

      <section className="border-b bg-[#f7f8f7] py-16 lg:py-20" id="planos">
        <div className="mx-auto max-w-7xl px-5 lg:px-8"><div className="mb-8 max-w-2xl"><p className="text-xs font-medium uppercase text-primary">Planos mensais</p><h2 className="mt-3 text-3xl font-semibold">Comece com a estrutura que sua clínica precisa.</h2><p className="mt-3 text-sm text-muted-foreground">Escolha pela quantidade de clínicas e altere o plano quando sua operação crescer.</p></div><PlanCards /></div>
      </section>

      <section className="bg-white py-16"><div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 lg:flex-row lg:items-center lg:justify-between lg:px-8"><div><ClipboardList className="size-5 text-primary" /><h2 className="mt-3 text-2xl font-semibold">Uma operação mais clara começa pela base.</h2><p className="mt-2 text-sm text-muted-foreground">Crie sua conta, escolha o plano e configure a primeira clínica.</p></div><Button asChild size="lg"><Link href="/cadastro">Começar agora<ArrowRight /></Link></Button></div></section>
      <footer className="border-t bg-[#f7f8f7] px-5 py-6 text-xs text-muted-foreground"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3"><span>CliniCore · Gestão clínica, assistencial e financeira</span><nav className="flex gap-4"><Link href="/termos" className="hover:text-foreground">Termos de uso</Link><Link href="/privacidade" className="hover:text-foreground">Privacidade</Link><Link href="/ajuda" className="hover:text-foreground">Ajuda</Link></nav></div></footer>
    </main>
  );
}
