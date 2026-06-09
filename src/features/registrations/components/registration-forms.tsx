"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Download, Save, Trash2 } from "lucide-react";
import {
  deleteRegistrationAction,
  saveAvailabilityAction,
  savePatientAction,
  saveProfessionalProfileAction,
  saveRegistrationPreferencesAction,
  saveRoomAction,
  saveServiceAction,
  type RegistrationActionState,
} from "@/features/registrations/actions";
import {
  formatCpf,
  formatCurrencyInput,
  formatPhone,
  formatPostalCode,
  normalizeEmail,
} from "@/lib/formatters";
import type {
  ClinicRoom,
  ClinicService,
  PatientSummary,
  ProfessionalAvailabilityRule,
  ProfessionalOperationalProfile,
  RegistrationPreferences,
  ScheduleProfessional,
} from "@/types/domain";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

const weekdays = [
  { value: 1, label: "Segunda-feira" },
  { value: 2, label: "Terça-feira" },
  { value: 3, label: "Quarta-feira" },
  { value: 4, label: "Quinta-feira" },
  { value: 5, label: "Sexta-feira" },
  { value: 6, label: "Sábado" },
  { value: 0, label: "Domingo" },
];

function useRegistrationToast(state: RegistrationActionState, description: string) {
  const { toast } = useToast();

  useEffect(() => {
    if (state.success) {
      toast({ title: state.success, description });
    }

    if (state.error) {
      toast({ title: "Ação não concluída", description: state.error, variant: "destructive" });
    }
  }, [description, state.error, state.success, toast]);
}

function FormMessage({ state }: { state: RegistrationActionState }) {
  if (state.error) {
    return <p className="text-sm text-destructive">{state.error}</p>;
  }

  if (state.success) {
    return <p className="text-sm text-primary">{state.success}</p>;
  }

  return null;
}

