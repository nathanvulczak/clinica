import { LockKeyhole } from "lucide-react";
import { getActiveClinicContext } from "@/features/clinics/context";
import {
  PreferencesPanel,
  RoomsPanel,
  ServicesPanel,
} from "@/features/registrations/components/catalog-panels";
import { PatientsPanel } from "@/features/registrations/components/patients-panel";
import { ProfessionalsPanel } from "@/features/registrations/components/professionals-panel";
import { InventoryWorkspace } from "@/features/inventory/components/inventory-workspace";
import {
  getRegistrationAccess,
  getRegistrationCounts,
  getRegistrationPreferences,
  listAvailabilityRules,
  listClinicRooms,
  listClinicServices,
  listPatients,
  listProfessionalOperationalProfiles,
  listProfessionalRegistrationBlocks,
} from "@/repositories/registrations";
import { listScheduleProfessionals, listScheduleSettings } from "@/repositories/schedule";
import { getInventoryWorkspace } from "@/repositories/inventory";
import type { RegistrationPreferences } from "@/types/domain";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type RegistrationSection = "patients" | "professionals" | "services" | "rooms" | "items" | "preferences";

const defaultPreferences: RegistrationPreferences = {
  clinic_id: "",
  require_patient_cpf: true,
  require_patient_email: false,
  default_service_duration: 30,
  default_export_format: "csv",
  patient_display_name: "full_name",
  show_inactive_records: false,
  preconsultation_mode: "optional",
  allow_preconsultation_override: true,
  require_follow_up_decision: true,
};

function normalizeSection(value?: string): RegistrationSection {
  return ["patients", "professionals", "services", "rooms", "items", "preferences"].includes(value ?? "")
    ? (value as RegistrationSection)
    : "patients";
}

