"use client";

import { useActionState } from "react";
import { Send } from "lucide-react";
import { ROLE_LABELS } from "@/config/permissions";
import { inviteMemberAction } from "@/features/members/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

const inviteRoles = [
  "clinic_admin",
  "doctor",
  "nurse",
  "receptionist",
  "financial",
  "professional",
] as const;

export function InviteMemberForm({ disabled }: { disabled?: boolean }) {
  const [state, formAction, pending] = useActionState(inviteMemberAction, {});

  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="email">E-mail do usuário</Label>
        <Input id="email" name="email" type="email" disabled={disabled} required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="role">Papel na clínica</Label>
        <Select id="role" name="role" defaultValue="professional" disabled={disabled}>
          {inviteRoles.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </Select>
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-primary">{state.success}</p> : null}
      <Button disabled={pending || disabled}>
        <Send />
        {pending ? "Processando..." : "Convidar usuário"}
      </Button>
    </form>
  );
}
