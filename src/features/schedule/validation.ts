import { z } from "zod";
import {
  APPOINTMENT_STATUSES,
  SCHEDULE_BLOCK_TYPES,
} from "@/config/schedule";
import { onlyDigits } from "@/lib/utils";
import { isValidCpf, isValidEmail } from "@/lib/validators";

const dateInputSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida.");
const timeInputSchema = z.string().regex(/^\d{2}:\d{2}$/, "Informe um horário válido.");

const optionalText = z
  .string()
  .optional()
  .transform((value) => value?.trim() ?? "")
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

const optionalPhone = z
  .string()
  .optional()
  .transform((value) => onlyDigits(value ?? ""))
  .refine((value) => !value || (value.length >= 10 && value.length <= 11), "Telefone inválido.")
  .transform((value) => (value.length > 0 ? value : null));

export const createAppointmentSchema = z
  .object({
    patient_id: z.string().optional().transform((value) => (value && value !== "new" ? value : null)),
    patient_full_name: z.string().optional().transform((value) => value?.trim() ?? ""),
    patient_cpf: optionalCpf,
    patient_phone: optionalPhone,
    patient_email: optionalEmail,
    professional_member_id: z.string().uuid("Selecione o profissional."),
    service_id: z.string().optional().transform((value) => (value && value !== "none" ? value : null)),
    room_id: z.string().optional().transform((value) => (value && value !== "none" ? value : null)),
    appointment_date: dateInputSchema,
    start_time: timeInputSchema,
    duration_minutes: z.coerce.number().int().min(5).max(720),
    appointment_type: z.string().trim().min(2, "Informe o tipo de compromisso."),
    channel: z.string().trim().min(2, "Informe o canal do atendimento."),
    notes: optionalText,
  })
  .superRefine((data, context) => {
    if (!data.patient_id && data.patient_full_name.length < 3) {
      context.addIssue({
        code: "custom",
        message: "Selecione um paciente ou informe o nome completo.",
        path: ["patient_full_name"],
      });
    }
  });

export const updateAppointmentStatusSchema = z.object({
  appointment_id: z.string().uuid(),
  status: z.enum(APPOINTMENT_STATUSES),
  notes: optionalText,
});

export const createScheduleBlockSchema = z
  .object({
    professional_member_id: z.string().uuid("Selecione o profissional."),
    block_date: dateInputSchema,
    start_time: timeInputSchema,
    end_time: timeInputSchema,
    block_type: z.enum(SCHEDULE_BLOCK_TYPES),
    reason: optionalText,
  })
  .refine((data) => data.end_time > data.start_time, {
    message: "O fim do bloqueio deve ser depois do início.",
    path: ["end_time"],
  });

export const upsertProfessionalScheduleSettingsSchema = z
  .object({
    professional_member_id: z.string().uuid("Selecione o profissional."),
    slot_minutes: z.coerce.number().min(10).max(120),
    buffer_minutes: z.coerce.number().min(0).max(120),
    default_location: optionalText,
    online_booking_enabled: z.enum(["on", "off"]).optional().transform((value) => value === "on"),
    workday_start: timeInputSchema,
    workday_end: timeInputSchema,
    weekdays: z
      .array(z.enum(["1", "2", "3", "4", "5", "6", "0"]))
      .min(1, "Selecione pelo menos um dia de atendimento."),
  })
  .refine((data) => data.workday_end > data.workday_start, {
    message: "O fim do expediente deve ser depois do início.",
    path: ["workday_end"],
  });
