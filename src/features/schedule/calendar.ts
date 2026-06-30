export type CalendarViewMode = "day" | "week" | "month" | "list" | "clinic";

function parseInputDate(value: string) {
  return new Date(`${value}T12:00:00`);
}

export function toInputDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(value: Date, amount: number) {
  const result = new Date(value);
  result.setDate(result.getDate() + amount);
  return result;
}

export function getCalendarRange(date: string, view: CalendarViewMode) {
  const anchor = parseInputDate(date);

  if (view === "day" || view === "clinic") {
    return {
      startDate: date,
      endDate: date,
      days: [date],
    };
  }

  if (view === "week" || view === "list") {
    const day = anchor.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const start = addDays(anchor, mondayOffset);
    const days = Array.from({ length: 7 }, (_, index) => toInputDate(addDays(start, index)));

    return {
      startDate: days[0],
      endDate: days[6],
      days,
    };
  }

  const firstDay = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12);
  const firstWeekday = firstDay.getDay();
  const mondayOffset = firstWeekday === 0 ? -6 : 1 - firstWeekday;
  const start = addDays(firstDay, mondayOffset);
  const days = Array.from({ length: 42 }, (_, index) => toInputDate(addDays(start, index)));

  return {
    startDate: days[0],
    endDate: days[41],
    days,
  };
}

export function getAdjacentCalendarDate(date: string, view: CalendarViewMode, direction: -1 | 1) {
  const anchor = parseInputDate(date);

  if (view === "day" || view === "clinic") {
    return toInputDate(addDays(anchor, direction));
  }

  if (view === "week" || view === "list") {
    return toInputDate(addDays(anchor, direction * 7));
  }

  anchor.setMonth(anchor.getMonth() + direction);
  return toInputDate(anchor);
}

export function getCalendarTitle(date: string, view: CalendarViewMode) {
  const anchor = parseInputDate(date);

  if (view === "day" || view === "clinic") {
    return anchor.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  }

  if (view === "week" || view === "list") {
    const range = getCalendarRange(date, view);
    const start = parseInputDate(range.startDate);
    const end = parseInputDate(range.endDate);
    return `${start.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
    })} a ${end.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })}`;
  }

  return anchor.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
}
