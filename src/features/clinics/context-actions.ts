"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ACTIVE_CLINIC_COOKIE } from "@/features/clinics/context";
import { listUserClinics } from "@/repositories/clinics";

export async function setActiveClinicAction(formData: FormData) {
  const clinicId = String(formData.get("clinic_id") ?? "");
  const clinics = await listUserClinics();

  if (!clinics.some((clinic) => clinic.id === clinicId)) {
    return;
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_CLINIC_COOKIE, clinicId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/", "layout");
}