export function PatientForm({
  patient,
  disabled,
}: {
  patient?: PatientSummary;
  disabled?: boolean;
}) {
  const [state, formAction, pending] = useActionState(savePatientAction, {});
  const [cpf, setCpf] = useState(patient?.cpf ? formatCpf(patient.cpf) : "");
  const [phone, setPhone] = useState(patient?.phone ? formatPhone(patient.phone) : "");
  const [emergencyPhone, setEmergencyPhone] = useState(
    patient?.emergency_contact_phone ? formatPhone(patient.emergency_contact_phone) : "",
  );
  const [email, setEmail] = useState(patient?.email ?? "");
  const [postalCode, setPostalCode] = useState(
    patient?.postal_code ? formatPostalCode(patient.postal_code) : "",
  );

  useRegistrationToast(
    state,
    "O cadastro foi validado, vinculado à clínica ativa e registrado na auditoria.",
  );

  return (
    <form action={formAction} className="grid gap-5">
      {patient?.id ? <input type="hidden" name="id" value={patient.id} /> : null}

      <fieldset className="grid gap-4">
        <legend className="mb-3 text-sm font-semibold">Identificação</legend>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor={`full_name-${patient?.id ?? "new"}`}>Nome completo</Label>
            <Input
              id={`full_name-${patient?.id ?? "new"}`}
              name="full_name"
              defaultValue={patient?.full_name ?? ""}
              disabled={disabled || pending}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`social_name-${patient?.id ?? "new"}`}>Nome social</Label>
            <Input
              id={`social_name-${patient?.id ?? "new"}`}
              name="social_name"
              defaultValue={patient?.social_name ?? ""}
              disabled={disabled || pending}
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="grid gap-2">
            <Label htmlFor={`cpf-${patient?.id ?? "new"}`}>CPF</Label>
            <Input
              id={`cpf-${patient?.id ?? "new"}`}
              name="cpf"
              inputMode="numeric"
              value={cpf}
              onChange={(event) => setCpf(formatCpf(event.target.value))}
              disabled={disabled || pending}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`rg-${patient?.id ?? "new"}`}>RG</Label>
            <Input
              id={`rg-${patient?.id ?? "new"}`}
              name="rg"
              defaultValue={patient?.rg ?? ""}
              disabled={disabled || pending}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`issuing-${patient?.id ?? "new"}`}>Órgão emissor</Label>
            <Input
              id={`issuing-${patient?.id ?? "new"}`}
              name="issuing_authority"
              defaultValue={patient?.issuing_authority ?? ""}
              disabled={disabled || pending}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`birth-${patient?.id ?? "new"}`}>Nascimento</Label>
            <Input
              id={`birth-${patient?.id ?? "new"}`}
              name="birth_date"
              type="date"
              defaultValue={patient?.birth_date ?? ""}
              disabled={disabled || pending}
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="grid gap-2">
            <Label htmlFor={`sex-${patient?.id ?? "new"}`}>Sexo ao nascer</Label>
            <Select
              id={`sex-${patient?.id ?? "new"}`}
              name="sex_at_birth"
              defaultValue={patient?.sex_at_birth ?? ""}
              disabled={disabled || pending}
            >
              <option value="">Não informado</option>
              <option value="Feminino">Feminino</option>
              <option value="Masculino">Masculino</option>
              <option value="Intersexo">Intersexo</option>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`gender-${patient?.id ?? "new"}`}>Identidade de gênero</Label>
            <Input
              id={`gender-${patient?.id ?? "new"}`}
              name="gender_identity"
              defaultValue={patient?.gender_identity ?? ""}
              disabled={disabled || pending}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`marital-${patient?.id ?? "new"}`}>Estado civil</Label>
            <Input
              id={`marital-${patient?.id ?? "new"}`}
              name="marital_status"
              defaultValue={patient?.marital_status ?? ""}
              disabled={disabled || pending}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`occupation-${patient?.id ?? "new"}`}>Profissão</Label>
            <Input
              id={`occupation-${patient?.id ?? "new"}`}
              name="occupation"
              defaultValue={patient?.occupation ?? ""}
              disabled={disabled || pending}
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="grid gap-4 border-t pt-5">
        <legend className="mb-3 text-sm font-semibold">Contato</legend>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor={`phone-${patient?.id ?? "new"}`}>Telefone / WhatsApp</Label>
            <Input
              id={`phone-${patient?.id ?? "new"}`}
              name="phone"
              inputMode="tel"
              value={phone}
              onChange={(event) => setPhone(formatPhone(event.target.value))}
              disabled={disabled || pending}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`email-${patient?.id ?? "new"}`}>E-mail</Label>
            <Input
              id={`email-${patient?.id ?? "new"}`}
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(normalizeEmail(event.target.value))}
              disabled={disabled || pending}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`preferred-${patient?.id ?? "new"}`}>Contato preferencial</Label>
            <Select
              id={`preferred-${patient?.id ?? "new"}`}
              name="preferred_contact"
              defaultValue={patient?.preferred_contact ?? "whatsapp"}
              disabled={disabled || pending}
            >
              <option value="whatsapp">WhatsApp</option>
              <option value="phone">Telefone</option>
              <option value="email">E-mail</option>
            </Select>
          </div>
        </div>
      </fieldset>

      <fieldset className="grid gap-4 border-t pt-5">
        <legend className="mb-3 text-sm font-semibold">Endereço</legend>
        <div className="grid gap-3 sm:grid-cols-[150px_1fr_120px]">
          <div className="grid gap-2">
            <Label htmlFor={`postal-${patient?.id ?? "new"}`}>CEP</Label>
            <Input
              id={`postal-${patient?.id ?? "new"}`}
              name="postal_code"
              inputMode="numeric"
              value={postalCode}
              onChange={(event) => setPostalCode(formatPostalCode(event.target.value))}
              disabled={disabled || pending}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`address-${patient?.id ?? "new"}`}>Logradouro</Label>
            <Input
              id={`address-${patient?.id ?? "new"}`}
              name="address_line"
              defaultValue={patient?.address_line ?? ""}
              disabled={disabled || pending}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`number-${patient?.id ?? "new"}`}>Número</Label>
            <Input
              id={`number-${patient?.id ?? "new"}`}
              name="address_number"
              defaultValue={patient?.address_number ?? ""}
              disabled={disabled || pending}
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="grid gap-2">
            <Label htmlFor={`complement-${patient?.id ?? "new"}`}>Complemento</Label>
            <Input
              id={`complement-${patient?.id ?? "new"}`}
              name="address_complement"
              defaultValue={patient?.address_complement ?? ""}
              disabled={disabled || pending}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`neighborhood-${patient?.id ?? "new"}`}>Bairro</Label>
            <Input
              id={`neighborhood-${patient?.id ?? "new"}`}
              name="neighborhood"
              defaultValue={patient?.neighborhood ?? ""}
              disabled={disabled || pending}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`city-${patient?.id ?? "new"}`}>Cidade</Label>
            <Input
              id={`city-${patient?.id ?? "new"}`}
              name="city"
              defaultValue={patient?.city ?? ""}
              disabled={disabled || pending}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`state-${patient?.id ?? "new"}`}>UF</Label>
            <Input
              id={`state-${patient?.id ?? "new"}`}
              name="state"
              maxLength={2}
              defaultValue={patient?.state ?? ""}
              disabled={disabled || pending}
              onChange={(event) => {
                event.target.value = event.target.value.toUpperCase().replace(/[^A-Z]/g, "");
              }}
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="grid gap-4 border-t pt-5">
        <legend className="mb-3 text-sm font-semibold">Responsável, convênio e alertas</legend>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor={`emergency-name-${patient?.id ?? "new"}`}>Contato de emergência</Label>
            <Input
              id={`emergency-name-${patient?.id ?? "new"}`}
              name="emergency_contact_name"
              defaultValue={patient?.emergency_contact_name ?? ""}
              disabled={disabled || pending}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`emergency-relation-${patient?.id ?? "new"}`}>Relação</Label>
            <Input
              id={`emergency-relation-${patient?.id ?? "new"}`}
              name="emergency_contact_relationship"
              defaultValue={patient?.emergency_contact_relationship ?? ""}
              disabled={disabled || pending}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`emergency-phone-${patient?.id ?? "new"}`}>Telefone de emergência</Label>
            <Input
              id={`emergency-phone-${patient?.id ?? "new"}`}
              name="emergency_contact_phone"
              inputMode="tel"
              value={emergencyPhone}
              onChange={(event) => setEmergencyPhone(formatPhone(event.target.value))}
              disabled={disabled || pending}
            />
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor={`plan-${patient?.id ?? "new"}`}>Convênio</Label>
            <Input
              id={`plan-${patient?.id ?? "new"}`}
              name="health_plan_name"
              defaultValue={patient?.health_plan_name ?? ""}
              disabled={disabled || pending}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`plan-number-${patient?.id ?? "new"}`}>Número da carteirinha</Label>
            <Input
              id={`plan-number-${patient?.id ?? "new"}`}
              name="health_plan_number"
              defaultValue={patient?.health_plan_number ?? ""}
              disabled={disabled || pending}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`plan-valid-${patient?.id ?? "new"}`}>Validade</Label>
            <Input
              id={`plan-valid-${patient?.id ?? "new"}`}
              name="health_plan_valid_until"
              type="date"
              defaultValue={patient?.health_plan_valid_until ?? ""}
              disabled={disabled || pending}
            />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`alerts-${patient?.id ?? "new"}`}>Alertas clínicos administrativos</Label>
          <textarea
            id={`alerts-${patient?.id ?? "new"}`}
            name="clinical_alerts"
            defaultValue={patient?.clinical_alerts ?? ""}
            disabled={disabled || pending}
            className="min-h-20 rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`notes-${patient?.id ?? "new"}`}>Observações cadastrais</Label>
          <textarea
            id={`notes-${patient?.id ?? "new"}`}
            name="notes"
            defaultValue={patient?.notes ?? ""}
            disabled={disabled || pending}
            className="min-h-20 rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-3 rounded-md border bg-background p-3 text-sm">
          <input
            type="checkbox"
            name="consent_lgpd"
            defaultChecked={Boolean(patient?.consent_lgpd_at)}
            disabled={disabled || pending}
          />
          Consentimento LGPD registrado
        </label>
        <label className="flex items-center gap-3 rounded-md border bg-background p-3 text-sm">
          <input
            type="checkbox"
            name="active"
            defaultChecked={patient?.active ?? true}
            disabled={disabled || pending}
          />
          Cadastro ativo
        </label>
      </div>

      <input type="hidden" name="nationality" value={patient?.nationality ?? "Brasileira"} />
      <FormMessage state={state} />
      <Button disabled={disabled || pending}>
        <Save />
        {pending ? "Salvando..." : patient ? "Salvar paciente" : "Cadastrar paciente"}
      </Button>
    </form>
  );
}

