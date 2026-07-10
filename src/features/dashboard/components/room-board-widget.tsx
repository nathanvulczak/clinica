import Image from "next/image";
import Link from "next/link";
import { ArrowRight, DoorOpen, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { DashboardRoom } from "@/features/dashboard/types";

const statusLabels: Record<DashboardRoom["status"], string> = {
  available: "Disponível",
  scheduled: "Próximo atendimento",
  occupied: "Em atendimento",
};

const statusClasses: Record<DashboardRoom["status"], string> = {
  available: "bg-muted text-muted-foreground",
  scheduled: "bg-amber-500/10 text-amber-700",
  occupied: "bg-emerald-500/10 text-emerald-700",
};

function formatSpecialty(value: string | null) {
  if (!value) return "Profissional";

  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatTime(value: string | null) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

function ProfessionalAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  return (
    <span className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted text-xs font-semibold text-muted-foreground">
      {avatarUrl ? (
        <Image src={avatarUrl} alt={`Foto de ${name}`} fill sizes="32px" className="object-cover" />
      ) : (
        <>{name.trim().charAt(0).toUpperCase() || <UserRound className="size-3.5" />}</>
      )}
    </span>
  );
}

export function RoomBoardWidget({ rooms }: { rooms: DashboardRoom[] }) {
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-card shadow-sm">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">Mapa de consultórios</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">Escala e ocupação de hoje</p>
        </div>
        <Link
          href="/agenda?view=clinic"
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
        >
          Abrir agenda <ArrowRight className="size-3.5" />
        </Link>
      </div>

      {rooms.length ? (
        <div className="grid min-h-0 flex-1 auto-rows-max gap-2 overflow-auto p-3 sm:grid-cols-2 xl:grid-cols-3">
          {rooms.map((room) => {
            const nextTime = formatTime(room.nextAppointmentAt);
            const professionalName = room.professional?.name ?? "Nenhum profissional associado";

            return (
              <Link
                key={room.id}
                href={`/agenda?view=day&room_id=${encodeURIComponent(room.id)}`}
                className="group rounded-md border bg-background p-3 transition-colors duration-150 hover:border-primary/50 hover:bg-primary/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-start gap-2.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary transition-transform duration-150 group-hover:scale-105">
                    <DoorOpen className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{room.name}</p>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          {room.code || room.roomType || "Consultório"}
                        </p>
                      </div>
                      <Badge className={`shrink-0 border-0 text-[10px] ${statusClasses[room.status]}`}>
                        {statusLabels[room.status]}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2 border-t pt-3">
                  {room.professional ? (
                    <ProfessionalAvatar name={room.professional.name} avatarUrl={room.professional.avatarUrl} />
                  ) : (
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full border bg-muted text-muted-foreground">
                      <UserRound className="size-3.5" />
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium">{professionalName}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {formatSpecialty(room.professional?.specialty ?? null)}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span className="truncate">
                    {nextTime ? `Próximo horário: ${nextTime}` : "Sem próximo horário"}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {room.todayAppointments} {room.todayAppointments === 1 ? "compromisso" : "compromissos"}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="grid flex-1 place-items-center px-6 py-10 text-center">
          <div>
            <DoorOpen className="mx-auto size-7 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">Nenhum consultório disponível</p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              Cadastre os consultórios e associe os profissionais para acompanhar a operação neste painel.
            </p>
            <Link
              href="/cadastros?section=rooms"
              className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Gerenciar consultórios <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
