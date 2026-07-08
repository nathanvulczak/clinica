export type DocumentPageSettings = {
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  fontFamily: "serif" | "sans";
  fontSize: number;
  lineHeight: number;
  orientation: "portrait" | "landscape";
};

export const DEFAULT_DOCUMENT_PAGE_SETTINGS: DocumentPageSettings = {
  marginTop: 18,
  marginRight: 18,
  marginBottom: 18,
  marginLeft: 18,
  fontFamily: "serif",
  fontSize: 11.5,
  lineHeight: 1.6,
  orientation: "portrait",
};

export function normalizeDocumentText(value: string) {
  return value.replace(/\\r\\n|\\n|\\r/g, "\n");
}

function numberInRange(value: unknown, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

export function normalizeDocumentPageSettings(value: unknown): DocumentPageSettings {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    marginTop: numberInRange(source.marginTop, 18, 8, 35),
    marginRight: numberInRange(source.marginRight, 18, 8, 35),
    marginBottom: numberInRange(source.marginBottom, 18, 8, 35),
    marginLeft: numberInRange(source.marginLeft, 18, 8, 35),
    fontFamily: source.fontFamily === "sans" ? "sans" : "serif",
    fontSize: numberInRange(source.fontSize, 11.5, 9, 14),
    lineHeight: numberInRange(source.lineHeight, 1.6, 1.2, 2),
    orientation: source.orientation === "landscape" ? "landscape" : "portrait",
  };
}

export function parseDocumentPageSettings(value: string | null | undefined) {
  if (!value) return DEFAULT_DOCUMENT_PAGE_SETTINGS;
  try {
    return normalizeDocumentPageSettings(JSON.parse(value));
  } catch {
    return DEFAULT_DOCUMENT_PAGE_SETTINGS;
  }
}
