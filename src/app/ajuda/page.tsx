import Link from "next/link";
import { ArrowLeft, BookOpen, LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";

const guides = [
  ["Primeiros passos", "Cadastre a clínica, um profissional, um serviço e um paciente. Depois faça um agendamento de teste para validar o fluxo completo."],
  ["Operação assistencial", "A recepção confirma a chegada. A clínica pode direcionar para pré-consulta ou atendimento direto. O prontuário fica disponível conforme as permissões e o protocolo publicado."],
  ["Permissões", "O administrador controla o acesso por módulo e ação. Profissionais devem visualizar somente os atendimentos compatíveis com seu vínculo e sua função."],
  ["Backup e incidentes", "Faça exportações periódicas, valide restauração em ambiente seguro e comunique qualquer suspeita de acesso indevido ao responsável cadastrado."],
];

export default function HelpPage() {
  return <main className="min-h-screen bg-background px-5 py-10"><div className="mx-auto max-w-4xl"><Button asChild variant="ghost" size="sm"><Link href="/"><ArrowLeft /> Voltar</Link></Button><header className="mt-10 max-w-2xl"><div className="flex items-center gap-3"><div className="grid size-9 place-items-center rounded-md bg-primary/10 text-primary"><LifeBuoy className="size-4" /></div><div><p className="text-xs font-medium uppercase text-primary">CliniCore</p><h1 className="text-2xl font-semibold">Central de ajuda</h1></div></div><p className="mt-4 text-sm leading-6 text-muted-foreground">Orientações curtas para colocar a clínica em operação com segurança e aproveitar os módulos conectados.</p></header><div className="mt-8 grid gap-3 md:grid-cols-2">{guides.map(([title, description]) => <article key={title} className="rounded-md border bg-card p-5"><BookOpen className="size-4 text-primary" /><h2 className="mt-3 text-sm font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p></article>)}</div><section className="mt-6 rounded-md border bg-card p-5"><h2 className="text-sm font-semibold">Precisa de atendimento?</h2><p className="mt-2 text-sm text-muted-foreground">O responsável da clínica deve verificar o canal cadastrado em Conformidade e LGPD para suporte e incidentes.</p></section></div></main>;
}
