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
  | "nursing"
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
  preconsultation_mode: PreconsultationMode;
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
  preconsultation_mode: Exclude<PreconsultationMode, "inherit">;
  allow_preconsultation_override: boolean;
  require_follow_up_decision: boolean;
};

export type PreconsultationMode = "inherit" | "required" | "optional" | "disabled";

export type ClinicalEncounterStatus =
  | "awaiting_preconsultation_decision"
  | "waiting_triage"
  | "triage_in_progress"
  | "ready_for_consultation"
  | "consultation_in_progress"
  | "consultation_completed"
  | "billing_pending"
  | "billed"
  | "cancelled";

export type ClinicalEncounterSummary = {
  id: string;
  clinic_id: string;
  appointment_id: string;
  patient_id: string;
  professional_member_id: string;
  status: ClinicalEncounterStatus;
  preconsultation_mode: PreconsultationMode;
  preconsultation_required: boolean | null;
  routing_source: "clinic" | "service" | "manual";
  routing_reason: string | null;
  arrived_at: string | null;
  triage_started_at: string | null;
  triage_completed_at: string | null;
  consultation_started_at: string | null;
  consultation_completed_at: string | null;
  follow_up_status: "pending" | "not_required" | "to_schedule" | "scheduled" | "declined";
  appointment: {
    id: string;
    starts_at: string;
    ends_at: string;
    appointment_type: string;
    channel: string;
    status: AppointmentStatus;
  } | null;
  patient: Pick<
    PatientSummary,
    "id" | "full_name" | "social_name" | "birth_date" | "phone" | "clinical_alerts"
  > | null;
  professional: {
    id: string;
    role: AppRole;
    profile: {
      full_name: string;
      avatar_url?: string | null;
    } | null;
  } | null;
  service: Pick<ClinicService, "id" | "name" | "color"> | null;
  room: Pick<ClinicRoom, "id" | "name"> | null;
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
    avatar_url?: string | null;
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
  checked_in_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
  no_show_at?: string | null;
  last_notification_at?: string | null;
  rescheduled_from_id?: string | null;
  cancellation_reason: string | null;
  notes: string | null;
  patient: PatientSummary | null;
  professional: ScheduleProfessional | null;
  service: ClinicService | null;
  room: ClinicRoom | null;
};

export type AppointmentWorkflowEvent = {
  id: string;
  clinic_id: string;
  appointment_id: string;
  from_status: AppointmentStatus | null;
  to_status: AppointmentStatus;
  notes: string | null;
  created_at: string;
};

export type FinancialAccountType = "cash" | "checking" | "savings" | "digital_wallet" | "card_processor";
export type FinancialMethodType =
  | "cash"
  | "pix"
  | "debit_card"
  | "credit_card"
  | "bank_transfer"
  | "boleto"
  | "health_plan"
  | "other";
export type FinancialEntryType = "receivable" | "payable";
export type FinancialEntryStatus = "pending" | "partial" | "paid" | "overdue" | "cancelled" | "refunded";
export type FinancialPaymentStatus = "confirmed" | "reversed";
export type FinancialReconciliationStatus = "closed" | "reversed";
export type FinancialCommissionStatus = "pending" | "approved" | "paid" | "cancelled";
export type FinancialBankImportStatus = "processing" | "ready" | "completed" | "cancelled" | "failed";
export type FinancialBankImportItemStatus = "pending" | "matched" | "ignored" | "reconciled";
export type FinancialDocumentType = "nfe" | "nfse" | "receipt" | "contract" | "other";
export type FinancialEntryEventType =
  | "created"
  | "updated"
  | "settled"
  | "payment_reversed"
  | "cancelled"
  | "receipt_issued"
  | "reconciliation_closed"
  | "reconciliation_reopened"
  | "ledger_posted";

export type FinancialPreferences = {
  clinic_id: string;
  allow_reception_checkout: boolean;
  allow_professional_checkout: boolean;
  require_payment_method_on_checkout: boolean;
  default_receivable_due_days: number;
  default_late_fee_cents: number;
  default_monthly_interest_bps: number;
  receipt_footer: string | null;
};

export type FinancialAccount = {
  id: string;
  clinic_id: string;
  name: string;
  account_type: FinancialAccountType;
  bank_name: string | null;
  agency: string | null;
  account_number: string | null;
  pix_key: string | null;
  opening_balance_cents: number;
  current_balance_cents: number;
  active: boolean;
  notes: string | null;
};

export type FinancialPaymentMethod = {
  id: string;
  clinic_id: string;
  name: string;
  method_type: FinancialMethodType;
  requires_card_machine: boolean;
  settlement_days: number;
  active: boolean;
};

export type FinancialCardMachine = {
  id: string;
  clinic_id: string;
  account_id: string | null;
  name: string;
  provider: string | null;
  debit_fee_bps: number;
  credit_fee_bps: number;
  credit_installment_fee_bps: number;
  debit_settlement_days: number;
  credit_settlement_days: number;
  active: boolean;
  notes: string | null;
};

export type FinancialCategory = {
  id: string;
  clinic_id: string;
  name: string;
  direction: "income" | "expense";
  parent_id: string | null;
  active: boolean;
};

