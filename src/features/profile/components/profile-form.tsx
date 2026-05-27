"use client";

import { useActionState } from "react";
import { Save } from "lucide-react";
import { updateProfileAction } from "@/features/profile/actions";
import type { UserProfile } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ProfileForm({ profile }: { profile: UserProfile }) {
  const [state, formAction, pending] = useActionState(updateProfileAction, {});

  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="full_name">Nome completo</Label>
        <Input id="full_name" name="full_name" defaultValue={profile.full_name} required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" value={profile.email ?? ""} disabled />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="phone">Telefone</Label>
        <Input id="phone" name="phone" defaultValue={profile.phone ?? ""} inputMode="tel" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="avatar_url">Imagem de perfil</Label>
        <Input id="avatar_url" name="avatar_url" defaultValue={profile.avatar_url ?? ""} placeholder="https://..." />
        <p className="text-xs text-muted-foreground">
          Nesta fase usamos URL pública. O upload via Supabase Storage entra junto do módulo de documentos/anexos.
        </p>
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-primary">{state.success}</p> : null}
      <Button disabled={pending}>
        <Save />
        {pending ? "Salvando..." : "Salvar perfil"}
      </Button>
    </form>
  );
}
