"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type SearchableSelectOption = {
  value: string;
  label: string;
  description?: string;
  searchText?: string;
  disabled?: boolean;
};

type SearchableSelectProps = {
  name?: string;
  label?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  required?: boolean;
  disabled?: boolean;
  limit?: number;
  className?: string;
  buttonClassName?: string;
};

export function SearchableSelect({
  name,
  label,
  value,
  defaultValue = "",
  onValueChange,
  options,
  placeholder = "Selecione",
  searchPlaceholder = "Pesquisar...",
  emptyLabel = "Nenhum resultado encontrado.",
  required,
  disabled,
  limit = 4,
  className,
  buttonClassName,
}: SearchableSelectProps) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [internalValue, setInternalValue] = useState(defaultValue);
  const selectedValue = value ?? internalValue;
  const selected = options.find((option) => option.value === selectedValue);

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    const source = normalized
      ? options.filter((option) => {
          const target = [
            option.label,
            option.description,
            option.searchText,
            option.value,
          ]
            .filter(Boolean)
            .join(" ")
            .toLocaleLowerCase("pt-BR");
          return target.includes(normalized);
        })
      : options;
    return source.slice(0, limit);
  }, [limit, options, query]);

  function choose(nextValue: string) {
    if (value === undefined) setInternalValue(nextValue);
    onValueChange?.(nextValue);
    setOpen(false);
    setQuery("");
  }

  const control = (
    <div ref={rootRef} className={cn("relative", className)}>
      {name ? <input type="hidden" name={name} value={selectedValue} required={required} /> : null}
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-background px-3 text-left text-sm outline-none transition hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60",
          !selected && "text-muted-foreground",
          buttonClassName,
        )}
      >
        <span className="min-w-0 truncate">{selected?.label ?? placeholder}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </button>

      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-md border bg-popover shadow-lg">
          <div className="flex h-9 items-center gap-2 border-b px-2">
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
              className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {query ? (
              <button type="button" className="grid size-6 place-items-center rounded hover:bg-muted" onClick={() => setQuery("")}>
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>
          <div role="listbox" aria-labelledby={id} className="max-h-64 overflow-auto p-1">
            {filtered.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                disabled={option.disabled}
                aria-selected={option.value === selectedValue}
                onClick={() => choose(option.value)}
                className="flex w-full items-start gap-2 rounded px-2 py-2 text-left text-sm outline-none hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Check className={cn("mt-0.5 size-3.5 shrink-0", option.value === selectedValue ? "opacity-100" : "opacity-0")} />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{option.label}</span>
                  {option.description ? <span className="block truncate text-xs text-muted-foreground">{option.description}</span> : null}
                </span>
              </button>
            ))}
            {!filtered.length ? <div className="px-3 py-6 text-center text-xs text-muted-foreground">{emptyLabel}</div> : null}
          </div>
          {options.length > limit ? (
            <div className="border-t px-3 py-2 text-[11px] text-muted-foreground">
              Exibindo até {limit} resultados. Digite para refinar a busca.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  if (!label) return control;

  return (
    <div className="grid gap-1.5 text-xs font-medium">
      <span>{label}</span>
      {control}
    </div>
  );
}
