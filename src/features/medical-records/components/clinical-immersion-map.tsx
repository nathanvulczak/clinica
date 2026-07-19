"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  surface?: string;
  product?: string;
  lot?: string;
  quantity?: string;
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
          surface: typeof source.surface === "string" ? source.surface : undefined,
          product: typeof source.product === "string" ? source.product : undefined,
          lot: typeof source.lot === "string" ? source.lot : undefined,
          quantity: typeof source.quantity === "string" ? source.quantity : undefined,
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
          surface: entry.surface ?? null,
          product: entry.product ?? null,
          lot: entry.lot ?? null,
          quantity: entry.quantity ?? null,
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

function selectedRegionsForPreset(preset: string) {
  if (preset === "body_composition") return bodyCompositionRegions;
  if (preset === "body_pain") return painRegions;
  if (preset === "face_skin") return faceRegions;
  if (preset === "voice_pathway") return voiceRegions;
  return [];
}

function CanvasClinicalMap({
  preset,
  regions,
  value,
  onSelect,
}: {
  preset: string;
  regions: Region[];
  value: VisualMapValue;
  onSelect: (id: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const selectedId = value.selectedRegion ?? "";

  const points = useMemo(() => {
    if (preset !== "odontogram") return regions.map((region) => ({ ...region, width: 0, height: 0 }));
    return odontogramTeeth.map((tooth, index) => ({
      id: tooth,
      label: `Dente ${tooth}`,
      x: 25 + (index % 16) * 20.5,
      y: index < 16 ? 34 : 106,
      width: 17,
      height: 42,
    }));
  }, [preset, regions]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = 360;
    const height = preset === "odontogram" ? 150 : 280;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.aspectRatio = `${width} / ${height}`;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = "rgba(15, 118, 110, 0.035)";
    context.fillRect(0, 0, width, height);
    context.lineWidth = 1.4;
    context.strokeStyle = "rgba(15, 118, 110, 0.55)";
    context.fillStyle = "rgba(15, 118, 110, 0.08)";

    if (preset === "odontogram") {
      context.font = "600 11px system-ui";
      context.textAlign = "center";
      points.forEach((point) => {
        const selected = point.id === selectedId;
        const filled = Boolean(value.entries[point.id]?.status || value.entries[point.id]?.value);
        context.fillStyle = selected ? "#0f766e" : filled ? "rgba(20, 184, 166, 0.24)" : "#ffffff";
        context.strokeStyle = selected ? "#0f766e" : "rgba(15, 118, 110, 0.55)";
        context.beginPath();
        context.roundRect(point.x - point.width / 2, point.y - point.height / 2, point.width, point.height, 5);
        context.fill();
        context.stroke();
        context.fillStyle = selected ? "#ffffff" : "#334155";
        context.fillText(point.id, point.x, point.y + 4);
      });
      context.textAlign = "left";
      context.fillStyle = "#64706f";
      context.font = "11px system-ui";
      context.fillText("Arcada superior", 12, 16);
      context.fillText("Arcada inferior", 12, 142);
      return;
    }

    const centerX = width / 2;
    if (preset === "face_skin") {
      context.beginPath();
      context.ellipse(centerX, 140, 74, 112, 0, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.beginPath();
      context.moveTo(centerX - 28, 136);
      context.quadraticCurveTo(centerX, 146, centerX + 28, 136);
      context.moveTo(centerX - 22, 174);
      context.quadraticCurveTo(centerX, 188, centerX + 22, 174);
      context.stroke();
    } else if (preset === "voice_pathway") {
      context.beginPath();
      context.moveTo(centerX - 24, 46);
      context.lineTo(centerX - 38, 238);
      context.moveTo(centerX + 24, 46);
      context.lineTo(centerX + 38, 238);
      context.moveTo(centerX - 38, 238);
      context.quadraticCurveTo(centerX, 258, centerX + 38, 238);
      context.stroke();
      context.beginPath();
      context.arc(centerX, 35, 22, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    } else {
      context.beginPath();
      context.arc(centerX, 30, 23, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.beginPath();
      context.moveTo(centerX - 29, 58);
      context.bezierCurveTo(centerX - 52, 84, centerX - 54, 138, centerX - 29, 163);
      context.lineTo(centerX - 22, 258);
      context.moveTo(centerX + 29, 58);
      context.bezierCurveTo(centerX + 52, 84, centerX + 54, 138, centerX + 29, 163);
      context.lineTo(centerX + 22, 258);
      context.moveTo(centerX - 29, 163);
      context.quadraticCurveTo(centerX, 176, centerX + 29, 163);
      context.stroke();
    }

    points.forEach((point) => {
      const selected = point.id === selectedId;
      const filled = Boolean(value.entries[point.id]?.status || value.entries[point.id]?.value || value.entries[point.id]?.intensity);
      context.beginPath();
      context.arc((point.x / 100) * width, (point.y / 100) * height, selected ? 8 : 6, 0, Math.PI * 2);
      context.fillStyle = selected ? "#0f766e" : filled ? "#14b8a6" : "#ffffff";
      context.fill();
      context.strokeStyle = "#0f766e";
      context.stroke();
    });
  }, [points, preset, selectedId, value.entries]);

  function selectFromPointer(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 360;
    const height = preset === "odontogram" ? 150 : 280;
    const y = ((event.clientY - rect.top) / rect.height) * height;
    const selected = points.find((point) => {
      if (preset === "odontogram") {
        return Math.abs(x - point.x) <= point.width && Math.abs(y - point.y) <= point.height;
      }
      return Math.hypot(x - (point.x / 100) * 360, y - (point.y / 100) * height) <= 18;
    });
    if (selected) onSelect(selected.id);
  }

  return (
    <div className="grid gap-2">
      <canvas
        ref={canvasRef}
        className="h-auto w-full rounded-md border bg-background outline-none focus-visible:ring-2 focus-visible:ring-ring"
        role="img"
        tabIndex={0}
        aria-label="Mapa clínico visual interativo"
        onPointerDown={selectFromPointer}
      />
      <details className="rounded-md border bg-background px-2.5 py-2">
        <summary className="cursor-pointer text-[11px] font-semibold text-muted-foreground">Abrir lista acessível de regiões</summary>
        <div className="mt-2 grid max-h-36 gap-1 overflow-y-auto sm:grid-cols-2">
          {points.map((point) => (
            <button
              key={point.id}
              type="button"
              onClick={() => onSelect(point.id)}
              className={`rounded px-2 py-1.5 text-left text-[11px] ${selectedId === point.id ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted"}`}
            >
              {point.label}
            </button>
          ))}
        </div>
      </details>
    </div>
  );
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
  const isAesthetics = specialtySlug === "aesthetics";
  const isDermatology = specialtySlug === "dermatology";
  const mapTitle = preset === "odontogram"
    ? "Odontograma clínico"
    : isAesthetics
      ? "Mapa de planejamento estético"
      : isDermatology
        ? "Mapa dermatológico"
        : "Mapa clínico visual";
  const statusOptions = preset === "odontogram"
    ? [["healthy", "Hígido"], ["caries", "Cárie"], ["restored", "Restaurado"], ["treatment", "Em tratamento"], ["missing", "Ausente"]]
    : isAesthetics
      ? [["planned", "Planejada"], ["performed", "Realizada"], ["follow_up", "Acompanhar"], ["adverse_event", "Intercorrência"]]
      : [["normal", "Normal"], ["attention", "Acompanhar"], ["altered", "Alterado"], ["treated", "Tratado"], ["critical", "Prioritário"]];

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
              <p className="text-sm font-semibold">{mapTitle}</p>
              <Badge className="bg-primary/10 text-primary">{specialty.shortLabel}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Registre marcações estruturadas por área. Os dados ficam salvos no prontuário e auditados junto ao atendimento.
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
          <CanvasClinicalMap
            preset={preset}
            regions={regions}
            value={mapValue}
            onSelect={(id) => updateMap({ selectedRegion: id })}
          />
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
                  <option value="">Sem classificação</option>
                  {statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
            </div>
            {preset === "odontogram" ? (
              <label className="mt-3 grid gap-1.5 text-xs font-medium">
                Superfície
                <select
                  value={currentEntry?.surface ?? ""}
                  disabled={disabled || !selectedRegion}
                  onChange={(event) => selectedRegion && updateEntry(selectedRegion, { surface: event.target.value })}
                  className="h-9 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Não especificada</option>
                  <option value="oclusal">Oclusal</option>
                  <option value="mesial">Mesial</option>
                  <option value="distal">Distal</option>
                  <option value="vestibular">Vestibular</option>
                  <option value="lingual">Lingual/palatina</option>
                </select>
              </label>
            ) : null}
            {isAesthetics ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className="grid gap-1.5 text-xs font-medium sm:col-span-1">
                  Produto
                  <input value={currentEntry?.product ?? ""} disabled={disabled || !selectedRegion} onChange={(event) => selectedRegion && updateEntry(selectedRegion, { product: event.target.value })} className="h-9 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="Nome comercial" />
                </label>
                <label className="grid gap-1.5 text-xs font-medium">
                  Lote
                  <input value={currentEntry?.lot ?? ""} disabled={disabled || !selectedRegion} onChange={(event) => selectedRegion && updateEntry(selectedRegion, { lot: event.target.value })} className="h-9 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="Lote" />
                </label>
                <label className="grid gap-1.5 text-xs font-medium">
                  Quantidade
                  <input value={currentEntry?.quantity ?? ""} disabled={disabled || !selectedRegion} onChange={(event) => selectedRegion && updateEntry(selectedRegion, { quantity: event.target.value })} className="h-9 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="Ex.: 0,5 mL" />
                </label>
              </div>
            ) : null}
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
                    {entry.surface ? <p className="mt-1 text-muted-foreground">Superfície: {entry.surface}</p> : null}
                    {entry.product || entry.lot || entry.quantity ? <p className="mt-1 text-muted-foreground">{[entry.product, entry.lot && `Lote ${entry.lot}`, entry.quantity].filter(Boolean).join(" · ")}</p> : null}
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
