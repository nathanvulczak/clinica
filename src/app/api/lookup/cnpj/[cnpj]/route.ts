import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { onlyDigits } from "@/lib/utils";
import { isValidCnpj } from "@/lib/validators";

type BrasilApiCompany = {
  cnpj?: string;
  razao_social?: string;
  nome_fantasia?: string | null;
  descricao_situacao_cadastral?: string | null;
  email?: string | null;
  ddd_telefone_1?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  municipio?: string | null;
  uf?: string | null;
};

export async function GET(_request: Request, context: { params: Promise<{ cnpj: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Faça login para consultar um CNPJ." }, { status: 401 });

  const cnpj = onlyDigits((await context.params).cnpj);
  if (!isValidCnpj(cnpj)) return NextResponse.json({ error: "Informe um CNPJ válido." }, { status: 400 });

  try {
    const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(8000),
    });
    if (response.status === 404) return NextResponse.json({ error: "CNPJ não encontrado." }, { status: 404 });
    if (!response.ok) return NextResponse.json({ error: "A consulta empresarial está temporariamente indisponível." }, { status: 502 });

    const company = (await response.json()) as BrasilApiCompany;
    return NextResponse.json({
      cnpj,
      legalName: company.razao_social ?? "",
      tradeName: company.nome_fantasia ?? "",
      registrationStatus: company.descricao_situacao_cadastral ?? "",
      email: company.email?.trim().toLowerCase() ?? "",
      phone: onlyDigits(company.ddd_telefone_1 ?? ""),
      postalCode: onlyDigits(company.cep ?? ""),
      addressLine: company.logradouro ?? "",
      addressNumber: company.numero ?? "",
      addressComplement: company.complemento ?? "",
      neighborhood: company.bairro ?? "",
      city: company.municipio ?? "",
      state: company.uf ?? "",
      source: "BrasilAPI",
    });
  } catch {
    return NextResponse.json({ error: "A consulta demorou além do esperado. Tente novamente." }, { status: 504 });
  }
}