export function ServiceForm({
  service,
  disabled,
  defaultDuration = 30,
}: {
  service?: ClinicService;
  disabled?: boolean;
  defaultDuration?: number;
}) {
  const [state, formAction, pending] = useActionState(saveServiceAction, {});
  const [price, setPrice] = useState(
    service ? formatCurrencyInput(String(service.price_cents)) : "0,00",
  );

  useRegistrationToast(state, "O serviço já pode ser utilizado na Agenda e no financeiro futuro.");

  return (
    <form action={formAction} className="grid gap-4">
      {service?.id ? <input type="hidden" name="id" value={service.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
        <div className="grid gap-2">
          <Label htmlFor={`service-code-${service?.id ?? "new"}`}>Código</Label>
          <Input
            id={`service-code-${service?.id ?? "new"}`}
            name="code"
            defaultValue={service?.code ?? ""}
            disabled={disabled || pending}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`service-name-${service?.id ?? "new"}`}>Nome do serviço</Label>
          <Input
            id={`service-name-${service?.id ?? "new"}`}
            name="name"
            defaultValue={service?.name ?? ""}
            disabled={disabled || pending}
            required
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`service-category-${service?.id ?? "new"}`}>Categoria</Label>
          <Input
            id={`service-category-${service?.id ?? "new"}`}
            name="category"
            defaultValue={service?.category ?? ""}
            disabled={disabled || pending}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`service-duration-${service?.id ?? "new"}`}>Duração em minutos</Label>
          <Input
            id={`service-duration-${service?.id ?? "new"}`}
            name="duration_minutes"
            type="number"
            min={5}
            max={720}
            defaultValue={service?.duration_minutes ?? defaultDuration}
            disabled={disabled || pending}
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_100px]">
        <div className="grid gap-2">
          <Label htmlFor={`service-price-${service?.id ?? "new"}`}>Valor</Label>
          <Input
            id={`service-price-${service?.id ?? "new"}`}
            name="price"
            inputMode="decimal"
            value={price}
            onChange={(event) => setPrice(formatCurrencyInput(event.target.value))}
            disabled={disabled || pending}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`service-color-${service?.id ?? "new"}`}>Cor</Label>
          <Input
            id={`service-color-${service?.id ?? "new"}`}
            name="color"
            type="color"
            defaultValue={service?.color ?? "#0f766e"}
            disabled={disabled || pending}
            className="p-1"
          />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`service-description-${service?.id ?? "new"}`}>Descrição</Label>
        <textarea
          id={`service-description-${service?.id ?? "new"}`}
          name="description"
          defaultValue={service?.description ?? ""}
          disabled={disabled || pending}
          className="min-h-20 rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-3 rounded-md border bg-background p-3 text-sm">
          <input
            type="checkbox"
            name="requires_authorization"
            defaultChecked={service?.requires_authorization ?? false}
            disabled={disabled || pending}
          />
          Exige autorização
        </label>
        <label className="flex items-center gap-3 rounded-md border bg-background p-3 text-sm">
          <input
            type="checkbox"
            name="active"
            defaultChecked={service?.active ?? true}
            disabled={disabled || pending}
          />
          Serviço ativo
        </label>
      </div>
      <FormMessage state={state} />
      <Button disabled={disabled || pending}>
        <Save />
        {pending ? "Salvando..." : service ? "Salvar serviço" : "Cadastrar serviço"}
      </Button>
    </form>
  );
}

