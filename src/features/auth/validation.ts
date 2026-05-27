import { z } from "zod";
import { onlyDigits } from "@/lib/utils";
import { isValidCpf, isValidEmail } from "@/lib/validators";
import type { PlanSlug } from "@/types/domain";

export const signInSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .refine(isValidEmail, "Informe um e-mail válido."),
  password: z.string().min(8, "A senha deve ter pelo menos 8 caracteres."),
});

export const signUpSchema = z.object({
  fullName: z.string().min(3, "Informe o nome completo."),
  cpf: z
    .string()
    .transform(onlyDigits)
    .refine(isValidCpf, "Informe um CPF válido."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .refine(isValidEmail, "Informe um e-mail válido."),
  phone: z
    .string()
    .transform(onlyDigits)
    .refine((value) => value.length >= 10 && value.length <= 11, "Telefone inválido."),
  password: z.string().min(8, "A senha deve ter pelo menos 8 caracteres."),
  plan: z.enum(["singular", "duo", "master"]),
});

export type SignUpInput = z.input<typeof signUpSchema> & {
  plan: PlanSlug;
};
