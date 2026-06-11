"use client";

import { useCallback, useState } from "react";
import { Building, Pencil, Plus, Settings2, Stethoscope } from "lucide-react";
import {
  DeleteRegistrationButton,
  ExportRegistrationButton,
  RegistrationPreferencesForm,
  RoomForm,
  ServiceForm,
} from "@/features/registrations/components/registration-forms";
import { formatCurrencyBRL } from "@/lib/utils";
import type { ClinicRoom, ClinicService, RegistrationPreferences } from "@/types/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

export function ServicesPanel({
  services,
  defaultDuration,
  canCreate,
  canEdit,
  canDelete,
  canExport,
}: {
  services: ClinicService[];
  defaultDuration: number;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canExport: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const [selectedService, setSelectedService] = useState<ClinicService | null>(null);
  const [formVersion, setFormVersion] = useState(0);

  const closeModal = useCallback(() => {
    setCreating(false);
    setSelectedService(null);
    setFormVersion((value) => value + 1);
  }, []);

  return (
    <div className="grid gap-5">
      <header className="flex flex-col gap-3 border-b pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="font-semibold">Serviços da clínica</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Duração, preço e identidade visual utilizados na Agenda.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportRegistrationButton resource="services" disabled={!canExport} />
          <Button type="button" disabled={!canCreate} onClick={() => setCreating(true)}>
            <Plus />
            Novo serviço
          </Button>
        </div>
      </header>

      {services.length === 0 ? (
        <div className="rounded-lg border border-dashed px-5 py-10 text-center">
          <Stethoscope className="mx-auto size-8 text-muted-foreground/60" />
          <p className="mt-3 text-sm font-medium">Nenhum serviço cadastrado</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Cadastre consultas, retornos, exames ou procedimentos.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {services.map((service) => (
            <article key={service.id} className="rounded-lg border bg-card p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 gap-3">
                  <span
                    className="mt-1 size-4 shrink-0 rounded-sm border"
                    style={{ backgroundColor: service.color }}
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{service.name}</p>
                      {!service.active ? <Badge>Inativo</Badge> : null}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {service.category || "Sem categoria"} • {service.duration_minutes} min •{" "}
                      {formatCurrencyBRL(service.price_cents)}
                    </p>
                    {service.description ? (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{service.description}</p>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!canEdit}
                    onClick={() => setSelectedService(service)}
                  >
                    <Pencil />
                    Visualizar e editar
                  </Button>
                  <DeleteRegistrationButton
                    id={service.id}
                    resource="service"
                    label="serviço"
                    disabled={!canDelete}
                  />
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal
        open={creating}
        onOpenChange={(open) => {
          if (!open) {
            closeModal();
          }
        }}
        title="Novo serviço"
        description="Cadastre um item que poderá ser utilizado na Agenda e no financeiro."
        className="max-w-3xl"
      >
        <ServiceForm
          key={`new-service-${formVersion}`}
          disabled={!canCreate}
          defaultDuration={defaultDuration}
          onCompleted={closeModal}
        />
      </Modal>

      <Modal
        open={Boolean(selectedService)}
        onOpenChange={(open) => {
          if (!open) {
            closeModal();
          }
        }}
        title="Cadastro do serviço"
        description={selectedService ? `Visualize e atualize ${selectedService.name}.` : undefined}
        className="max-w-3xl"
      >
        {selectedService ? (
          <ServiceForm
            key={`${selectedService.id}-${formVersion}`}
            service={selectedService}
            disabled={!canEdit}
            defaultDuration={defaultDuration}
            onCompleted={closeModal}
          />
        ) : null}
      </Modal>
    </div>
  );
}

export function RoomsPanel({
  rooms,
  canCreate,
  canEdit,
  canDelete,
  canExport,
}: {
  rooms: ClinicRoom[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canExport: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<ClinicRoom | null>(null);
  const [formVersion, setFormVersion] = useState(0);

  const closeModal = useCallback(() => {
    setCreating(false);
    setSelectedRoom(null);
    setFormVersion((value) => value + 1);
  }, []);

  return (
    <div className="grid gap-5">
      <header className="flex flex-col gap-3 border-b pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="font-semibold">Consultórios e espaços</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Ambientes físicos disponíveis para alocação profissional.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportRegistrationButton resource="rooms" disabled={!canExport} />
          <Button type="button" disabled={!canCreate} onClick={() => setCreating(true)}>
            <Plus />
            Novo consultório
          </Button>
        </div>
      </header>

      {rooms.length === 0 ? (
        <div className="rounded-lg border border-dashed px-5 py-10 text-center">
          <Building className="mx-auto size-8 text-muted-foreground/60" />
          <p className="mt-3 text-sm font-medium">Nenhum consultório cadastrado</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Cadastre os espaços, capacidades e recursos disponíveis.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {rooms.map((room) => (
            <article key={room.id} className="rounded-lg border bg-card p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{room.name}</p>
                    <Badge>{room.room_type}</Badge>
                    {!room.active ? <Badge>Inativo</Badge> : null}
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {room.floor || "Setor não informado"} • capacidade {room.capacity}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {room.resources.length ? room.resources.join(", ") : "Sem recursos informados"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!canEdit}
                    onClick={() => setSelectedRoom(room)}
                  >
                    <Pencil />
                    Visualizar e editar
                  </Button>
                  <DeleteRegistrationButton
                    id={room.id}
                    resource="room"
                    label="consultório"
                    disabled={!canDelete}
                  />
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal
        open={creating}
        onOpenChange={(open) => {
          if (!open) {
            closeModal();
          }
        }}
        title="Novo consultório"
        description="Cadastre um espaço e seus recursos para uso na Agenda."
        className="max-w-3xl"
      >
        <RoomForm
          key={`new-room-${formVersion}`}
          disabled={!canCreate}
          onCompleted={closeModal}
        />
      </Modal>

      <Modal
        open={Boolean(selectedRoom)}
        onOpenChange={(open) => {
          if (!open) {
            closeModal();
          }
        }}
        title="Cadastro do consultório"
        description={selectedRoom ? `Visualize e atualize ${selectedRoom.name}.` : undefined}
        className="max-w-3xl"
      >
        {selectedRoom ? (
          <RoomForm
            key={`${selectedRoom.id}-${formVersion}`}
            room={selectedRoom}
            disabled={!canEdit}
            onCompleted={closeModal}
          />
        ) : null}
      </Modal>
    </div>
  );
}

export function PreferencesPanel({
  preferences,
  canManage,
}: {
  preferences: RegistrationPreferences;
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [formVersion, setFormVersion] = useState(0);

  const closeModal = useCallback(() => {
    setOpen(false);
    setFormVersion((value) => value + 1);
  }, []);

  return (
    <div className="grid gap-5">
      <header className="flex flex-col gap-3 border-b pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-semibold">Preferências de cadastro</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Regras aplicadas aos cadastros e à apresentação dos registros da clínica.
          </p>
        </div>
        <Button type="button" disabled={!canManage} onClick={() => setOpen(true)}>
          <Settings2 />
          Editar preferências
        </Button>
      </header>

      <dl className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border bg-background p-4">
          <dt className="text-xs text-muted-foreground">CPF do paciente</dt>
          <dd className="mt-1 text-sm font-medium">
            {preferences.require_patient_cpf ? "Obrigatório" : "Opcional"}
          </dd>
        </div>
        <div className="rounded-lg border bg-background p-4">
          <dt className="text-xs text-muted-foreground">E-mail do paciente</dt>
          <dd className="mt-1 text-sm font-medium">
            {preferences.require_patient_email ? "Obrigatório" : "Opcional"}
          </dd>
        </div>
        <div className="rounded-lg border bg-background p-4">
          <dt className="text-xs text-muted-foreground">Duração padrão</dt>
          <dd className="mt-1 text-sm font-medium">{preferences.default_service_duration} minutos</dd>
        </div>
        <div className="rounded-lg border bg-background p-4">
          <dt className="text-xs text-muted-foreground">Registros inativos</dt>
          <dd className="mt-1 text-sm font-medium">
            {preferences.show_inactive_records ? "Exibidos por padrão" : "Ocultos por padrão"}
          </dd>
        </div>
        <div className="rounded-lg border bg-background p-4">
          <dt className="text-xs text-muted-foreground">Fluxo após a chegada</dt>
          <dd className="mt-1 text-sm font-medium">
            {preferences.preconsultation_mode === "required"
              ? "Pré-consulta obrigatória"
              : preferences.preconsultation_mode === "disabled"
                ? "Direto para atendimento"
                : "Decidido na chegada"}
          </dd>
        </div>
        <div className="rounded-lg border bg-background p-4">
          <dt className="text-xs text-muted-foreground">Correção de encaminhamento</dt>
          <dd className="mt-1 text-sm font-medium">
            {preferences.allow_preconsultation_override ? "Permitida antes do início" : "Bloqueada"}
          </dd>
        </div>
      </dl>

      <Modal
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            closeModal();
          }
        }}
        title="Preferências da clínica"
        description="Personalize os padrões utilizados nos próximos cadastros."
        className="max-w-2xl"
      >
        <RegistrationPreferencesForm
          key={`preferences-${formVersion}`}
          preferences={preferences}
          disabled={!canManage}
          onCompleted={closeModal}
        />
      </Modal>
    </div>
  );
}
