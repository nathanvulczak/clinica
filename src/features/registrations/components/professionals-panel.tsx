"use client";

import Image from "next/image";
import { useCallback, useState } from "react";
import {
  Ban,
  CalendarClock,
  FileBadge,
  Pencil,
  Plus,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import { ROLE_LABELS } from "@/config/permissions";
import { SCHEDULE_BLOCK_TYPE_LABELS } from "@/config/schedule";
import {
  AvailabilityForm,
  DeleteRegistrationButton,
  ProfessionalProfileForm,
} from "@/features/registrations/components/registration-forms";
import {
  DeleteScheduleBlockButton,
  ProfessionalSettingsForm,
  ScheduleBlockForm,
} from "@/features/schedule/components/schedule-forms";
import { formatDateTimeBr, getTodayInputDate } from "@/lib/dates";
import { formatPhone } from "@/lib/formatters";
import { CopyableText } from "@/components/ui/copy-button";
import type {
  ClinicRoom,
  ClinicService,
  ProfessionalAvailabilityRule,
  ProfessionalOperationalProfile,
  ScheduleBlock,
  ScheduleProfessional,
  ScheduleSettings,
} from "@/types/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

type ProfessionalModal =
  | { kind: "profile"; professional: ScheduleProfessional }
  | { kind: "settings"; professional: ScheduleProfessional }
  | {
      kind: "availability";
      professional: ScheduleProfessional;
      availability?: ProfessionalAvailabilityRule;
    }
  | { kind: "block"; professional: ScheduleProfessional; block?: ScheduleBlock }
  | null;

function weekdayLabel(value: number | null) {
  return ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"][value ?? 0];
}

export function ProfessionalsPanel({
  professionals,
  professionalProfiles,
  availability,
  blocks,
  services,
  rooms,
  scheduleSettings,
  currentMemberId,
  canEditCatalog,
  canDeleteCatalog,
  canManageSchedule,
  canManageOwnAvailability,
}: {
  professionals: ScheduleProfessional[];
  professionalProfiles: ProfessionalOperationalProfile[];
  availability: ProfessionalAvailabilityRule[];
  blocks: ScheduleBlock[];
  services: ClinicService[];
  rooms: ClinicRoom[];
  scheduleSettings: ScheduleSettings[];
  currentMemberId?: string | null;
  canEditCatalog: boolean;
  canDeleteCatalog: boolean;
  canManageSchedule: boolean;
  canManageOwnAvailability: boolean;
}) {
  const [modal, setModal] = useState<ProfessionalModal>(null);
  const [formVersion, setFormVersion] = useState(0);

  const closeModal = useCallback(() => {
    setModal(null);
    setFormVersion((value) => value + 1);
  }, []);

  if (professionals.length === 0) {
    return (
      <div className="rounded-lg border border-dashed px-5 py-10 text-center">
        <UserRound className="mx-auto size-8 text-muted-foreground/60" />
        <p className="mt-3 text-sm font-medium">Nenhum profissional ativo</p>
        <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">
          Cadastre ou convide o usuário em Usuários e permissões. Após confirmar o acesso com um
          perfil clínico, ele ficará disponível aqui para configuração operacional.
        </p>
      </div>
    );
  }

  const selectedProfile =
    modal?.professional &&
    professionalProfiles.find((item) => item.professional_member_id === modal.professional.id);
  const selectedCanEditOwn =
    Boolean(modal?.professional) &&
    (canEditCatalog ||
      (currentMemberId === modal?.professional.id && canManageOwnAvailability));

  return (
    <div className="grid gap-4">
      <div className="rounded-lg border border-dashed bg-background px-4 py-3 text-sm text-muted-foreground">
        Profissionais são originados de usuários ativos da clínica. Esta área mantém apenas ficha,
        expediente, disponibilidade e bloqueios operacionais.
      </div>

      {professionals.map((professional) => {
        const professionalProfile = professionalProfiles.find(
          (item) => item.professional_member_id === professional.id,
        );
        const ownAvailability = availability.filter(
          (item) => item.professional_member_id === professional.id,
        );
        const ownBlocks = blocks.filter((item) => item.professional_member_id === professional.id);
        const canEditOwn =
          canEditCatalog ||
          (currentMemberId === professional.id && canManageOwnAvailability);

        return (
          <article key={professional.id} className="rounded-lg border bg-card shadow-sm">
            <header className="flex flex-col gap-4 border-b p-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="flex min-w-0 gap-3">
                <div
                  className="relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md text-white"
                  style={{ backgroundColor: professionalProfile?.appointment_color ?? "#0f766e" }}
                >
                  {professional.profile?.avatar_url ? (
                    <Image
                      src={professional.profile.avatar_url}
                      alt=""
                      fill
                      sizes="44px"
                      className="object-cover"
                    />
                  ) : (
                    <UserRound className="size-5" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">
                      {professional.profile?.full_name ?? "Profissional sem nome"}
                    </h2>
                    <Badge>{ROLE_LABELS[professional.role]}</Badge>
                    {professionalProfile?.active === false ? <Badge>Inativo na operação</Badge> : null}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {professionalProfile?.specialty ?? "Especialidade não informada"}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {professional.profile?.email ? (
                      <CopyableText value={professional.profile.email} label="Copiar e-mail" />
                    ) : (
                      <span>E-mail não informado</span>
                    )}
                    {professional.profile?.phone ? (
                      <CopyableText value={professional.profile.phone} label="Copiar telefone">
                        {formatPhone(professional.profile.phone)}
                      </CopyableText>
                    ) : (
                      <span>Telefone não informado</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canEditOwn}
                  onClick={() => setModal({ kind: "profile", professional })}
                >
                  <FileBadge />
                  Ficha
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canManageSchedule}
                  onClick={() => setModal({ kind: "settings", professional })}
                >
                  <SlidersHorizontal />
                  Expediente
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canEditOwn}
                  onClick={() => setModal({ kind: "availability", professional })}
                >
                  <CalendarClock />
                  Disponibilidade
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canManageSchedule}
                  onClick={() => setModal({ kind: "block", professional })}
                >
                  <Ban />
                  Bloqueio
                </Button>
              </div>
            </header>

            <div className="grid gap-5 p-5 xl:grid-cols-2">
              <section className="grid content-start gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">Disponibilidades</h3>
                    <p className="text-xs text-muted-foreground">
                      {ownAvailability.length} regra(s) cadastrada(s)
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={!canEditOwn}
                    aria-label="Nova disponibilidade"
                    title="Nova disponibilidade"
                    onClick={() => setModal({ kind: "availability", professional })}
                  >
                    <Plus />
                  </Button>
                </div>

                {ownAvailability.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    Nenhuma disponibilidade específica cadastrada.
                  </div>
                ) : (
                  ownAvailability.map((rule) => {
                    const room = rooms.find((item) => item.id === rule.room_id);
                    const service = services.find((item) => item.id === rule.service_id);

                    return (
                      <div key={rule.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">
                            {rule.recurrence_type === "weekly"
                              ? weekdayLabel(rule.weekday)
                              : rule.specific_date}
                            , {rule.start_time.slice(0, 5)} às {rule.end_time.slice(0, 5)}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {room?.name ?? "Sem consultório fixo"} •{" "}
                            {service?.name ?? "Todos os serviços"} • {rule.slot_minutes} min
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-9"
                            disabled={!canEditOwn}
                            aria-label="Editar disponibilidade"
                            title="Editar disponibilidade"
                            onClick={() =>
                              setModal({ kind: "availability", professional, availability: rule })
                            }
                          >
                            <Pencil />
                          </Button>
                          <DeleteRegistrationButton
                            id={rule.id}
                            resource="availability"
                            label="disponibilidade"
                            disabled={!canDeleteCatalog && !canManageOwnAvailability}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </section>

              <section className="grid content-start gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">Bloqueios e indisponibilidades</h3>
                    <p className="text-xs text-muted-foreground">
                      {ownBlocks.length} bloqueio(s) cadastrado(s)
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={!canManageSchedule}
                    aria-label="Novo bloqueio"
                    title="Novo bloqueio"
                    onClick={() => setModal({ kind: "block", professional })}
                  >
                    <Plus />
                  </Button>
                </div>

                {ownBlocks.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    Nenhum bloqueio cadastrado.
                  </div>
                ) : (
                  ownBlocks.map((block) => (
                    <div key={block.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {SCHEDULE_BLOCK_TYPE_LABELS[block.block_type]}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatDateTimeBr(block.starts_at)} até {formatDateTimeBr(block.ends_at)}
                        </p>
                        {block.reason ? (
                          <p className="mt-1 text-xs text-muted-foreground">{block.reason}</p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-9"
                          disabled={!canManageSchedule}
                          aria-label="Editar bloqueio"
                          title="Editar bloqueio"
                          onClick={() => setModal({ kind: "block", professional, block })}
                        >
                          <Pencil />
                        </Button>
                        <DeleteScheduleBlockButton
                          blockId={block.id}
                          disabled={!canManageSchedule}
                        />
                      </div>
                    </div>
                  ))
                )}
              </section>
            </div>
          </article>
        );
      })}

      <Modal
        open={Boolean(modal)}
        onOpenChange={(open) => {
          if (!open) {
            closeModal();
          }
        }}
        title={
          modal?.kind === "profile"
            ? "Ficha profissional"
            : modal?.kind === "settings"
              ? "Expediente e agenda"
              : modal?.kind === "availability"
                ? modal.availability
                  ? "Editar disponibilidade"
                  : "Nova disponibilidade"
                : modal?.kind === "block"
                  ? modal.block
                    ? "Editar bloqueio"
                    : "Novo bloqueio"
                  : "Configuração profissional"
        }
        description={
          modal?.professional
            ? `Configuração de ${modal.professional.profile?.full_name ?? "profissional"}.`
            : undefined
        }
      >
        {modal?.kind === "profile" ? (
          <ProfessionalProfileForm
            key={`profile-${modal.professional.id}-${formVersion}`}
            professional={modal.professional}
            professionalProfile={selectedProfile}
            services={services}
            rooms={rooms}
            disabled={!selectedCanEditOwn}
            onCompleted={closeModal}
          />
        ) : null}

        {modal?.kind === "settings" ? (
          <ProfessionalSettingsForm
            key={`settings-${modal.professional.id}-${formVersion}`}
            professionals={[modal.professional]}
            settings={scheduleSettings}
            fixedProfessionalId={modal.professional.id}
            disabled={!canManageSchedule}
            onCompleted={closeModal}
          />
        ) : null}

        {modal?.kind === "availability" ? (
          <AvailabilityForm
            key={`availability-${modal.availability?.id ?? "new"}-${formVersion}`}
            availability={modal.availability}
            professionals={[modal.professional]}
            fixedProfessionalId={modal.professional.id}
            rooms={rooms}
            services={services}
            disabled={!selectedCanEditOwn}
            onCompleted={closeModal}
          />
        ) : null}

        {modal?.kind === "block" ? (
          <ScheduleBlockForm
            key={`block-${modal.block?.id ?? "new"}-${formVersion}`}
            professionals={[modal.professional]}
            fixedProfessionalId={modal.professional.id}
            defaultDate={getTodayInputDate()}
            block={modal.block}
            disabled={!canManageSchedule}
            onCompleted={closeModal}
          />
        ) : null}
      </Modal>
    </div>
  );
}
