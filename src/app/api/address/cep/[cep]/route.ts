import { NextResponse } from "next/server";

type ViaCepResponse = {
  bairro?: string;
  cep?: string;
  complemento?: string;
  erro?: boolean;
  localidade?: string;
  logradouro?: string;
  uf?: string;
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ cep: string }> },
) {
  const { cep } = await context.params;
  const normalizedCep = cep.replace(/\D/g, "");

  if (!/^\d{8}$/.test(normalizedCep)) {
    return NextResponse.json({ error: "Informe um CEP válido com 8 dígitos." }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4_000);

  try {
    const response = await fetch(`https://viacep.com.br/ws/${normalizedCep}/json/`, {
      cache: "force-cache",
      next: { revalidate: 86_400 },
      signal: controller.signal,
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "O serviço de CEP não respondeu. Preencha o endereço manualmente." },
        { status: 502 },
      );
    }

    const address = (await response.json()) as ViaCepResponse;

    if (address.erro) {
      return NextResponse.json({ error: "CEP não encontrado." }, { status: 404 });
    }

    return NextResponse.json({
      postalCode: address.cep ?? normalizedCep,
      addressLine: address.logradouro ?? "",
      complement: address.complemento ?? "",
      neighborhood: address.bairro ?? "",
      city: address.localidade ?? "",
      state: address.uf ?? "",
    });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível consultar o CEP. Preencha o endereço manualmente." },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