export default async function CadastrosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const section = normalizeSection(params.section);
  const query = params.q ?? "";
  const { activeClinic } = await getActiveClinicContext();
  const access = await getRegistrationAccess(activeClinic?.id);
  const preferences =
    (await getRegistrationPreferences(activeClinic?.id)) ??
    ({ ...defaultPreferences, clinic_id: activeClinic?.id ?? "" } satisfies RegistrationPreferences);
  const includeInactive = preferences.show_inactive_records || params.inactive === "1";

  const isProfessionalsSection = section === "professionals";
  const [counts, patients, services, rooms, availability, allProfessionals, professionalProfiles, scheduleSettings, professionalBlocks] =
    activeClinic
      ? await Promise.all([
          getRegistrationCounts(activeClinic.id, access),
          section === "patients"
            ? listPatients(activeClinic.id, { query, includeInactive, access })
            : Promise.resolve([]),
          section === "services" || isProfessionalsSection
            ? listClinicServices(activeClinic.id, includeInactive, access)
            : Promise.resolve([]),
          section === "rooms" || isProfessionalsSection
            ? listClinicRooms(activeClinic.id, includeInactive, access)
            : Promise.resolve([]),
          isProfessionalsSection
            ? listAvailabilityRules(activeClinic.id, access)
            : Promise.resolve([]),
          isProfessionalsSection
            ? listScheduleProfessionals(activeClinic.id)
            : Promise.resolve([]),
          isProfessionalsSection
            ? listProfessionalOperationalProfiles(activeClinic.id, access)
            : Promise.resolve([]),
          isProfessionalsSection ? listScheduleSettings(activeClinic.id) : Promise.resolve([]),
          isProfessionalsSection
            ? listProfessionalRegistrationBlocks(activeClinic.id, access)
            : Promise.resolve([]),
        ])
      : [{ patients: 0, professionals: 0, rooms: 0, services: 0 }, [], [], [], [], [], [], [], []];

  const professionals = access.canManageSchedule
    ? allProfessionals
    : allProfessionals.filter((professional) => professional.id === access.currentMemberId);
  const inventoryData = section === "items" && activeClinic ? await getInventoryWorkspace(activeClinic.id) : null;

  return (
    <>
      <PageHeader
        title="Cadastros"
        description="Base operacional da clínica para pacientes, serviços, consultórios e disponibilidade profissional."
      />

      {!activeClinic ? (
        <Card>
          <CardHeader>
            <CardTitle>Clínica ativa necessária</CardTitle>
            <CardDescription>Selecione ou cadastre uma clínica antes de criar registros operacionais.</CardDescription>
          </CardHeader>
        </Card>
      ) : !access.canViewPatients && !access.canViewCatalog ? (
        <Card>
          <CardHeader>
            <CardTitle>Acesso restrito</CardTitle>
            <CardDescription>Seu perfil não possui acesso aos cadastros da clínica ativa.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 rounded-lg border bg-background p-4 text-sm text-muted-foreground">
              <LockKeyhole className="size-5 text-primary" />
              Solicite ao proprietário uma permissão de pacientes ou agenda.
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Pacientes visíveis</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{counts.patients}</p>
                <p className="text-xs text-muted-foreground">
                  {access.canManageSchedule ? "na clínica ativa" : "vinculados aos seus atendimentos"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Serviços</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{counts.services}</p>
                <p className="text-xs text-muted-foreground">disponíveis para a Agenda</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Consultórios</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{counts.rooms}</p>
                <p className="text-xs text-muted-foreground">espaços cadastrados</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Profissionais</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{counts.professionals}</p>
                <p className="text-xs text-muted-foreground">com ficha operacional acessível</p>
              </CardContent>
            </Card>
          </div>

          {section === "patients" ? (
            <Card>
              <CardContent className="pt-6">
                <PatientsPanel
                  patients={patients}
                  query={query}
                  canCreate={access.canCreatePatients}
                  canEdit={access.canEditPatients}
                  canDelete={access.canDeletePatients}
                  canExport={access.canExportPatients}
                />
              </CardContent>
            </Card>
          ) : null}

          {section === "services" ? (
            <Card>
              <CardContent className="pt-6">
                <ServicesPanel
                  services={services}
                  defaultDuration={preferences.default_service_duration}
                  canCreate={access.canCreateCatalog}
                  canEdit={access.canEditCatalog}
                  canDelete={access.canDeleteCatalog}
                  canExport={access.canExportCatalog}
                />
              </CardContent>
            </Card>
          ) : null}

          {section === "rooms" ? (
            <Card>
              <CardContent className="pt-6">
                <RoomsPanel
                  rooms={rooms}
                  canCreate={access.canCreateCatalog}
                  canEdit={access.canEditCatalog}
                  canDelete={access.canDeleteCatalog}
                  canExport={access.canExportCatalog}
                />
              </CardContent>
            </Card>
          ) : null}

          {section === "professionals" ? (
            <ProfessionalsPanel
              professionals={professionals}
              professionalProfiles={professionalProfiles}
              availability={availability}
              blocks={professionalBlocks}
              services={services}
              rooms={rooms}
              scheduleSettings={scheduleSettings}
              currentMemberId={access.currentMemberId}
              canEditCatalog={access.canEditCatalog}
              canDeleteCatalog={access.canDeleteCatalog}
              canManageSchedule={access.canManageSchedule}
              canManageOwnAvailability={access.canManageOwnAvailability}
            />
          ) : null}

          {section === "items" && inventoryData ? (
            <Card>
              <CardContent className="pt-6">
                {inventoryData.access.canView ? (
                  <InventoryWorkspace data={inventoryData} section="items" />
                ) : (
                  <div className="flex items-center gap-3 rounded-lg border bg-background p-4 text-sm text-muted-foreground">
                    <LockKeyhole className="size-5 text-primary" />
                    Solicite permissão de estoque para gerenciar itens e materiais.
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

          {section === "preferences" ? (
            <Card className="max-w-3xl">
              <CardContent className="pt-6">
                <PreferencesPanel
                  preferences={preferences}
                  canManage={access.canManageSchedule}
                />
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
    </>
  );
}
