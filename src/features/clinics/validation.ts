import { z } from "zod";
import { onlyDigits } from "@/lib/utils";
import { isValidCpfOrCnpj, isValidEmail } from "@/lib/validators";

export const clinicSchema = z.object({
  legal_name: z.string().min(3, "Informe a razão social ou nome responsável."),
  trade_name: z.string().min(2, "Informe o nome da clínica."),
  document: z
    .string()
    .optional()
    .transform((value) => (value ? onlyDigits(value) : null))
    .refine((value) => !value || isValidCpfOrCnpj(value), "Informe um CPF ou CNPJ válido."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .refine((value) => !value || isValidEmail(value), "E-mail inválido."),
  phone: z.string().optional().transform((value) => (value ? onlyDigits(value) : null)),
  city: z.string().optional(),
  state: z.string().max(2, "Use UF com 2 letras.").optional(),
});
