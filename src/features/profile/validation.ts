import { z } from "zod";
import { formatPhone } from "@/lib/formatters";
import { onlyDigits } from "@/lib/utils";

export const updateProfileSchema = z.object({
  full_name: z.string().min(3, "Informe seu nome completo."),
  phone: z
    .string()
    .transform((value) => onlyDigits(formatPhone(value)))
    .refine((value) => value.length === 0 || (value.length >= 10 && value.length <= 11), "Telefone inválido."),
});

export const updatePasswordSchema = z.object({
  password: z.string().min(8, "A nova senha deve ter pelo menos 8 caracteres."),
});
