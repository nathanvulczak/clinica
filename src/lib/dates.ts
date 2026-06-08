const APP_TIME_ZONE = "America/Sao_Paulo";
const APP_TIME_ZONE_OFFSET = "-03:00";

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

export function formatTimeBr(value: string | Date | null | undefined) {
  if (!value) {
    return "--:--";
  }

  return new Date(value).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: APP_TIME_ZONE,
  });
}

export function getTodayInputDate() {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: APP_TIME_ZONE,
    year: "numeric",
  }).format(new Date());
}

export function localDateTimeToIso(date: string, time: string) {
  return new Date(`${date}T${time}:00${APP_TIME_ZONE_OFFSET}`).toISOString();
}

export function addMinutesIso(value: string, minutes: number) {
  return new Date(new Date(value).getTime() + minutes * 60_000).toISOString();
}
