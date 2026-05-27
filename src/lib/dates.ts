const APP_TIME_ZONE = "America/Sao_Paulo";

export function formatDateTimeBr(value: string | Date | null | undefined) {
  if (!value) {
    return "não informado";
  }

  return new Date(value).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: APP_TIME_ZONE,
  });
}

export function formatDateBr(value: string | Date | null | undefined) {
  if (!value) {
    return "não informado";
  }

  return new Date(value).toLocaleDateString("pt-BR", {
    timeZone: APP_TIME_ZONE,
  });
}
