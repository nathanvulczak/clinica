"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Check, ShieldCheck, UserRound } from "lucide-react";
import {
  CRITICAL_PERMISSION_OPTIONS,
  MODULE_LABELS,
  ROLE_LABELS,
  ROLE_PRESET_DESCRIPTIONS,
} from "@/config/permissions";
import {
  updateMemberPermissionAction,
  updateMemberRoleAction,
  updateMemberStatusAction,
} from "@/features/members/actions";
import type { ClinicMember, MemberPermissionOverride, PermissionAction, PermissionModule } from "@/types/domain";
import { useToast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const editableRoles = [
  "clinic_admin",
  "doctor",
  "nurse",
  "receptionist",
  "financial",
  "professional",
] as const;

const statusLabels: Record<ClinicMember["status"], string> = {
  active: "Ativo",
  invited: "Convidado",
  suspended: "Suspenso",
  removed: "Removido",
};

function showActionToast(
  state: { success?: string; error?: string },
  toast: ReturnType<typeof useToast>["toast"],
  fallback: string,
) {
  if (state.success) {
    toast({ title: state.success, description: fallback });
  }

  if (state.error) {
    toast({ title: "Ação não concluída", description: state.error, variant: "destructive" });
  }
}

export function MembersTable({
  members,
  currentUserId,
  permissionOverrides,
}: {
  members: ClinicMember[];
  currentUserId?: string | null;
  permissionOverrides: Record<string, MemberPermissionOverride[]>;
}) {
  if (members.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        Nenhum membro vinculado à clínica ativa.
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {members.map((member) => (
        <MemberRow
          key={member.id}
          member={member}
          currentUserId={currentUserId}
          permissionOverrides={permissionOverrides[member.id] ?? []}
        />
      ))}
    </div>
  );
}

function MemberRow({
  member,
  currentUserId,
  permissionOverrides,
}: {
  member: ClinicMember;
  currentUserId?: string | null;
  permissionOverrides: MemberPermissionOverride[];
}) {
  const { toast } = useToast();
  const roleFormRef = useRef<HTMLFormElement>(null);
  const statusFormRef = useRef<HTMLFormElement>(null);
  const [roleConfirmOpen, setRoleConfirmOpen] = useState(false);
  const [statusConfirmOpen, setStatusConfirmOpen] = useState(false);
  const [roleState, roleAction, rolePending] = useActionState(updateMemberRoleAction, {});
  const [statusState, statusAction, statusPending] = useActionState(updateMemberStatusAction, {});
  const isOwner = member.role === "clinic_owner";
  const isSelf = member.user_id === currentUserId;
  const actionsDisabled = isOwner || isSelf;
  const statusOptions: ClinicMember["status"][] =
    member.status === "invited" ? ["invited", "active", "suspended"] : ["active", "suspended"];

  useEffect(() => {
    showActionToast(roleState, toast, "A alteração foi registrada na auditoria.");
  }, [roleState, toast]);

  useEffect(() => {
    showActionToast(statusState, toast, "O status foi registrado na auditoria.");
  }, [statusState, toast]);

  return (
    <article className="overflow-hidden rounded-lg border bg-card shadow-sm">
      <div className="grid gap-4 p-4">
        <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <UserRound className="size-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate font-medium">{member.profile?.full_name ?? "Usuário sem perfil"}</p>
                <Badge
                  className={cn(
                    member.status === "active" && "bg-primary/10 text-primary",
                    member.status === "suspended" && "bg-destructive/10 text-destructive",
                    member.status === "invited" && "bg-muted text-muted-foreground",
                  )}
                >
                  {statusLabels[member.status]}
                </Badge>
                {isSelf ? <Badge>Você</Badge> : null}
              </div>
              <p className="mt-1 truncate text-sm text-muted-foreground">{member.profile?.email ?? "sem e-mail"}</p>
              <p className="mt-2 max-w-3xl text-xs leading-5 text-muted-foreground">
                {ROLE_PRESET_DESCRIPTIONS[member.role]}
              </p>
            </div>
          </div>
          <Badge className="w-fit shrink-0">{ROLE_LABELS[member.role]}</Badge>
        </header>

        <div className="grid gap-3 rounded-md border bg-background p-3 xl:grid-cols-2">
          <form ref={roleFormRef} action={roleAction} className="grid min-w-0 gap-2">
            <input type="hidden" name="member_id" value={member.id} />
            <span className="text-xs font-medium text-muted-foreground">Perfil na clínica</span>
            <div className="flex min-w-0 gap-2">
              <Select name="role" defaultValue={member.role} disabled={isOwner || rolePending} className="min-w-0 flex-1">
                {isOwner ? (
                  <option value="clinic_owner">{ROLE_LABELS.clinic_owner}</option>
                ) : (
                  editableRoles.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))
                )}
              </Select>
              <Button type="button" variant="outline" size="sm" disabled={isOwner || rolePending} onClick={() => setRoleConfirmOpen(true)}>
                Salvar
              </Button>
            </div>
            <ConfirmDialog
              open={roleConfirmOpen}
              onOpenChange={setRoleConfirmOpen}
              title="Alterar perfil do usuário?"
              description="A mudança pode liberar ou restringir áreas da clínica e ficará registrada na auditoria."
              confirmLabel="Alterar perfil"
              onConfirm={() => roleFormRef.current?.requestSubmit()}
            />
          </form>

          <form ref={statusFormRef} action={statusAction} className="grid min-w-0 gap-2">
            <input type="hidden" name="member_id" value={member.id} />
            <span className="text-xs font-medium text-muted-foreground">Status de acesso</span>
            <div className="flex min-w-0 gap-2">
              <Select name="status" defaultValue={member.status} disabled={actionsDisabled || statusPending} className="min-w-0 flex-1">
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {statusLabels[status]}
                  </option>
                ))}
              </Select>
              <Button type="button" variant="outline" size="sm" disabled={actionsDisabled || statusPending} onClick={() => setStatusConfirmOpen(true)}>
                Salvar
              </Button>
            </div>
            <ConfirmDialog
              open={statusConfirmOpen}
              onOpenChange={setStatusConfirmOpen}
              title="Alterar status do usuário?"
              description="Usuários suspensos perdem acesso operacional à clínica. Esta ação ficará registrada na auditoria."
              confirmLabel="Alterar status"
              destructive
              onConfirm={() => statusFormRef.current?.requestSubmit()}
            />
          </form>
        </div>
      </div>

      <details className="border-t bg-background">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
          Permissões individuais adicionais
        </summary>
        <div className="grid gap-3 border-t p-4">
          {isOwner ? (
            <p className="text-sm text-muted-foreground">
              Proprietários possuem acesso total à clínica por definição. Permissões individuais não são necessárias.
            </p>
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              {CRITICAL_PERMISSION_OPTIONS.map((option) => {
                const enabled = permissionOverrides.some(
                  (permission) => permission.module === option.module && permission.action === option.action,
                );

                return (
                  <PermissionToggle
                    key={`${option.module}:${option.action}`}
                    memberId={member.id}
                    module={option.module}
                    action={option.action}
                    label={option.label}
                    description={option.description}
                    enabled={enabled}
                  />
                );
              })}
            </div>
          )}
        </div>
      </details>
    </article>
  );
}

