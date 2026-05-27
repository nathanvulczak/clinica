"use client";

import { useActionState, useEffect, useState } from "react";
import Image from "next/image";
import { Save, Upload } from "lucide-react";
import { updateProfileAction, updateWelcomePreferenceAction } from "@/features/profile/actions";
import type { UserProfile } from "@/types/domain";
import { formatPhone } from "@/lib/formatters";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ProfileForm({ profile }: { profile: UserProfile }) {
  const [state, formAction, pending] = useActionState(updateProfileAction, {});
  const [phone, setPhone] = useState(profile.phone ? formatPhone(profile.phone) : "");
  const [fileName, setFileName] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    if (state.success) {
      toast({ title: state.success, description: "Os dados foram atualizados com segurança." });
    }

    if (state.error) {
      toast({ title: "Não foi possível salvar", description: state.error, variant: "destructive" });
    }
  }, [state.error, state.success, toast]);

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
        <Input
          id="phone"
          name="phone"
          value={phone}
          onChange={(event) => setPhone(formatPhone(event.target.value))}
          inputMode="tel"
        />
      </div>
      <div className="grid gap-3">
        <Label htmlFor="avatar_file">Imagem de perfil</Label>
        <div className="flex items-center gap-3">
          <div className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted text-sm font-semibold text-muted-foreground">
            {profile.avatar_url ? (
              <Image src={profile.avatar_url} alt="" fill className="object-cover" sizes="56px" />
            ) : (
              profile.full_name.slice(0, 1).toUpperCase()
            )}
          </div>
          <div className="grid flex-1 gap-2">
            <Input
              id="avatar_file"
              name="avatar_file"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "")}
            />
            <p className="text-xs text-muted-foreground">
              JPG, PNG ou WEBP até 2 MB. {fileName ? `Selecionado: ${fileName}` : ""}
            </p>
          </div>
        </div>
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-primary">{state.success}</p> : null}
      <Button disabled={pending}>
        {pending ? <Upload /> : <Save />}
        {pending ? "Salvando..." : "Salvar perfil"}
      </Button>
    </form>
  );
}

export function ProfilePreferencesForm({ profile }: { profile: UserProfile }) {
  const showWelcome = !profile.app_preferences?.hide_welcome;
  const { toast } = useToast();

  return (
    <form
      action={updateWelcomePreferenceAction}
      className="grid gap-4"
      onSubmit={() => toast({ title: "Preferências salvas", description: "A configuração será aplicada no próximo acesso." })}
    >
      <label className="flex items-start gap-3 rounded-md border bg-background p-3 text-sm">
        <input
          type="checkbox"
          name="show_welcome"
          defaultChecked={showWelcome}
          className="mt-1 size-4 accent-primary"
        />
        <span>
          <span className="block font-medium">Mostrar boas-vindas ao entrar</span>
          <span className="mt-1 block text-muted-foreground">
            Exibe a tela inicial elegante do CliniCore no acesso ao sistema.
          </span>
        </span>
      </label>
      <Button variant="outline" size="sm">
        <Save />
        Salvar preferências
      </Button>
    </form>
  );
}
