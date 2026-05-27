import { z } from "zod";
import { isValidEmail } from "@/lib/validators";

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
  email: z
    .string()
    .trim()
    .toLowerCase()
    .refine(isValidEmail, "Informe um e-mail válido."),
  role: memberRoleSchema,
});

export const updateMemberRoleSchema = z.object({
  member_id: z.string().uuid(),
  role: memberRoleSchema,
});

export const removeMemberSchema = z.object({
  member_id: z.string().uuid(),
});