export function RoomForm({ room, disabled }: { room?: ClinicRoom; disabled?: boolean }) {
  const [state, formAction, pending] = useActionState(saveRoomAction, {});

  useRegistrationToast(state, "O consultório pode ser vinculado à disponibilidade e às consultas.");

  return (
    <form action={formAction} className="grid gap-4">
      {room?.id ? <input type="hidden" name="id" value={room.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
        <div className="grid gap-2">
          <Label htmlFor={`room-code-${room?.id ?? "new"}`}>Código</Label>
          <Input
            id={`room-code-${room?.id ?? "new"}`}
            name="code"
            defaultValue={room?.code ?? ""}
            disabled={disabled || pending}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`room-name-${room?.id ?? "new"}`}>Nome do consultório</Label>
          <Input
            id={`room-name-${room?.id ?? "new"}`}
            name="name"
            defaultValue={room?.name ?? ""}
            disabled={disabled || pending}
            required
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor={`room-type-${room?.id ?? "new"}`}>Tipo</Label>
          <Select
            id={`room-type-${room?.id ?? "new"}`}
            name="room_type"
            defaultValue={room?.room_type ?? "Consultório"}
            disabled={disabled || pending}
          >
            <option>Consultório</option>
            <option>Sala de procedimento</option>
            <option>Sala de triagem</option>
            <option>Centro cirúrgico</option>
            <option>Teleatendimento</option>
            <option>Outro</option>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`room-floor-${room?.id ?? "new"}`}>Andar / setor</Label>
          <Input
            id={`room-floor-${room?.id ?? "new"}`}
            name="floor"
            defaultValue={room?.floor ?? ""}
            disabled={disabled || pending}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`room-capacity-${room?.id ?? "new"}`}>Capacidade</Label>
          <Input
            id={`room-capacity-${room?.id ?? "new"}`}
            name="capacity"
            type="number"
            min={1}
            max={100}
            defaultValue={room?.capacity ?? 1}
            disabled={disabled || pending}
          />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`room-resources-${room?.id ?? "new"}`}>Recursos disponíveis</Label>
        <Input
          id={`room-resources-${room?.id ?? "new"}`}
          name="resources"
          defaultValue={room?.resources.join(", ") ?? ""}
          disabled={disabled || pending}
          placeholder="Maca, ultrassom, computador"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`room-notes-${room?.id ?? "new"}`}>Observações</Label>
        <textarea
          id={`room-notes-${room?.id ?? "new"}`}
          name="notes"
          defaultValue={room?.notes ?? ""}
          disabled={disabled || pending}
          className="min-h-20 rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <label className="flex items-center gap-3 rounded-md border bg-background p-3 text-sm">
        <input
          type="checkbox"
          name="active"
          defaultChecked={room?.active ?? true}
          disabled={disabled || pending}
        />
        Consultório ativo
      </label>
      <FormMessage state={state} />
      <Button disabled={disabled || pending}>
        <Save />
        {pending ? "Salvando..." : room ? "Salvar consultório" : "Cadastrar consultório"}
      </Button>
    </form>
  );
}

