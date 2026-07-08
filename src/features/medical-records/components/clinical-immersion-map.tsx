"use client";

import { useMemo, useState } from "react";
import { Activity, CircleDot, ScanFace, Smile, UserRound, Waves } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getClinicalSpecialty } from "@/config/clinical-specialties";
import type { ClinicalFormResponseMetadata } from "@/features/medical-records/clinical-form-schema";

type MapEntry = {
  label: string;
  value?: string;
  status?: string;
  intensity?: number;
  notes?: string;
};

type VisualMapValue = {
  preset: string;
  variant?: string;
  selectedRegion?: string;
  entries: Record<string, MapEntry>;
  updatedAt?: string;
};

type Region = {
  id: string;
  label: string;
  x: number;
  y: number;
  unit?: string;
  group?: string;
};

const bodyCompositionRegions: Region[] = [
  { id: "neck", label: "Pescoco", x: 50, y: 17, unit: "cm" },
  { id: "chest", label: "Torax", x: 50, y: 29, unit: "cm" },
  { id: "right_arm", label: "Braco direito", x: 28, y: 35, unit: "cm" },
  { id: "left_arm", label: "Braco esquerdo", x: 72, y: 35, unit: "cm" },
  { id: "waist", label: "Cintura", x: 50, y: 45, unit: "cm" },
  { id: "hip", label: "Quadril", x: 50, y: 56, unit: "cm" },
  { id: "right_thigh", label: "Coxa direita", x: 42, y: 72, unit: "cm" },
  { id: "left_thigh", label: "Coxa esquerda", x: 58, y: 72, unit: "cm" },
];

const painRegions: Region[] = [
  { id: "cervical", label: "Cervical", x: 50, y: 18 },
  { id: "right_shoulder", label: "Ombro direito", x: 36, y: 27 },
  { id: "left_shoulder", label: "Ombro esquerdo", x: 64, y: 27 },
  { id: "thoracic", label: "Toracica", x: 50, y: 36 },
  { id: "lumbar", label: "Lombar", x: 50, y: 49 },
  { id: "right_knee", label: "Joelho direito", x: 43, y: 77 },
  { id: "left_knee", label: "Joelho esquerdo", x: 57, y: 77 },
];

const faceRegions: Region[] = [
  { id: "forehead", label: "Testa", x: 50, y: 24 },
  { id: "right_periocular", label: "Periocular direita", x: 40, y: 38 },
  { id: "left_periocular", label: "Periocular esquerda", x: 60, y: 38 },
  { id: "right_cheek", label: "Malar direito", x: 38, y: 52 },
  { id: "left_cheek", label: "Malar esquerdo", x: 62, y: 52 },
  { id: "lips", label: "Labios", x: 50, y: 66 },
  { id: "chin", label: "Mento", x: 50, y: 77 },
];

const voiceRegions: Region[] = [
  { id: "breathing", label: "Respiracao", x: 50, y: 28 },
  { id: "phonation", label: "Fonacao", x: 50, y: 42 },
  { id: "resonance", label: "Ressonancia", x: 50, y: 56 },
  { id: "articulation", label: "Articulacao", x: 50, y: 70 },
];

const odontogramTeeth = [
  "18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28",
  "48", "47", "46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36", "37", "38",
];

function asVisualMapValue(value: ClinicalFormResponseMetadata | undefined, preset: string): VisualMapValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { preset, variant: "default", entries: {} };
  }

  const raw = value as Record<string, unknown>;
  const entriesSource = raw.entries && typeof raw.entries === "object" && !Array.isArray(raw.entries)
    ? (raw.entries as Record<string, unknown>)
    : {};
  const entries = Object.fromEntries(
    Object.entries(entriesSource).flatMap(([key, entry]) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
      const source = entry as Record<string, unknown>;
      return [[
        key,
        {
          label: typeof source.label === "string" ? source.label : key,
          value: typeof source.value === "string" ? source.value : undefined,
          status: typeof source.status === "string" ? source.status : undefined,
          intensity: typeof source.intensity === "number" ? source.intensity : undefined,
          notes: typeof source.notes === "string" ? source.notes : undefined,
        },
      ]];
    }),
  );

  return {
    preset: typeof raw.preset === "string" ? raw.preset : preset,
    variant: typeof raw.variant === "string" ? raw.variant : "default",
    selectedRegion: typeof raw.selectedRegion === "string" ? raw.selectedRegion : undefined,
    entries,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : undefined,
  };
}

function serializeVisualMapValue(value: VisualMapValue): ClinicalFormResponseMetadata {
  return {
    preset: value.preset,
    variant: value.variant ?? "default",
    selectedRegion: value.selectedRegion ?? null,
    updatedAt: value.updatedAt ?? new Date().toISOString(),
    entries: Object.fromEntries(
      Object.entries(value.entries).map(([key, entry]) => [
        key,
        {
          label: entry.label,
          value: entry.value ?? null,
          status: entry.status ?? null,
          intensity: entry.intensity ?? null,
          notes: entry.notes ?? null,
        },
      ]),
    ),
  };
}

