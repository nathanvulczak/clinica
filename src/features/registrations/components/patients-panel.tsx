"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Search,
  UserRound,
} from "lucide-react";
import {
  DeleteRegistrationButton,
  ExportRegistrationButton,
  PatientForm,
} from "@/features/registrations/components/registration-forms";
import { formatCpf, formatPhone } from "@/lib/formatters";
import type { PatientSummary } from "@/types/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { CopyableText } from "@/components/ui/copy-button";

const PAGE_SIZE = 8;

export function PatientsPanel({
  patients,
  query,
  canCreate,
  canEdit,
  canDelete,
  canExport,
}: {
  patients: PatientSummary[];
  query: string;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canExport: boolean;
}) {
  const [page, setPage] = useState(1);
  const [newPatientOpen, setNewPatientOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientSummary | null>(null);
  const [formVersion, setFormVersion] = useState(0);
  const totalPages = Math.max(1, Math.ceil(patients.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visiblePatients = useMemo(
    () => patients.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [currentPage, patients],
  );

  useEffect(() => {
    setPage(1);
  }, [patients]);

  const closeNewPatient = useCallback(() => {
    setNewPatientOpen(false);
    setFormVersion((value) => value + 1);
  }, []);

  const closeEditPatient = useCallback(() => {
    setSelectedPatient(null);
    setFormVersion((value) => value + 1);
  }, []);

  return (
    <div className="grid gap-5">
      <div className="flex flex-col gap-3 border-b pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="font-semibold">Pacientes</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Dados administrativos, contato, convênio e alertas controlados.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportRegistrationButton resource="patients" disabled={!canExport} />
          <Button type="button" disabled={!canCreate} onClick={() => setNewPatientOpen(true)}>
            <Plus />
            Novo paciente
          </Button>
        </div>
      </div>

      <form className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <input type="hidden" name="section" value="patients" />
        <Input name="q" defaultValue={query} placeholder="Buscar por nome, nome social ou CPF" />
        <Button variant="outline">
          <Search />
          Buscar
        </Button>
      </form>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{patients.length} {patients.length === 1 ? "paciente encontrado" : "pacientes encontrados"}</span>
        {query ? <span>Filtro: {query}</span> : null}
      </div>

      {patients.length === 0 ? (
        <div className="rounded-lg border border-dashed px-5 py-10 text-center">
          <UserRound className="mx-auto size-8 text-muted-foreground/60" />
          <p className="mt-3 text-sm font-medium">Nenhum paciente encontrado</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Ajuste a busca ou cadastre um novo paciente.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {visiblePatients.map((patient) => (
            <article key={patient.id} className="rounded-lg border bg-card p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{patient.social_name || patient.full_name}</p>
                    {!patient.active ? <Badge>Inativo</Badge> : null}
                    {patient.consent_lgpd_at ? <Badge>LGPD</Badge> : null}
                  </div>
                  {patient.social_name ? (
                    <p className="mt-1 text-xs text-muted-foreground">Nome civil: {patient.full_name}</p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                    {patient.cpf ? (
                      <CopyableText value={patient.cpf} label="Copiar CPF">
                        {formatCpf(patient.cpf)}
                      </CopyableText>
                    ) : (
                      <span>CPF não informado</span>
                    )}
                    {patient.phone ? (
                      <CopyableText value={patient.phone} label="Copiar telefone">
                        {formatPhone(patient.phone)}
                      </CopyableText>
                    ) : (
                      <span>Telefone não informado</span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {patient.email ? (
                      <CopyableText value={patient.email} label="Copiar e-mail" />
                    ) : (
                      <span>E-mail não informado</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!canEdit}
                    onClick={() => setSelectedPatient(patient)}
                  >
                    <Pencil />
                    Visualizar e editar cadastro
                  </Button>
                  <DeleteRegistrationButton
                    id={patient.id}
                    resource="patient"
                    label="paciente"
                    disabled={!canDelete}
                  />
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {totalPages > 1 ? (
        <nav className="flex items-center justify-between border-t pt-4" aria-label="Paginação de pacientes">
          <p className="text-sm text-muted-foreground">
            Página {currentPage} de {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={currentPage === 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              aria-label="Página anterior"
            >
              <ChevronLeft />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={currentPage === totalPages}
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              aria-label="Próxima página"
            >
              <ChevronRight />
            </Button>
          </div>
        </nav>
      ) : null}

      <Modal
        open={newPatientOpen}
        onOpenChange={setNewPatientOpen}
        title="Novo paciente"
        description="Cadastre os dados administrativos para disponibilizar o paciente na agenda."
      >
        <PatientForm
          key={`new-${formVersion}`}
          disabled={!canCreate}
          onCompleted={closeNewPatient}
        />
      </Modal>

      <Modal
        open={Boolean(selectedPatient)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedPatient(null);
          }
        }}
        title="Cadastro do paciente"
        description={selectedPatient ? `Visualize e atualize os dados de ${selectedPatient.social_name || selectedPatient.full_name}.` : undefined}
      >
        {selectedPatient ? (
          <PatientForm
            key={`${selectedPatient.id}-${formVersion}`}
            patient={selectedPatient}
            disabled={!canEdit}
            onCompleted={closeEditPatient}
          />
        ) : null}
      </Modal>
    </div>
  );
}
