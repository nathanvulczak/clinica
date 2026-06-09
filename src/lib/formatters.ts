import { onlyDigits } from "@/lib/utils";

export function formatCpf(value: string) {
  const digits = onlyDigits(value).slice(0, 11);

  return digits
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
}

export function formatCnpj(value: string) {
  const digits = onlyDigits(value).slice(0, 14);

  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, "$1.$2.$3/$4-$5");
}

export function formatCpfOrCnpj(value: string) {
  return onlyDigits(value).length > 11 ? formatCnpj(value) : formatCpf(value);
}

export function formatPhone(value: string) {
  const digits = onlyDigits(value).slice(0, 11);

  if (digits.length <= 10) {
    return digits
      .replace(/^(\d{2})(\d)/, "($1) $2")
      .replace(/^(\(\d{2}\) \d{4})(\d)/, "$1-$2");
  }

  return digits
    .replace(/^(\d{2})(\d)/, "($1) $2")
    .replace(/^(\(\d{2}\) \d{5})(\d)/, "$1-$2");
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function formatPostalCode(value: string) {
  return onlyDigits(value)
    .slice(0, 8)
    .replace(/^(\d{5})(\d)/, "$1-$2");
}

export function formatCurrencyInput(value: string) {
  const digits = onlyDigits(value);

  if (!digits) {
    return "";
  }

  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(digits) / 100);
}
