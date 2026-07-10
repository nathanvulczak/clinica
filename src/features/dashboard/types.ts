export const DASHBOARD_WIDGET_IDS = [
  "agenda",
  "reception",
  "care",
  "cash",
  "nextAppointments",
  "careFlow",
  "administration",
  "roomBoard",
] as const;

export type DashboardWidgetId = (typeof DASHBOARD_WIDGET_IDS)[number];

export type DashboardLayoutItem = {
  i: DashboardWidgetId;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
};

export type DashboardPreferences = {
  visibleWidgets: DashboardWidgetId[];
  layout: DashboardLayoutItem[];
};

export type DashboardRoom = {
  id: string;
  name: string;
  code: string | null;
  roomType: string;
  status: "available" | "scheduled" | "occupied";
  nextAppointmentAt: string | null;
  todayAppointments: number;
  professional: {
    name: string;
    avatarUrl: string | null;
    specialty: string | null;
  } | null;
};

export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayoutItem[] = [
  { i: "agenda", x: 0, y: 0, w: 3, h: 3, minW: 3, minH: 3 },
  { i: "reception", x: 3, y: 0, w: 3, h: 3, minW: 3, minH: 3 },
  { i: "care", x: 6, y: 0, w: 3, h: 3, minW: 3, minH: 3 },
  { i: "cash", x: 9, y: 0, w: 3, h: 3, minW: 3, minH: 3 },
  { i: "nextAppointments", x: 0, y: 3, w: 8, h: 8, minW: 5, minH: 6 },
  { i: "careFlow", x: 8, y: 3, w: 4, h: 8, minW: 3, minH: 6 },
  { i: "administration", x: 0, y: 11, w: 12, h: 5, minW: 5, minH: 5 },
  { i: "roomBoard", x: 0, y: 16, w: 12, h: 9, minW: 5, minH: 7 },
];

export const DEFAULT_DASHBOARD_WIDGETS = DASHBOARD_WIDGET_IDS.slice();
