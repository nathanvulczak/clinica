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
  disabled,
}: {
  professionals: ScheduleProfessional[];
  patients: PatientSummary[];
  services: ClinicService[];
  rooms: ClinicRoom[];
  professionalProfiles: ProfessionalOperationalProfile[];
  scheduleSettings: ScheduleSettings[];
  defaultDate: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [formVersion, setFormVersion] = useState(0);

  const closeModal = useCallback(() => {
    setOpen(false);
    setFormVersion((value) => value + 1);
  }, []);

  return (
    <>
      <Button type="button" disabled={disabled} onClick={() => setOpen(true)}>
        <CalendarPlus />
        Novo compromisso
      </Button>
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
          key={`appointment-${formVersion}`}
          professionals={professionals}
          patients={patients}
          services={services}
          rooms={rooms}
          professionalProfiles={professionalProfiles}
          scheduleSettings={scheduleSettings}
          defaultDate={defaultDate}
          disabled={disabled}
          onCompleted={closeModal}
        />
      </Modal>
    </>
  );
}
