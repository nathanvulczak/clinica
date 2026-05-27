import { cookies } from "next/headers";
import { listUserClinics } from "@/repositories/clinics";

export const ACTIVE_CLINIC_COOKIE = "clinic_active_id";

export async function getActiveClinicContext() {
  const [cookieStore, clinics] = await Promise.all([cookies(), listUserClinics()]);
  const cookieClinicId = cookieStore.get(ACTIVE_CLINIC_COOKIE)?.value;
  const activeClinic = clinics.find((clinic) => clinic.id === cookieClinicId) ?? clinics[0] ?? null;

  return {
    clinics,
    activeClinic,
  };
}
