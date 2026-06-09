import Link from "next/link";
import {
  Building,
  BriefcaseBusiness,
  HeartPulse,
  LockKeyhole,
  Search,
  Settings2,
  Stethoscope,
  UserRound,
} from "lucide-react";
import { ROLE_LABELS } from "@/config/permissions";
import { SCHEDULE_BLOCK_TYPE_LABELS } from "@/config/schedule";
import { getActiveClinicContext } from "@/features/clinics/context";
import {
  AvailabilityForm,
  DeleteRegistrationButton,
  ExportRegistrationButton,
  PatientForm,
  ProfessionalProfileForm,
  RegistrationPreferencesForm,
  RoomForm,
  ServiceForm,
} from "@/features/registrations/components/registration-forms";
import {
  DeleteScheduleBlockButton,
  ProfessionalSettingsForm,
  ScheduleBlockForm,
} from "@/features/schedule/components/schedule-forms";
import { formatDateTimeBr, getTodayInputDate } from "@/lib/dates";
import { formatCpf, formatPhone } from "@/lib/formatters";
import { formatCurrencyBRL } from "@/lib/utils";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

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
};

function normalizeSection(value?: string): RegistrationSection {
  return sections.some((section) => section.id === value) ? (value as RegistrationSection) : "patients";
}

