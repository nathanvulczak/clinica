export type PlanSlug = "singular" | "duo" | "master";

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "inactive";

export type AppRole =
  | "platform_admin"
  | "clinic_owner"
  | "clinic_admin"
  | "doctor"
  | "nurse"
  | "receptionist"
  | "financial"
  | "professional";

export type PermissionModule =
  | "clinics"
  | "members"
  | "permissions"
  | "billing"
  | "audit"
  | "patients"
  | "medical_records"
  | "schedule"
  | "financial"
  | "reports";

export type PermissionAction =
  | "view"
  | "create"
  | "edit"
  | "delete"
  | "approve"
  | "access_medical_record"
  | "manage"
  | "export";

export type Clinic = {
  id: string;
  legal_name: string;
  trade_name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  created_at: string;
  created_by?: string | null;
};

export type SubscriptionSummary = {
  id?: string;
  plan_slug: PlanSlug;
  status: SubscriptionStatus;
  current_period_end: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id?: string | null;
  cancel_at_period_end?: boolean;
};

export type ClinicMember = {
  id: string;
  clinic_id: string;
  user_id: string;
  role: AppRole;
  status: "active" | "invited" | "suspended" | "removed";
  joined_at: string | null;
  created_at: string;
  profile: {
    full_name: string;
    email: string | null;
    phone: string | null;
  } | null;
};

export type MemberPermissionOverride = {
  id: string;
  clinic_id: string;
  member_id: string;
  module: PermissionModule;
  action: PermissionAction;
  allowed: boolean;
  reason: string | null;
};

export type InvoiceSummary = {
  id: string;
  stripe_invoice_id: string;
  status: string | null;
  amount_due: number;
  amount_paid: number;
  currency: string;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
  paid_at: string | null;
  created_at: string;
};

export type UserProfile = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  avatar_url?: string | null;
  platform_role: AppRole;
  app_preferences?: {
    hide_welcome?: boolean;
  };
};

export type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "checked_in"
  | "in_triage"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_show"
  | "rescheduled"
  | "billing_pending"
  | "billed";

export type ScheduleBlockType = "unavailable" | "lunch" | "vacation" | "administrative" | "other";

export type PatientSummary = {
  id: string;
  clinic_id: string;
  full_name: string;
  cpf: string | null;
  birth_date: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
};

export type ScheduleProfessional = {
  id: string;
  clinic_id: string;
  user_id: string;
  role: AppRole;
  profile: {
    full_name: string;
    email: string | null;
  } | null;
};

export type ScheduleSettings = {
  id: string;
  clinic_id: string;
  professional_member_id: string;
  slot_minutes: number;
  buffer_minutes: number;
  timezone: string;
  default_location: string | null;
  online_booking_enabled: boolean;
  working_hours: Record<string, unknown>;
};

export type ScheduleBlock = {
  id: string;
  clinic_id: string;
  professional_member_id: string;
  starts_at: string;
  ends_at: string;
  block_type: ScheduleBlockType;
  reason: string | null;
};

export type AppointmentSummary = {
  id: string;
  clinic_id: string;
  patient_id: string;
  professional_member_id: string;
  scheduled_by: string | null;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  appointment_type: string;
  channel: string;
  confirmation_token: string;
  confirmation_sent_at: string | null;
  confirmed_at: string | null;
  cancellation_reason: string | null;
  notes: string | null;
  patient: PatientSummary | null;
  professional: ScheduleProfessional | null;
};