function PermissionToggle({
  memberId,
  module,
  action,
  label,
  description,
  enabled,
}: {
  memberId: string;
  module: PermissionModule;
  action: PermissionAction;
  label: string;
  description: string;
  enabled: boolean;
}) {
  const { toast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(updateMemberPermissionAction, {});

  useEffect(() => {
    showActionToast(state, toast, "A permissão individual foi registrada na auditoria.");
  }, [state, toast]);

  return (
    <form ref={formRef} action={formAction} className="min-w-0 rounded-md border bg-card p-3">
      <input type="hidden" name="member_id" value={memberId} />
      <input type="hidden" name="module" value={module} />
      <input type="hidden" name="action" value={action} />
      <input type="hidden" name="enabled" value={String(!enabled)} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">{label}</p>
            {enabled ? (
              <Badge className="bg-primary/10 text-primary">
                <Check className="mr-1 size-3" />
                Liberada
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {MODULE_LABELS[module]} • {description}
          </p>
        </div>
        <Button
          type="button"
          variant={enabled ? "secondary" : "outline"}
          size="sm"
          disabled={pending}
          className="shrink-0"
          onClick={() => setOpen(true)}
        >
          <ShieldCheck />
          {enabled ? "Remover" : "Liberar"}
        </Button>
      </div>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={enabled ? "Remover permissão individual?" : "Liberar permissão individual?"}
        description="Permissões individuais afetam o acesso deste usuário na clínica ativa e ficam registradas em auditoria."
        confirmLabel={enabled ? "Remover permissão" : "Liberar permissão"}
        destructive={enabled}
        onConfirm={() => formRef.current?.requestSubmit()}
      />
    </form>
  );
}
