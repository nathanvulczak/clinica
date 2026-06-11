import Link from "next/link";
import {
  Building,
  BriefcaseBusiness,
  HeartPulse,
  LockKeyhole,
  Settings2,
  Stethoscope,
} from "lucide-react";
import { getActiveClinicContext } from "@/features/clinics/context";
import {
  PreferencesPanel,
  RoomsPanel,
  ServicesPanel,
} from "@/features/registrations/components/catalog-panels";
import { PatientsPanel } from "@/features/registrations/components/patients-panel";
import { ProfessionalsPanel } from "@/features/registrations/components/professionals-panel";
import {
  getRegistrationAccess,
  getRegistrationPreferences,
  listAvailabilityRules,
  listClinicRooms,
  listClinicServices,
  listPatients,
  listProfessionalOperationalProfiles,
  listProfessionalRegistrationBlocks,
} from "@/repositories/registrations";
import { listScheduleProfessionals, listScheduleSettings } from "@/repositories/schedule";
import type { RegistrationPreferences } from "@/types/domain";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const sections = [
  { id: "patients", label: "Pacientes", icon: HeartPulse },
  { id: "professionals", label: "Profissionais", icon: BriefcaseBusiness },
  { id: "services", label: "Serviços", icon: Stethoscope },
  { id: "rooms", label: "Consultórios", icon: Building },
  { id: "preferences", label: "Preferências", icon: Settings2 },
] as const;

type RegistrationSection = (typeof sections)[number]["id"];

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
  return sections.some((section) => section.id === value) ? (value as RegistrationSection) : "patients";
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

  const [
    patients,
    services,
    rooms,
    availability,
    allProfessionals,
    professionalProfiles,
    scheduleSettings,
    professionalBlocks,
  ] = activeClinic
    ? await Promise.all([
        listPatients(activeClinic.id, { query, includeInactive, access }),
        listClinicServices(activeClinic.id, includeInactive, access),
        listClinicRooms(activeClinic.id, includeInactive, access),
        listAvailabilityRules(activeClinic.id, access),
        listScheduleProfessionals(activeClinic.id),
        listProfessionalOperationalProfiles(activeClinic.id, access),
        listScheduleSettings(activeClinic.id),
        listProfessionalRegistrationBlocks(activeClinic.id, access),
      ])
    : [[], [], [], [], [], [], [], []];

  const professionals = access.canManageSchedule
    ? allProfessionals
    : allProfessionals.filter((professional) => professional.id === access.currentMemberId);

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
          <nav className="flex gap-2 overflow-x-auto border-b pb-3">
            {sections.map((item) => {
              const active = section === item.id;

              return (
                <Button key={item.id} asChild variant={active ? "secondary" : "ghost"} size="sm">
                  <Link href={`/cadastros?section=${item.id}`}>
                    <item.icon />
                    {item.label}
                  </Link>
                </Button>
              );
            })}
          </nav>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Pacientes visíveis</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{patients.length}</p>
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
                <p className="text-2xl font-semibold">{services.length}</p>
                <p className="text-xs text-muted-foreground">disponíveis para a Agenda</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Consultórios</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{rooms.length}</p>
                <p className="text-xs text-muted-foreground">espaços cadastrados</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Profissionais</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{professionals.length}</p>
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