function weekdayLabel(value: number | null) {
  return ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"][value ?? 0];
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
            <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_520px]">
              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <CardTitle>Pacientes</CardTitle>
                      <CardDescription>Dados administrativos, contato, convênio e alertas controlados.</CardDescription>
                    </div>
                    <ExportRegistrationButton resource="patients" disabled={!access.canExportPatients} />
                  </div>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <form className="grid gap-3 sm:grid-cols-[1fr_auto]">
                    <input type="hidden" name="section" value="patients" />
                    <Input name="q" defaultValue={query} placeholder="Buscar por nome, nome social ou CPF" />
                    <Button variant="outline">
                      <Search />
                      Buscar
                    </Button>
                  </form>

                  {patients.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                      Nenhum paciente encontrado para sua permissão e filtros atuais.
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      {patients.map((patient) => (
                        <article key={patient.id} className="overflow-hidden rounded-lg border bg-card">
                          <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-medium">{patient.social_name || patient.full_name}</p>
                                {!patient.active ? <Badge>Inativo</Badge> : null}
                                {patient.consent_lgpd_at ? <Badge>LGPD</Badge> : null}
                              </div>
                              {patient.social_name ? (
                                <p className="mt-1 text-xs text-muted-foreground">Nome civil: {patient.full_name}</p>
                              ) : null}
                              <p className="mt-2 text-sm text-muted-foreground">
                                {patient.cpf ? formatCpf(patient.cpf) : "CPF não informado"} •{" "}
                                {patient.phone ? formatPhone(patient.phone) : "telefone não informado"}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {patient.email ?? "E-mail não informado"}
                              </p>
                            </div>
                            <DeleteRegistrationButton
                              id={patient.id}
                              resource="patient"
                              label="paciente"
                              disabled={!access.canDeletePatients}
                            />
                          </div>
                          <details className="border-t bg-background">
                            <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
                              Visualizar e editar cadastro
                            </summary>
                            <div className="border-t p-4">
                              <PatientForm patient={patient} disabled={!access.canEditPatients} />
                            </div>
                          </details>
                        </article>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="h-fit">
                <CardHeader>
                  <CardTitle>Novo paciente</CardTitle>
                  <CardDescription>O paciente ficará disponível imediatamente na Agenda.</CardDescription>
                </CardHeader>
                <CardContent>
                  <PatientForm disabled={!access.canCreatePatients} />
                </CardContent>
              </Card>
            </div>
          ) : null}

          {section === "services" ? (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle>Serviços da clínica</CardTitle>
                      <CardDescription>Duração, preço e identidade visual usados na Agenda.</CardDescription>
                    </div>
                    <ExportRegistrationButton resource="services" disabled={!access.canExportCatalog} />
                  </div>
                </CardHeader>
                <CardContent className="grid gap-3">
                  {services.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                      Nenhum serviço cadastrado.
                    </div>
                  ) : (
                    services.map((service) => (
                      <article key={service.id} className="overflow-hidden rounded-lg border bg-card">
                        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex min-w-0 gap-3">
                            <span
                              className="mt-1 size-4 shrink-0 rounded-sm border"
                              style={{ backgroundColor: service.color }}
                            />
                            <div>
                              <p className="font-medium">{service.name}</p>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {service.category || "Sem categoria"} • {service.duration_minutes} min •{" "}
                                {formatCurrencyBRL(service.price_cents)}
                              </p>
                            </div>
                          </div>
                          <DeleteRegistrationButton
                            id={service.id}
                            resource="service"
                            label="serviço"
                            disabled={!access.canDeleteCatalog}
                          />
                        </div>
                        <details className="border-t bg-background">
                          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Editar serviço</summary>
                          <div className="border-t p-4">
                            <ServiceForm
                              service={service}
                              disabled={!access.canEditCatalog}
                              defaultDuration={preferences.default_service_duration}
                            />
                          </div>
                        </details>
                      </article>
                    ))
                  )}
                </CardContent>
              </Card>
              <Card className="h-fit">
                <CardHeader>
                  <CardTitle>Novo serviço</CardTitle>
                  <CardDescription>Cadastre consultas, retornos, exames ou procedimentos.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ServiceForm
                    disabled={!access.canCreateCatalog}
                    defaultDuration={preferences.default_service_duration}
                  />
                </CardContent>
              </Card>
            </div>
          ) : null}

          {section === "rooms" ? (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle>Consultórios e espaços</CardTitle>
                      <CardDescription>Ambientes físicos disponíveis para alocação profissional.</CardDescription>
                    </div>
                    <ExportRegistrationButton resource="rooms" disabled={!access.canExportCatalog} />
                  </div>
                </CardHeader>
                <CardContent className="grid gap-3">
                  {rooms.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                      Nenhum consultório cadastrado.
                    </div>
                  ) : (
                    rooms.map((room) => (
                      <article key={room.id} className="overflow-hidden rounded-lg border bg-card">
                        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                          <div>
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
                          <DeleteRegistrationButton
                            id={room.id}
                            resource="room"
                            label="consultório"
                            disabled={!access.canDeleteCatalog}
                          />
                        </div>
                        <details className="border-t bg-background">
                          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
                            Editar consultório
                          </summary>
                          <div className="border-t p-4">
                            <RoomForm room={room} disabled={!access.canEditCatalog} />
                          </div>
                        </details>
                      </article>
                    ))
                  )}
                </CardContent>
              </Card>
              <Card className="h-fit">
                <CardHeader>
                  <CardTitle>Novo consultório</CardTitle>
                  <CardDescription>Cadastre espaços, capacidade e recursos disponíveis.</CardDescription>
                </CardHeader>
                <CardContent>
                  <RoomForm disabled={!access.canCreateCatalog} />
                </CardContent>
              </Card>
            </div>
          ) : null}

          {section === "professionals" ? (
            <div className="grid gap-4">
              {professionals.length === 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Nenhum profissional ativo</CardTitle>
                    <CardDescription>
                      Vincule um médico, profissional ou membro de enfermagem em Usuários e permissões.
                    </CardDescription>
                  </CardHeader>
                </Card>
              ) : (
                professionals.map((professional) => {
                  const professionalProfile = professionalProfiles.find(
                    (item) => item.professional_member_id === professional.id,
                  );
                  const ownAvailability = availability.filter(
                    (item) => item.professional_member_id === professional.id,
                  );
                  const ownBlocks = professionalBlocks.filter(
                    (item) => item.professional_member_id === professional.id,
                  );
                  const canEditOwn =
                    access.canEditCatalog ||
                    (access.currentMemberId === professional.id && access.canManageOwnAvailability);

                  return (
                    <article key={professional.id} className="overflow-hidden rounded-lg border bg-card shadow-sm">
                      <header className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex min-w-0 gap-3">
                          <div
                            className="flex size-11 shrink-0 items-center justify-center rounded-md text-white"
                            style={{ backgroundColor: professionalProfile?.appointment_color ?? "#0f766e" }}
                          >
                            <UserRound className="size-5" />
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
                            <p className="mt-1 text-xs text-muted-foreground">
                              {professional.profile?.email ?? "E-mail não informado"} •{" "}
                              {professional.profile?.phone
                                ? formatPhone(professional.profile.phone)
                                : "telefone não informado"}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs">
                          <Badge>{ownAvailability.length} disponibilidade(s)</Badge>
                          <Badge>{ownBlocks.length} bloqueio(s)</Badge>
                        </div>
                      </header>

                      <details className="border-t bg-background">
                        <summary className="cursor-pointer px-5 py-4 text-sm font-medium">
                          Ficha profissional e padrões de atendimento
                        </summary>
                        <div className="border-t p-5">
                          <ProfessionalProfileForm
                            professional={professional}
                            professionalProfile={professionalProfile}
                            services={services}
                            rooms={rooms}
                            disabled={!canEditOwn}
                          />
                        </div>
                      </details>

                      <details className="border-t bg-background">
                        <summary className="cursor-pointer px-5 py-4 text-sm font-medium">
                          Expediente e preferências da agenda
                        </summary>
                        <div className="border-t p-5">
                          <ProfessionalSettingsForm
                            professionals={[professional]}
                            settings={scheduleSettings}
                            fixedProfessionalId={professional.id}
                            disabled={!access.canManageSchedule}
                          />
                        </div>
                      </details>

                      <details className="border-t bg-background">
                        <summary className="cursor-pointer px-5 py-4 text-sm font-medium">
                          Disponibilidade por dia, serviço e consultório
                        </summary>
                        <div className="grid gap-5 border-t p-5 xl:grid-cols-[minmax(0,1fr)_430px]">
                          <div className="grid gap-3">
                            {ownAvailability.length === 0 ? (
                              <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
                                Nenhuma disponibilidade específica cadastrada.
                              </div>
                            ) : (
                              ownAvailability.map((rule) => {
                                const room = rooms.find((item) => item.id === rule.room_id);
                                const service = services.find((item) => item.id === rule.service_id);

                                return (
                                  <div key={rule.id} className="overflow-hidden rounded-lg border">
                                    <div className="flex items-start justify-between gap-3 p-4">
                                      <div>
                                        <p className="font-medium">
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
                                      <DeleteRegistrationButton
                                        id={rule.id}
                                        resource="availability"
                                        label="disponibilidade"
                                        disabled={!access.canDeleteCatalog && !access.canManageOwnAvailability}
                                      />
                                    </div>
                                    <details className="border-t">
                                      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
                                        Editar disponibilidade
                                      </summary>
                                      <div className="border-t p-4">
                                        <AvailabilityForm
                                          availability={rule}
                                          professionals={[professional]}
                                          fixedProfessionalId={professional.id}
                                          rooms={rooms}
                                          services={services}
                                          disabled={!canEditOwn}
                                        />
                                      </div>
                                    </details>
                                  </div>
                                );
                              })
                            )}
                          </div>
                          <div className="border-l-0 xl:border-l xl:pl-5">
                            <h3 className="mb-1 font-medium">Nova disponibilidade</h3>
                            <p className="mb-4 text-sm text-muted-foreground">
                              Defina dias, horários e alocação preferencial.
                            </p>
                            <AvailabilityForm
                              professionals={[professional]}
                              fixedProfessionalId={professional.id}
                              rooms={rooms}
                              services={services}
                              disabled={!canEditOwn}
                            />
                          </div>
                        </div>
                      </details>

                      <details className="border-t bg-background">
                        <summary className="cursor-pointer px-5 py-4 text-sm font-medium">
                          Bloqueios, férias e indisponibilidades
                        </summary>
                        <div className="grid gap-5 border-t p-5 xl:grid-cols-[minmax(0,1fr)_430px]">
                          <div className="grid gap-3">
                            {ownBlocks.length === 0 ? (
                              <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
                                Nenhum bloqueio cadastrado.
                              </div>
                            ) : (
                              ownBlocks.map((block) => (
                                <div key={block.id} className="overflow-hidden rounded-lg border">
                                  <div className="flex items-start justify-between gap-3 p-4">
                                    <div>
                                      <p className="font-medium">{SCHEDULE_BLOCK_TYPE_LABELS[block.block_type]}</p>
                                      <p className="mt-1 text-sm text-muted-foreground">
                                        {formatDateTimeBr(block.starts_at)} até {formatDateTimeBr(block.ends_at)}
                                      </p>
                                      {block.reason ? (
                                        <p className="mt-1 text-xs text-muted-foreground">{block.reason}</p>
                                      ) : null}
                                    </div>
                                    <DeleteScheduleBlockButton
                                      blockId={block.id}
                                      disabled={!access.canManageSchedule}
                                    />
                                  </div>
                                  <details className="border-t">
                                    <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
                                      Editar bloqueio
                                    </summary>
                                    <div className="border-t p-4">
                                      <ScheduleBlockForm
                                        professionals={[professional]}
                                        fixedProfessionalId={professional.id}
                                        defaultDate={getTodayInputDate()}
                                        block={block}
                                        disabled={!access.canManageSchedule}
                                      />
                                    </div>
                                  </details>
                                </div>
                              ))
                            )}
                          </div>
                          <div className="border-l-0 xl:border-l xl:pl-5">
                            <h3 className="mb-1 font-medium">Novo bloqueio</h3>
                            <p className="mb-4 text-sm text-muted-foreground">
                              Registre intervalos, férias ou períodos administrativos.
                            </p>
                            <ScheduleBlockForm
                              professionals={[professional]}
                              fixedProfessionalId={professional.id}
                              defaultDate={getTodayInputDate()}
                              disabled={!access.canManageSchedule}
                            />
                          </div>
                        </div>
                      </details>
                    </article>
                  );
                })
              )}
            </div>
          ) : null}

          {section === "preferences" ? (
            <Card className="max-w-3xl">
              <CardHeader>
                <CardTitle>Preferências de cadastro</CardTitle>
                <CardDescription>
                  Personalize obrigatoriedade de campos, exibição de pacientes e padrões da clínica.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RegistrationPreferencesForm
                  preferences={preferences}
                  disabled={!access.canManageSchedule}
                />
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
    </>
  );
}
