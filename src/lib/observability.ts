type ServerErrorContext = Record<string, string | number | boolean | null | undefined>;

export function reportServerError(scope: string, error: unknown, context: ServerErrorContext = {}) {
  const candidate = error as { message?: string; code?: string; status?: number } | null;
  console.error(
    JSON.stringify({
      event: "server_error",
      scope,
      message: candidate?.message ?? "Unknown server error",
      code: candidate?.code ?? null,
      status: candidate?.status ?? null,
      context,
      occurredAt: new Date().toISOString(),
    }),
  );
}