export function ProfessionalProfileForm({
  professional,
  professionalProfile,
  services,
  rooms,
  disabled,
}: {
  professional: ScheduleProfessional;
  professionalProfile?: ProfessionalOperationalProfile;
  services: ClinicService[];
  rooms: ClinicRoom[];
  disabled?: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveProfessionalProfileAction, {});
  const canSubmit = !disabled && !pending;

  useRegistrationToast(
    state,
    "Especialidade, registro profissional e padrões operacionais foram atualizados.",
  );

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="professional_member_id" value={professional.id} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`specialty-${professional.id}`}>Especialidade principal</Label>
          <Input
            id={`specialty-${professional.id}`}
            name="specialty"
            defaultValue={professionalProfile?.specialty ?? ""}
            placeholder="Ex.: Cardiologia"
            disabled={!canSubmit}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`rqe-${professional.id}`}>RQE / qualificação</Label>
          <Input
            id={`rqe-${professional.id}`}
            name="rqe"
            defaultValue={professionalProfile?.rqe ?? ""}
            disabled={!canSubmit}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_1.2fr_100px]">
        <div className="grid gap-2">
          <Label htmlFor={`council-type-${professional.id}`}>Conselho</Label>
          <Input
            id={`council-type-${professional.id}`}
            name="council_type"
            defaultValue={professionalProfile?.council_type ?? ""}
            placeholder="CRM, CRO, COREN, CRP..."
            disabled={!canSubmit}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`council-number-${professional.id}`}>Número</Label>
          <Input
            id={`council-number-${professional.id}`}
            name="council_number"
            defaultValue={professionalProfile?.council_number ?? ""}
            disabled={!canSubmit}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`council-state-${professional.id}`}>UF</Label>
          <Input
            id={`council-state-${professional.id}`}
            name="council_state"
            maxLength={2}
            defaultValue={professionalProfile?.council_state ?? ""}
            className="uppercase"
            disabled={!canSubmit}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`default-service-${professional.id}`}>Serviço padrão</Label>
          <Select
            id={`default-service-${professional.id}`}
            name="default_service_id"
            defaultValue={professionalProfile?.default_service_id ?? "none"}
            disabled={!canSubmit}
          >
            <option value="none">Sem serviço padrão</option>
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`default-room-${professional.id}`}>Consultório padrão</Label>
          <Select
            id={`default-room-${professional.id}`}
            name="default_room_id"
            defaultValue={professionalProfile?.default_room_id ?? "none"}
            disabled={!canSubmit}
          >
            <option value="none">Sem consultório padrão</option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`appointment-color-${professional.id}`}>Cor na agenda</Label>
        <div className="flex items-center gap-3">
          <Input
            id={`appointment-color-${professional.id}`}
            name="appointment_color"
            type="color"
            defaultValue={professionalProfile?.appointment_color ?? "#0f766e"}
            className="h-10 w-16 p-1"
            disabled={!canSubmit}
          />
          <span className="text-sm text-muted-foreground">
            Identifica visualmente os compromissos deste profissional.
          </span>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`professional-bio-${professional.id}`}>Apresentação profissional</Label>
        <textarea
          id={`professional-bio-${professional.id}`}
          name="bio"
          defaultValue={professionalProfile?.bio ?? ""}
          className="min-h-24 rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          disabled={!canSubmit}
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <label className="flex items-center gap-3 rounded-md border bg-background p-3 text-sm">
          <input
            type="checkbox"
            name="telemedicine_enabled"
            defaultChecked={professionalProfile?.telemedicine_enabled ?? false}
            disabled={!canSubmit}
          />
          Teleatendimento
        </label>
        <label className="flex items-center gap-3 rounded-md border bg-background p-3 text-sm">
          <input
            type="checkbox"
            name="accepts_new_patients"
            defaultChecked={professionalProfile?.accepts_new_patients ?? true}
            disabled={!canSubmit}
          />
          Aceita novos pacientes
        </label>
        <label className="flex items-center gap-3 rounded-md border bg-background p-3 text-sm">
          <input
            type="checkbox"
            name="active"
            defaultChecked={professionalProfile?.active ?? true}
            disabled={!canSubmit}
          />
          Ativo na operação
        </label>
      </div>

      <FormMessage state={state} />
      <Button disabled={!canSubmit}>
        <Save />
        {pending ? "Salvando..." : "Salvar ficha profissional"}
      </Button>
    </form>
  );
}

