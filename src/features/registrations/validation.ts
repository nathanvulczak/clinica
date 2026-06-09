import { z } from "zod";
import { onlyDigits } from "@/lib/utils";
import { isValidCpf, isValidEmail } from "@/lib/validators";

const optionalText = z
  .string()
  .optional()
  .transform((value) => value?.trim() ?? "")
  .transform((value) => (value.length > 0 ? value : null));

const optionalDate = z
  .string()
  .optional()
  .transform((value) => value?.trim() ?? "")
  .refine((value) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value), "Informe uma data válida.")
  .transform((value) => (value.length > 0 ? value : null));

const optionalPhone = z
  .string()
  .optional()
  .transform((value) => onlyDigits(value ?? ""))
  .refine((value) => !value || (value.length >= 10 && value.length <= 11), "Telefone inválido.")
  .transform((value) => (value.length > 0 ? value : null));

const optionalEmail = z
  .string()
  .optional()
  .transform((value) => value?.trim().toLowerCase() ?? "")
  .refine((value) => !value || isValidEmail(value), "Informe um e-mail válido.")
  .transform((value) => (value.length > 0 ? value : null));

const optionalCpf = z
  .string()
  .optional()
  .transform((value) => onlyDigits(value ?? ""))
  .refine((value) => !value || isValidCpf(value), "Informe um CPF válido.")
  .transform((value) => (value.length > 0 ? value : null));

export const patientSchema = z.object({
  id: z.string().uuid().optional(),
  full_name: z.string().trim().min(3, "Informe o nome completo."),
  social_name: optionalText,
  cpf: optionalCpf,
  rg: optionalText,
  issuing_authority: optionalText,
  birth_date: optionalDate,
  sex_at_birth: optionalText,
  gender_identity: optionalText,
  marital_status: optionalText,
  occupation: optionalText,
  nationality: optionalText,
  phone: optionalPhone,
  email: optionalEmail,
  preferred_contact: z.enum(["whatsapp", "phone", "email"]),
  postal_code: z
    .string()
    .optional()
    .transform((value) => onlyDigits(value ?? ""))
    .refine((value) => !value || value.length === 8, "CEP inválido.")
    .transform((value) => (value.length > 0 ? value : null)),
  address_line: optionalText,
  address_number: optionalText,
  address_complement: optionalText,
  neighborhood: optionalText,
  city: optionalText,
  state: z
    .string()
    .optional()
    .transform((value) => value?.trim().toUpperCase() ?? "")
    .refine((value) => !value || /^[A-Z]{2}$/.test(value), "Informe a UF com 2 letras.")
    .transform((value) => (value.length > 0 ? value : null)),
  emergency_contact_name: optionalText,
  emergency_contact_relationship: optionalText,
  emergency_contact_phone: optionalPhone,
  health_plan_name: optionalText,
  health_plan_number: optionalText,
  health_plan_valid_until: optionalDate,
  clinical_alerts: optionalText,
  notes: optionalText,
  consent_lgpd: z.enum(["on", "off"]).optional().transform((value) => value === "on"),
  active: z.enum(["on", "off"]).optional().transform((value) => value !== "off"),
});

export const serviceSchema = z.object({
  id: z.string().uuid().optional(),
  code: optionalText,
  name: z.string().trim().min(2, "Informe o nome do serviço."),
  category: optionalText,
  description: optionalText,
  duration_minutes: z.coerce.number().int().min(5).max(720),
  price: z
    .string()
    .trim()
    .refine(
      (value) => /^(\d{1,3}(\.\d{3})*|\d+)(,\d{1,2})?$/.test(value) || /^\d+(\.\d{1,2})?$/.test(value),
      "Informe um valor válido.",
    ),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Selecione uma cor válida."),
  requires_authorization: z.enum(["on", "off"]).optional().transform((value) => value === "on"),
  active: z.enum(["on", "off"]).optional().transform((value) => value !== "off"),
});

