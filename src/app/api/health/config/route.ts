import { NextResponse } from "next/server";

const checks = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_SINGULAR",
  "STRIPE_PRICE_DUO",
  "STRIPE_PRICE_MASTER",
] as const;

function statusFor(value?: string) {
  if (!value) return "missing";
  if (/temporario|placeholder|missing|xxx|sua_|seu_/i.test(value)) return "placeholder";
  return "present";
}

export function GET() {
  return NextResponse.json({
    ok: checks.every((key) => statusFor(process.env[key]) === "present"),
    env: Object.fromEntries(checks.map((key) => [key, statusFor(process.env[key])])),
  });
}
