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
