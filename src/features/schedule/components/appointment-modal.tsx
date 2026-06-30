"use client";

import { useCallback, useState } from "react";
import { CalendarPlus } from "lucide-react";
import { AppointmentForm } from "@/features/schedule/components/schedule-forms";
import type {
  ClinicRoom,
  ClinicService,
  PatientSummary,
  ProfessionalOperationalProfile,
  ScheduleProfessional,
  ScheduleSettings,
} from "@/types/domain";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

export function AppointmentModal({
  professionals,
  patients,
  services,
  rooms,
  professionalProfiles,
  scheduleSettings,
  defaultDate,
  defaultStartTime,
  defaultDuration,
  defaultProfessionalId,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
  disabled,
}: {
  professionals: ScheduleProfessional[];
  patients: PatientSummary[];
  services: ClinicService[];
  rooms: ClinicRoom[];
  professionalProfiles: ProfessionalOperationalProfile[];
  scheduleSettings: ScheduleSettings[];
  defaultDate: string;
  defaultStartTime?: string;
  defaultDuration?: number;
  defaultProfessionalId?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
  disabled?: boolean;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [formVersion, setFormVersion] = useState(0);
  const open = controlledOpen ?? internalOpen;

  const setOpen = useCallback((nextOpen: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }, [controlledOpen, onOpenChange]);

  const closeModal = useCallback(() => {
    setOpen(false);
    setFormVersion((value) => value + 1);
  }, [setOpen]);

  return (
    <>
      {!hideTrigger ? (
        <Button type="button" disabled={disabled} onClick={() => setOpen(true)}>
          <CalendarPlus />
          Novo compromisso
        </Button>
      ) : null}
      <Modal
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            closeModal();
          }
        }}
        title="Novo compromisso"
        description="Selecione um paciente cadastrado e organize o atendimento com validação de conflitos."
        className="max-w-4xl"
      >
        <AppointmentForm
          key={`appointment-${formVersion}-${defaultDate}-${defaultStartTime ?? "08:00"}-${defaultProfessionalId ?? "auto"}`}
          professionals={professionals}
          patients={patients}
          services={services}
          rooms={rooms}
          professionalProfiles={professionalProfiles}
          scheduleSettings={scheduleSettings}
          defaultDate={defaultDate}
          defaultStartTime={defaultStartTime}
          defaultDuration={defaultDuration}
          defaultProfessionalId={defaultProfessionalId}
          disabled={disabled}
          onCompleted={closeModal}
        />
      </Modal>
    </>
  );
}