function iconForPreset(preset: string) {
  if (preset === "odontogram") return Smile;
  if (preset === "face_skin") return ScanFace;
  if (preset === "voice_pathway") return Waves;
  if (preset === "body_pain") return Activity;
  return UserRound;
}

function BodySilhouette({
  regions,
  value,
  onSelect,
}: {
  regions: Region[];
  value: VisualMapValue;
  onSelect: (id: string) => void;
}) {
  return (
    <svg viewBox="0 0 100 100" className="h-[300px] w-full max-w-[280px]" role="img" aria-label="Mapa corporal">
      <defs>
        <linearGradient id="clinical-body-fill" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="rgba(15,118,110,0.13)" />
          <stop offset="100%" stopColor="rgba(15,118,110,0.03)" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="10" r="7" fill="url(#clinical-body-fill)" stroke="currentColor" strokeWidth="0.7" />
      <path d="M38 21 C33 35 34 47 40 58 L42 91 M62 21 C67 35 66 47 60 58 L58 91 M39 24 C45 29 55 29 61 24 M42 58 C47 61 53 61 58 58" fill="none" stroke="currentColor" strokeWidth="1.1" opacity="0.45" />
      <path d="M38 22 C25 28 22 44 25 58 M62 22 C75 28 78 44 75 58" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.35" />
      {regions.map((region) => {
        const active = value.selectedRegion === region.id;
        const filled = Boolean(value.entries[region.id]?.value || value.entries[region.id]?.status);
        return (
          <g
            key={region.id}
            role="button"
            tabIndex={0}
            className="cursor-pointer outline-none"
            onClick={() => onSelect(region.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") onSelect(region.id);
            }}
            aria-label={region.label}
          >
            <circle cx={region.x} cy={region.y} r={active ? 4.3 : 3.4} fill={active ? "var(--primary)" : filled ? "#14b8a6" : "white"} stroke="var(--primary)" strokeWidth="0.9" />
            <circle cx={region.x} cy={region.y} r={active ? 8 : 6} fill="transparent" />
          </g>
        );
      })}
    </svg>
  );
}

function Odontogram({
  value,
  onSelect,
}: {
  value: VisualMapValue;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-8 gap-1 rounded-md border bg-background p-2">
      {odontogramTeeth.map((tooth, index) => {
        const active = value.selectedRegion === tooth;
        const status = value.entries[tooth]?.status;
        return (
          <button
            key={`${tooth}-${index}`}
            type="button"
            onClick={() => onSelect(tooth)}
            className={`h-8 rounded border text-[11px] font-medium tabular-nums transition-colors duration-150 ${
              active ? "border-primary bg-primary text-primary-foreground" : status ? "border-primary/40 bg-primary/10" : "bg-card hover:bg-muted"
            }`}
          >
            {tooth}
          </button>
        );
      })}
    </div>
  );
}

function selectedRegionsForPreset(preset: string) {
  if (preset === "body_composition") return bodyCompositionRegions;
  if (preset === "body_pain") return painRegions;
  if (preset === "face_skin") return faceRegions;
  if (preset === "voice_pathway") return voiceRegions;
  return [];
}

