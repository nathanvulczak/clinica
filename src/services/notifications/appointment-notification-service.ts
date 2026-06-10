type AppointmentEmailInput = {
  to: string;
  patientName: string;
  clinicName: string;
  professionalName: string;
  startsAtLabel: string;
  confirmationUrl: string;
  idempotencyKey: string;
};

export type AppointmentEmailResult =
  | { sent: true; providerMessageId: string | null }
  | { sent: false; reason: "not_configured" | "provider_error"; error: string };

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function sendAppointmentConfirmationEmail({
  to,
  patientName,
  clinicName,
  professionalName,
  startsAtLabel,
  confirmationUrl,
  idempotencyKey,
}: AppointmentEmailInput): Promise<AppointmentEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) {
    return {
      sent: false,
      reason: "not_configured",
      error: "Configure RESEND_API_KEY e RESEND_FROM_EMAIL para habilitar o envio.",
    };
  }

  let response: Response;

  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
        "User-Agent": "CliniCore/1.0",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `Confirme sua consulta em ${clinicName}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#17211f">
            <h1 style="font-size:24px">Confirmação de consulta</h1>
            <p>Olá, ${escapeHtml(patientName)}.</p>
            <p>
              Sua consulta com <strong>${escapeHtml(professionalName)}</strong>,
              em <strong>${escapeHtml(startsAtLabel)}</strong>, foi registrada por
              ${escapeHtml(clinicName)}.
            </p>
            <p style="margin:28px 0">
              <a href="${escapeHtml(confirmationUrl)}"
                style="background:#0f766e;color:white;padding:12px 18px;border-radius:6px;text-decoration:none">
                Confirmar consulta
              </a>
            </p>
            <p style="font-size:13px;color:#66736f">
              Caso não reconheça este agendamento, entre em contato diretamente com a clínica.
            </p>
          </div>
        `,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return {
      sent: false,
      reason: "provider_error",
      error: "Não foi possível conectar ao provedor de e-mail.",
    };
  }

  const payload = (await response.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
    error?: { message?: string };
  };

  if (!response.ok) {
    return {
      sent: false,
      reason: "provider_error",
      error: payload.message ?? payload.error?.message ?? "Falha no provedor de e-mail.",
    };
  }

  return { sent: true, providerMessageId: payload.id ?? null };
}