export const roomSchema = z.object({
  id: z.string().uuid().optional(),
  code: optionalText,
  name: z.string().trim().min(2, "Informe o nome do consultório."),
  room_type: z.string().trim().min(2, "Informe o tipo do espaço."),
  floor: optionalText,
  capacity: z.coerce.number().int().min(1).max(100),
  resources: z
    .string()
    .optional()
    .transform((value) =>
      (value ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 30),
    ),
  notes: optionalText,
  active: z.enum(["on", "off"]).optional().transform((value) => value !== "off"),
});

export const availabilitySchema = z
  .object({
    id: z.string().uuid().optional(),
    professional_member_id: z.string().uuid("Selecione o profissional."),
    room_id: z.string().optional().transform((value) => (value && value !== "none" ? value : null)),
    service_id: z.string().optional().transform((value) => (value && value !== "none" ? value : null)),
    recurrence_type: z.enum(["weekly", "specific_date"]),
    weekday: z.coerce.number().int().min(0).max(6).optional(),
    specific_date: optionalDate,
    valid_from: optionalDate,
    valid_until: optionalDate,
    start_time: z.string().regex(/^\d{2}:\d{2}$/, "Informe o horário inicial."),
    end_time: z.string().regex(/^\d{2}:\d{2}$/, "Informe o horário final."),
    slot_minutes: z.coerce.number().int().min(5).max(720),
    notes: optionalText,
    active: z.enum(["on", "off"]).optional().transform((value) => value !== "off"),
  })
  .superRefine((data, context) => {
    if (data.end_time <= data.start_time) {
      context.addIssue({ code: "custom", message: "O horário final deve ser posterior ao inicial." });
    }

    if (data.recurrence_type === "weekly" && data.weekday === undefined) {
      context.addIssue({ code: "custom", message: "Selecione o dia da semana." });
    }

    if (data.recurrence_type === "specific_date" && !data.specific_date) {
      context.addIssue({ code: "custom", message: "Informe a data específica." });
    }

    if (data.valid_from && data.valid_until && data.valid_until < data.valid_from) {
      context.addIssue({ code: "custom", message: "A validade final deve ser posterior à inicial." });
    }
  });

export const registrationPreferencesSchema = z.object({
  require_patient_cpf: z.enum(["on", "off"]).optional().transform((value) => value === "on"),
  require_patient_email: z.enum(["on", "off"]).optional().transform((value) => value === "on"),
  default_service_duration: z.coerce.number().int().min(5).max(720),
  patient_display_name: z.enum(["full_name", "social_name"]),
  show_inactive_records: z.enum(["on", "off"]).optional().transform((value) => value === "on"),
});

export const professionalProfileSchema = z.object({
  professional_member_id: z.string().uuid("Selecione o profissional."),
  specialty: optionalText,
  council_type: optionalText,
  council_number: optionalText,
  council_state: z
    .string()
    .optional()
    .transform((value) => value?.trim().toUpperCase() ?? "")
    .refine((value) => !value || /^[A-Z]{2}$/.test(value), "Informe a UF do conselho com 2 letras.")
    .transform((value) => (value.length > 0 ? value : null)),
  rqe: optionalText,
  bio: optionalText,
  appointment_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Selecione uma cor válida."),
  default_service_id: z
    .string()
    .optional()
    .transform((value) => (value && value !== "none" ? value : null)),
  default_room_id: z
    .string()
    .optional()
    .transform((value) => (value && value !== "none" ? value : null)),
  telemedicine_enabled: z.enum(["on", "off"]).optional().transform((value) => value === "on"),
  accepts_new_patients: z.enum(["on", "off"]).optional().transform((value) => value !== "off"),
  active: z.enum(["on", "off"]).optional().transform((value) => value !== "off"),
});

export const registrationDeleteSchema = z.object({
  id: z.string().uuid(),
  resource: z.enum(["patient", "service", "room", "availability"]),
});