export function ClinicalImmersionMap({
  specialtySlug,
  value,
  disabled,
  onChange,
}: {
  specialtySlug: string;
  value: ClinicalFormResponseMetadata | undefined;
  disabled: boolean;
  onChange: (value: ClinicalFormResponseMetadata) => void;
}) {
  const specialty = getClinicalSpecialty(specialtySlug);
  const preset = specialty.visualMap;
  const Icon = iconForPreset(preset ?? "");
  const mapValue = useMemo(() => asVisualMapValue(value, preset ?? "none"), [preset, value]);
  const regions = selectedRegionsForPreset(preset ?? "");
  const [draftNote, setDraftNote] = useState("");

  if (!preset) return null;
  const currentPreset = preset;

  const selectedRegion =
    preset === "odontogram"
      ? mapValue.selectedRegion ?? odontogramTeeth[0]
      : mapValue.selectedRegion ?? regions[0]?.id;
  const regionLabel =
    preset === "odontogram"
      ? `Dente ${selectedRegion}`
      : regions.find((region) => region.id === selectedRegion)?.label ?? "Area";
  const currentEntry = selectedRegion ? mapValue.entries[selectedRegion] : undefined;

  function updateMap(next: Partial<VisualMapValue>) {
    onChange(serializeVisualMapValue({
      ...mapValue,
      ...next,
      preset: currentPreset,
      updatedAt: new Date().toISOString(),
    }));
  }

  function updateEntry(regionId: string, entry: Partial<MapEntry>) {
    const label = preset === "odontogram"
      ? `Dente ${regionId}`
      : regions.find((region) => region.id === regionId)?.label ?? regionId;
    updateMap({
      selectedRegion: regionId,
      entries: {
        ...mapValue.entries,
        [regionId]: {
          ...mapValue.entries[regionId],
          ...entry,
          label,
        },
      },
    });
  }

  return (
    <section className="rounded-md border bg-card">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
            <Icon className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">Mapa clinico visual</p>
              <Badge className="bg-primary/10 text-primary">{specialty.shortLabel}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Registre marcacoes estruturadas por area. Os dados ficam salvos no prontuario e auditados junto ao atendimento.
            </p>
          </div>
        </div>
        {preset === "body_composition" ? (
          <div className="flex rounded-md border bg-muted/20 p-0.5 text-xs">
            {["Feminino", "Masculino"].map((variant) => (
              <button
                key={variant}
                type="button"
                disabled={disabled}
                onClick={() => updateMap({ variant })}
                className={`h-7 rounded px-2.5 ${mapValue.variant === variant ? "bg-card shadow-sm" : "text-muted-foreground"}`}
              >
                {variant}
              </button>
            ))}
          </div>
        ) : null}
      </header>

      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(260px,340px)_1fr]">
        <div className="rounded-md border bg-muted/10 p-3">
          {preset === "odontogram" ? (
            <Odontogram value={mapValue} onSelect={(id) => updateMap({ selectedRegion: id })} />
          ) : (
            <div className="grid place-items-center text-primary">
              <BodySilhouette regions={regions} value={mapValue} onSelect={(id) => updateMap({ selectedRegion: id })} />
            </div>
          )}
        </div>

        <div className="grid content-start gap-3">
          <div className="rounded-md border bg-background p-3">
            <div className="flex items-center gap-2">
              <CircleDot className="size-4 text-primary" />
              <p className="text-sm font-semibold">{regionLabel}</p>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-xs font-medium">
                {preset === "body_composition" ? "Medida" : preset === "body_pain" ? "Intensidade" : "Status"}
                {preset === "body_pain" ? (
                  <input
                    type="range"
                    min={0}
                    max={10}
                    value={currentEntry?.intensity ?? 0}
                    disabled={disabled || !selectedRegion}
                    onChange={(event) => selectedRegion && updateEntry(selectedRegion, { intensity: Number(event.target.value), status: `${event.target.value}/10` })}
                  />
                ) : (
                  <input
                    value={currentEntry?.value ?? ""}
                    disabled={disabled || !selectedRegion}
                    placeholder={preset === "body_composition" ? "Ex.: 82 cm" : "Ex.: observado / tratado"}
                    onChange={(event) => selectedRegion && updateEntry(selectedRegion, { value: event.target.value })}
                    className="h-9 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                )}
              </label>
              <label className="grid gap-1.5 text-xs font-medium">
                Classificacao
                <select
                  value={currentEntry?.status ?? ""}
                  disabled={disabled || !selectedRegion}
                  onChange={(event) => selectedRegion && updateEntry(selectedRegion, { status: event.target.value })}
                  className="h-9 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Sem status</option>
                  <option value="normal">Normal</option>
                  <option value="attention">Acompanhar</option>
                  <option value="altered">Alterado</option>
                  <option value="treated">Tratado</option>
                  <option value="critical">Prioritario</option>
                </select>
              </label>
            </div>
            <label className="mt-3 grid gap-1.5 text-xs font-medium">
              Observacao da area
              <textarea
                value={currentEntry?.notes ?? draftNote}
                disabled={disabled || !selectedRegion}
                onChange={(event) => {
                  setDraftNote(event.target.value);
                  if (selectedRegion) updateEntry(selectedRegion, { notes: event.target.value });
                }}
                className="min-h-20 rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Descreva achados, conduta, produto aplicado, dor, medida ou orientacao especifica."
              />
            </label>
          </div>

          <div className="rounded-md border bg-background">
            <div className="border-b px-3 py-2 text-xs font-semibold">Marcacoes deste atendimento</div>
            <div className="max-h-36 overflow-y-auto p-2">
              {Object.keys(mapValue.entries).length ? (
                Object.entries(mapValue.entries).map(([id, entry]) => (
                  <div key={id} className="mb-1 rounded-md bg-muted/35 px-2.5 py-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{entry.label}</span>
                      <span className="text-muted-foreground">{entry.status || entry.value || entry.intensity}</span>
                    </div>
                    {entry.notes ? <p className="selectable mt-1 text-muted-foreground">{entry.notes}</p> : null}
                  </div>
                ))
              ) : (
                <p className="px-2 py-4 text-center text-xs text-muted-foreground">Nenhuma marcacao registrada.</p>
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || !selectedRegion}
              onClick={() => selectedRegion && updateEntry(selectedRegion, { label: regionLabel })}
            >
              Confirmar area
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