export function AvailabilityForm({
  availability,
  professionals,
  rooms,
  services,
  fixedProfessionalId,
  disabled,
}: {
  availability?: ProfessionalAvailabilityRule;
  professionals: ScheduleProfessional[];
  rooms: ClinicRoom[];
  services: ClinicService[];
  fixedProfessionalId?: string;
  disabled?: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveAvailabilityAction, {});
  const [recurrenceType, setRecurrenceType] = useState<"weekly" | "specific_date">(
    availability?.recurrence_type ?? "weekly",
  );
  const fieldId = availability?.id ?? fixedProfessionalId ?? "new";

  useRegistrationToast(state, "A regra já pode ser usada para organizar a Agenda da clínica.");

  return (
    <form action={formAction} className="grid gap-4">
      {availability?.id ? <input type="hidden" name="id" value={availability.id} /> : null}
      {fixedProfessionalId ? (
        <input type="hidden" name="professional_member_id" value={fixedProfessionalId} />
      ) : (
      <div className="grid gap-2">
        <Label htmlFor={`availability-professional-${fieldId}`}>Profissional</Label>
        <Select
          id={`availability-professional-${fieldId}`}
          name="professional_member_id"
          defaultValue={availability?.professional_member_id ?? professionals[0]?.id}
          disabled={disabled || pending}
          required
        >
          {professionals.map((professional) => (
            <option key={professional.id} value={professional.id}>
              {professional.profile?.full_name ?? "Profissional sem nome"}
            </option>
          ))}
        </Select>
      </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`availability-room-${fieldId}`}>Consultório</Label>
          <Select
            id={`availability-room-${fieldId}`}
            name="room_id"
            defaultValue={availability?.room_id ?? "none"}
            disabled={disabled || pending}
          >
            <option value="none">Sem consultório fixo</option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`availability-service-${fieldId}`}>Serviço preferencial</Label>
          <Select
            id={`availability-service-${fieldId}`}
            name="service_id"
            defaultValue={availability?.service_id ?? "none"}
            disabled={disabled || pending}
          >
            <option value="none">Todos os serviços</option>
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`recurrence-${fieldId}`}>Recorrência</Label>
          <Select
            id={`recurrence-${fieldId}`}
            name="recurrence_type"
            value={recurrenceType}
            onChange={(event) => setRecurrenceType(event.target.value as "weekly" | "specific_date")}
            disabled={disabled || pending}
          >
            <option value="weekly">Semanal</option>
            <option value="specific_date">Data específica</option>
          </Select>
        </div>
        {recurrenceType === "weekly" ? (
          <div className="grid gap-2">
            <Label htmlFor={`weekday-${fieldId}`}>Dia da semana</Label>
            <Select
              id={`weekday-${fieldId}`}
              name="weekday"
              defaultValue={String(availability?.weekday ?? 1)}
              disabled={disabled || pending}
            >
              {weekdays.map((day) => (
                <option key={day.value} value={day.value}>
                  {day.label}
                </option>
              ))}
            </Select>
          </div>
        ) : (
          <div className="grid gap-2">
            <Label htmlFor={`specific-${fieldId}`}>Data</Label>
            <Input
              id={`specific-${fieldId}`}
              name="specific_date"
              type="date"
              defaultValue={availability?.specific_date ?? ""}
              disabled={disabled || pending}
            />
          </div>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`valid-from-${fieldId}`}>Válido a partir de</Label>
          <Input
            id={`valid-from-${fieldId}`}
            name="valid_from"
            type="date"
            defaultValue={availability?.valid_from ?? ""}
            disabled={disabled || pending}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`valid-until-${fieldId}`}>Válido até</Label>
          <Input
            id={`valid-until-${fieldId}`}
            name="valid_until"
            type="date"
            defaultValue={availability?.valid_until ?? ""}
            disabled={disabled || pending}
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor={`availability-start-${fieldId}`}>Início</Label>
          <Input
            id={`availability-start-${fieldId}`}
            name="start_time"
            type="time"
            defaultValue={availability?.start_time?.slice(0, 5) ?? "08:00"}
            disabled={disabled || pending}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`availability-end-${fieldId}`}>Fim</Label>
          <Input
            id={`availability-end-${fieldId}`}
            name="end_time"
            type="time"
            defaultValue={availability?.end_time?.slice(0, 5) ?? "18:00"}
            disabled={disabled || pending}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`availability-slot-${fieldId}`}>Intervalo</Label>
          <Input
            id={`availability-slot-${fieldId}`}
            name="slot_minutes"
            type="number"
            min={5}
            max={720}
            defaultValue={availability?.slot_minutes ?? 30}
            disabled={disabled || pending}
          />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`availability-notes-${fieldId}`}>Observações</Label>
        <Input
          id={`availability-notes-${fieldId}`}
          name="notes"
          defaultValue={availability?.notes ?? ""}
          disabled={disabled || pending}
        />
      </div>
      <label className="flex items-center gap-3 rounded-md border bg-background p-3 text-sm">
        <input
          type="checkbox"
          name="active"
          defaultChecked={availability?.active ?? true}
          disabled={disabled || pending}
        />
        Regra ativa
      </label>
      <FormMessage state={state} />
      <Button disabled={disabled || pending || professionals.length === 0}>
        <Save />
        {pending ? "Salvando..." : availability ? "Salvar disponibilidade" : "Cadastrar disponibilidade"}
      </Button>
    </form>
  );
}

