"use client";

import { useActionState, useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import { ROLE_LABELS } from "@/config/permissions";
import { inviteMemberAction } from "@/features/members/actions";
import { formatCpf, formatPhone, normalizeEmail } from "@/lib/formatters";
import { useToast } from "@/components/ui/toast";
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
  const [cpf, setCpf] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    if (state.success) {
      toast({ title: state.success, description: "O vínculo foi registrado na clínica ativa." });
    }

    if (state.error) {
      toast({ title: "Cadastro não concluído", description: state.error, variant: "destructive" });
    }
  }, [state.error, state.success, toast]);

  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="full_name">Nome completo</Label>
        <Input id="full_name" name="full_name" disabled={disabled} required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(normalizeEmail(event.target.value))}
          disabled={disabled}
          required
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="cpf">CPF</Label>
          <Input
            id="cpf"
            name="cpf"
            inputMode="numeric"
            value={cpf}
            onChange={(event) => setCpf(formatCpf(event.target.value))}
            disabled={disabled}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="phone">Telefone</Label>
          <Input
            id="phone"
            name="phone"
            inputMode="tel"
            value={phone}
            onChange={(event) => setPhone(formatPhone(event.target.value))}
            disabled={disabled}
          />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="role">Perfil na clínica</Label>
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
        <UserPlus />
        {pending ? "Cadastrando..." : "Cadastrar usuário"}
      </Button>
    </form>
  );
}
