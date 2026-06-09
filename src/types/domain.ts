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
    avatar_url?: string | null;
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
  social_name: string | null;
  cpf: string | null;
  rg: string | null;
  issuing_authority: string | null;
  birth_date: string | null;
  sex_at_birth: string | null;
  gender_identity: string | null;
  marital_status: string | null;
  occupation: string | null;
  nationality: string | null;
  phone: string | null;
  email: string | null;
  preferred_contact: string | null;
  postal_code: string | null;
  address_line: string | null;
  address_number: string | null;
  address_complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  emergency_contact_name: string | null;
  emergency_contact_relationship: string | null;
  emergency_contact_phone: string | null;
  health_plan_name: string | null;
  health_plan_number: string | null;
  health_plan_valid_until: string | null;
  clinical_alerts: string | null;
  consent_lgpd_at: string | null;
  active: boolean;
  notes: string | null;
};

export type ClinicService = {
  id: string;
  clinic_id: string;
  code: string | null;
  name: string;
  category: string | null;
  description: string | null;
  duration_minutes: number;
  price_cents: number;
  color: string;
  requires_authorization: boolean;
  active: boolean;
};

export type ClinicRoom = {
  id: string;
  clinic_id: string;
  code: string | null;
  name: string;
  room_type: string;
  floor: string | null;
  capacity: number;
  resources: string[];
  notes: string | null;
  active: boolean;
};

export type ProfessionalAvailabilityRule = {
  id: string;
  clinic_id: string;
  professional_member_id: string;
  room_id: string | null;
  service_id: string | null;
  recurrence_type: "weekly" | "specific_date";
  weekday: number | null;
  specific_date: string | null;
  valid_from: string | null;
  valid_until: string | null;
  start_time: string;
  end_time: string;
  slot_minutes: number;
  active: boolean;
  notes: string | null;
};

export type RegistrationPreferences = {
  id?: string;
  clinic_id: string;
  require_patient_cpf: boolean;
  require_patient_email: boolean;
  default_service_duration: number;
  default_export_format: "csv";
  patient_display_name: "full_name" | "social_name";
  show_inactive_records: boolean;
};

export type ScheduleProfessional = {
  id: string;
  clinic_id: string;
  user_id: string;
  role: AppRole;
  status?: ClinicMember["status"];
  profile: {
    full_name: string;
    email: string | null;
    phone?: string | null;
    cpf?: string | null;
  } | null;
};

export type ProfessionalOperationalProfile = {
  id?: string;
  clinic_id: string;
  professional_member_id: string;
  specialty: string | null;
  council_type: string | null;
  council_number: string | null;
  council_state: string | null;
  rqe: string | null;
  bio: string | null;
  appointment_color: string;
  default_service_id: string | null;
  default_room_id: string | null;
  telemedicine_enabled: boolean;
  accepts_new_patients: boolean;
  active: boolean;
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
  service_id: string | null;
  room_id: string | null;
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
  service: ClinicService | null;
  room: ClinicRoom | null;
};