export function RegistrationPreferencesForm({
  preferences,
  disabled,
}: {
  preferences: RegistrationPreferences;
  disabled?: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveRegistrationPreferencesAction, {});

  useRegistrationToast(state, "As regras passam a valer nos próximos cadastros da clínica.");

  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-3 rounded-md border bg-background p-3 text-sm">
          <input
            type="checkbox"
            name="require_patient_cpf"
            defaultChecked={preferences.require_patient_cpf}
            disabled={disabled || pending}
          />
          Exigir CPF no cadastro do paciente
        </label>
        <label className="flex items-center gap-3 rounded-md border bg-background p-3 text-sm">
          <input
            type="checkbox"
            name="require_patient_email"
            defaultChecked={preferences.require_patient_email}
            disabled={disabled || pending}
          />
          Exigir e-mail do paciente
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="default_service_duration">Duração padrão</Label>
          <Input
            id="default_service_duration"
            name="default_service_duration"
            type="number"
            min={5}
            max={720}
            defaultValue={preferences.default_service_duration}
            disabled={disabled || pending}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="patient_display_name">Nome exibido</Label>
          <Select
            id="patient_display_name"
            name="patient_display_name"
            defaultValue={preferences.patient_display_name}
            disabled={disabled || pending}
          >
            <option value="full_name">Nome civil</option>
            <option value="social_name">Nome social quando disponível</option>
          </Select>
        </div>
      </div>
      <label className="flex items-center gap-3 rounded-md border bg-background p-3 text-sm">
        <input
          type="checkbox"
          name="show_inactive_records"
          defaultChecked={preferences.show_inactive_records}
          disabled={disabled || pending}
        />
        Exibir registros inativos por padrão
      </label>
      <FormMessage state={state} />
      <Button disabled={disabled || pending}>
        <Save />
        {pending ? "Salvando..." : "Salvar preferências"}
      </Button>
    </form>
  );
}

