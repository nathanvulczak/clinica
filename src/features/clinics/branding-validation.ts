import { z } from "zod";

export const clinicBrandingSchema = z.object({
  primary_color: z.string().regex(/^#[0-9a-f]{6}$/i, "Informe uma cor hexadecimal válida."),
  document_header: z.string().trim().max(160, "O cabeçalho deve ter até 160 caracteres.").optional(),
  document_footer: z.string().trim().max(400, "O rodapé deve ter até 400 caracteres.").optional(),
  show_legal_name: z.boolean(),
  show_document: z.boolean(),
  show_contact: z.boolean(),
});