export type FinancialCostCenter = {
  id: string;
  clinic_id: string;
  name: string;
  code: string | null;
  active: boolean;
  notes: string | null;
};

export type FinancialHealthPlan = {
  id: string;
  clinic_id: string;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  active: boolean;
  notes: string | null;
};

export type FinancialVendor = {
  id: string;
  clinic_id: string;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  vendor_type: "supplier" | "laboratory" | "professional" | "tax" | "other";
  active: boolean;
  notes: string | null;
};

export type FinancialEntry = {
  id: string;
  clinic_id: string;
  entry_type: FinancialEntryType;
  origin: "appointment" | "manual" | "subscription" | "commission" | "adjustment";
  status: FinancialEntryStatus;
  patient_id: string | null;
  vendor_id: string | null;
  appointment_id: string | null;
  encounter_id: string | null;
  medical_record_id: string | null;
  professional_member_id: string | null;
  category_id: string | null;
  cost_center_id: string | null;
  health_plan_id: string | null;
  document_type: FinancialDocumentType;
  description: string;
  document_number: string | null;
  issue_date: string;
  due_date: string;
  competence_date: string;
  amount_cents: number;
  discount_cents: number;
  freight_cents: number;
  addition_cents: number;
  paid_cents: number;
  notes: string | null;
  cancelled_reason: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  created_at: string;
  updated_at: string;
};

export type FinancialEntryItem = {
  id: string;
  clinic_id: string;
  entry_id: string;
  description: string;
  quantity: number;
  unit_amount_cents: number;
  total_amount_cents: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type FinancialRecurringEntry = {
  id: string;
  clinic_id: string;
  vendor_id: string | null;
  category_id: string | null;
  cost_center_id: string | null;
  description: string;
  amount_cents: number;
  frequency: "weekly" | "monthly" | "quarterly" | "yearly";
  next_due_date: string;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type FinancialPayment = {
  id: string;
  clinic_id: string;
  entry_id: string;
  account_id: string | null;
  payment_method_id: string | null;
  card_machine_id: string | null;
  direction: "in" | "out";
  status: FinancialPaymentStatus;
  amount_cents: number;
  fee_cents: number;
  net_amount_cents: number;
  paid_at: string;
  expected_settlement_date: string | null;
  reconciliation_id: string | null;
  reconciled_at: string | null;
  reconciled_by: string | null;
  notes: string | null;
  reversal_reason: string | null;
  reversed_at: string | null;
  created_at: string;
};

export type FinancialReconciliation = {
  id: string;
  clinic_id: string;
  account_id: string;
  status: FinancialReconciliationStatus;
  period_start: string;
  period_end: string;
  opening_balance_cents: number;
  total_in_cents: number;
  total_out_cents: number;
  expected_balance_cents: number;
  bank_balance_cents: number;
  difference_cents: number;
  closed_at: string;
  closed_by: string | null;
  reversed_at: string | null;
  reversed_by: string | null;
  reversal_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type FinancialCommissionRule = {
  id: string;
  clinic_id: string;
  professional_member_id: string | null;
  service_id: string | null;
  rule_type: "percent" | "fixed";
  value_bps: number;
  value_cents: number;
  calculate_on: "billed" | "received";
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type FinancialCommission = {
  id: string;
  clinic_id: string;
  professional_member_id: string;
  entry_id: string | null;
  payment_id: string | null;
  rule_id: string | null;
  status: FinancialCommissionStatus;
  base_amount_cents: number;
  commission_cents: number;
  approved_at: string | null;
  approved_by: string | null;
  paid_at: string | null;
  settled_by: string | null;
  settlement_entry_id: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type FinancialBankImport = {
  id: string;
  clinic_id: string;
  account_id: string;
  file_name: string;
  file_type: "ofx" | "csv";
  status: FinancialBankImportStatus;
  period_start: string | null;
  period_end: string | null;
  total_rows: number;
  matched_rows: number;
  completed_at: string | null;
  completed_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type FinancialBankImportItem = {
  id: string;
  clinic_id: string;
  import_id: string;
  transaction_date: string;
  description: string;
  document_number: string | null;
  direction: "in" | "out";
  amount_cents: number;
  external_id: string | null;
  status: FinancialBankImportItemStatus;
  matched_payment_id: string | null;
  match_confidence: number | null;
  raw_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type FinancialReceipt = {
  id: string;
  clinic_id: string;
  entry_id: string;
  patient_id: string | null;
  receipt_type: "payment" | "payment_acknowledgement";
  title: string;
  content: string;
  issued_at: string;
  printed_at: string | null;
  exported_at: string | null;
};

export type FinancialEntryEvent = {
  id: string;
  clinic_id: string;
  entry_id: string;
  event_type: FinancialEntryEventType;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
};

export type FinancialLedgerEntry = {
  id: string;
  clinic_id: string;
  account_id: string | null;
  entry_id: string | null;
  payment_id: string | null;
  reconciliation_id: string | null;
  direction: "in" | "out";
  amount_cents: number;
  fee_cents: number;
  net_amount_cents: number;
  occurred_at: string;
  description: string;
  source_type: "payment" | "reversal" | "adjustment" | "reconciliation";
  source_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  created_by: string | null;
};