export function DeleteRegistrationButton({
  id,
  resource,
  label,
  disabled,
}: {
  id: string;
  resource: "patient" | "service" | "room" | "availability";
  label: string;
  disabled?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(deleteRegistrationAction, {});

  useRegistrationToast(state, "O registro foi removido por soft delete e permanece auditável.");

  return (
    <form ref={formRef} action={formAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="resource" value={resource} />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || pending}
        onClick={() => setOpen(true)}
      >
        <Trash2 />
        Excluir
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Excluir ${label}?`}
        description="O registro ficará inativo, será removido das rotinas operacionais e continuará disponível na auditoria."
        confirmLabel="Excluir cadastro"
        destructive
        onConfirm={() => formRef.current?.requestSubmit()}
      />
    </form>
  );
}

export function ExportRegistrationButton({
  resource,
  disabled,
}: {
  resource: "patients" | "services" | "rooms";
  disabled?: boolean;
}) {
  const { toast } = useToast();

  return (
    <Button
      type="button"
      variant="outline"
      disabled={disabled}
      onClick={() => {
        window.location.href = `/api/cadastros/export?resource=${resource}`;
        toast({ title: "Exportação iniciada", description: "O arquivo CSV será gerado com os filtros de segurança da clínica." });
      }}
    >
      <Download />
      Exportar CSV
    </Button>
  );
}
