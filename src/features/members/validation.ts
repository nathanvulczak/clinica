import { z } from "zod";
import { onlyDigits } from "@/lib/utils";
import { isValidCpf, isValidEmail } from "@/lib/validators";

export const memberRoleSchema = z.enum([
  "clinic_owner",
  "clinic_admin",
  "doctor",
  "nurse",
  "receptionist",
  "financial",
  "professional",
]);

export const inviteMemberSchema = z.object({
  full_name: z.string().min(3, "Informe o nome completo."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .refine(isValidEmail, "Informe um e-mail válido."),
  cpf: z
    .string()
    .transform(onlyDigits)
    .refine(isValidCpf, "Informe um CPF válido."),
  phone: z
    .string()
    .transform(onlyDigits)
    .refine((value) => value.length === 0 || (value.length >= 10 && value.length <= 11), "Telefone inválido."),
  role: memberRoleSchema,
});

export const updateMemberRoleSchema = z.object({
  member_id: z.string().uuid(),
  role: memberRoleSchema,
});

export const memberStatusSchema = z.enum(["active", "invited", "suspended", "removed"]);

export const updateMemberStatusSchema = z.object({
  member_id: z.string().uuid(),
  status: memberStatusSchema,
});

export const updateMemberPermissionSchema = z.object({
  member_id: z.string().uuid(),
  module: z.enum([
    "clinics",
    "members",
    "permissions",
    "billing",
    "audit",
    "patients",
    "medical_records",
    "schedule",
    "financial",
    "reports",
  ]),
  action: z.enum(["view", "create", "edit", "delete", "approve", "access_medical_record", "manage", "export"]),
  enabled: z.enum(["true", "false"]).transform((value) => value === "true"),
});

export const removeMemberSchema = z.object({
  member_id: z.string().uuid(),
});
