"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Image from "next/image";
import { useActionState, useEffect, useRef, useState } from "react";
import { LoaderCircle, ShieldCheck, Trash2, UserRound, X } from "lucide-react";
import {
  CRITICAL_PERMISSION_OPTIONS,
  MODULE_LABELS,
  ROLE_LABELS,
  ROLE_PRESET_DESCRIPTIONS,
} from "@/config/permissions";
import {
  deleteMemberAccountAction,
  updateMemberPermissionsAction,
  updateMemberRoleAction,
  updateMemberStatusAction,
} from "@/features/members/actions";
import type { ClinicMember, MemberPermissionOverride } from "@/types/domain";
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

export const MEMBER_STATUS_LABELS: Record<ClinicMember["status"], string> = {
  active: "Ativo",
  invited: "Convite pendente",
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
  canManageMembers,
  canManagePermissions,
}: {
  members: ClinicMember[];
  currentUserId?: string | null;
  permissionOverrides: Record<string, MemberPermissionOverride[]>;
  canManageMembers: boolean;
  canManagePermissions: boolean;
}) {
  if (members.length === 0) {
    return (
      <div className="rounded-lg border border-dashed px-5 py-10 text-center">
        <UserRound className="mx-auto size-8 text-muted-foreground/60" />
        <p className="mt-3 text-sm font-medium">Nenhum usuário encontrado</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Ajuste os filtros ou cadastre um novo membro para esta clínica.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {members.map((member) => (
        <MemberRow
          key={member.id}
          member={member}
          currentUserId={currentUserId}
          permissionOverrides={permissionOverrides[member.id] ?? []}
          canManageMembers={canManageMembers}
          canManagePermissions={canManagePermissions}
        />
      ))}
    </div>
  );
}

function MemberRow({
  member,
  currentUserId,
  permissionOverrides,
  canManageMembers,
  canManagePermissions,
}: {
  member: ClinicMember;
  currentUserId?: string | null;
  permissionOverrides: MemberPermissionOverride[];
  canManageMembers: boolean;
  canManagePermissions: boolean;
}) {
  const { toast } = useToast();
  const roleFormRef = useRef<HTMLFormElement>(null);
  const statusFormRef = useRef<HTMLFormElement>(null);
  const [roleConfirmOpen, setRoleConfirmOpen] = useState(false);
  const [statusConfirmOpen, setStatusConfirmOpen] = useState(false);
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [roleState, roleAction, rolePending] = useActionState(updateMemberRoleAction, {});
  const [statusState, statusAction, statusPending] = useActionState(updateMemberStatusAction, {});
  const [deleteState, deleteAction, deletePending] = useActionState(deleteMemberAccountAction, {});
  const deleteFormRef = useRef<HTMLFormElement>(null);
  const isOwner = member.role === "clinic_owner";
  const isSelf = member.user_id === currentUserId;
  const memberActionsDisabled = !canManageMembers || isOwner || isSelf;
  const statusOptions: ClinicMember["status"][] =
    member.status === "invited" ? ["invited", "active", "suspended"] : ["active", "suspended"];

  useEffect(() => {
    showActionToast(roleState, toast, "A alteração foi registrada na auditoria.");
  }, [roleState, toast]);

  useEffect(() => {
    showActionToast(statusState, toast, "O status foi registrado na auditoria.");
  }, [statusState, toast]);

  useEffect(() => {
    showActionToast(deleteState, toast, "A exclusão definitiva foi registrada na auditoria.");
  }, [deleteState, toast]);

  return (
    <article className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="grid gap-4">
        <header className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
          <div className="flex min-w-0 gap-3">
            <div className="relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-primary/10 text-primary">
              {member.profile?.avatar_url ? (
                <Image
                  src={member.profile.avatar_url}
                  alt={`Foto de ${member.profile.full_name}`}
                  fill
                  sizes="44px"
                  className="object-cover"
                />
              ) : (
                <UserRound className="size-5" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="break-words font-medium">{member.profile?.full_name ?? "Usuário sem perfil"}</p>
                <Badge
                  className={cn(
                    member.status === "active" && "bg-primary/10 text-primary",
                    member.status === "suspended" && "bg-destructive/10 text-destructive",
                    member.status === "invited" && "bg-amber-500/10 text-amber-700",
                  )}
                >
                  {MEMBER_STATUS_LABELS[member.status]}
                </Badge>
                {isSelf ? <Badge>Você</Badge> : null}
              </div>
              <p className="mt-1 break-all text-sm text-muted-foreground">
                {member.profile?.email ?? "E-mail não informado"}
              </p>
              {member.profile?.phone ? (
                <p className="mt-1 text-xs text-muted-foreground">{member.profile.phone}</p>
              ) : null}
              <p className="mt-2 max-w-3xl text-xs leading-5 text-muted-foreground">
                {ROLE_PRESET_DESCRIPTIONS[member.role]}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            <Badge className="w-fit">{ROLE_LABELS[member.role]}</Badge>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canManagePermissions && !isOwner}
              onClick={() => setPermissionsOpen(true)}
            >
              <ShieldCheck />
              Permissões
            </Button>
            <form ref={deleteFormRef} action={deleteAction}>
              <input type="hidden" name="member_id" value={member.id} />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canManageMembers || isOwner || isSelf || deletePending}
                className="text-destructive hover:text-destructive"
                onClick={() => setDeleteConfirmOpen(true)}
              >
                {deletePending ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
                Excluir
              </Button>
              <ConfirmDialog
                open={deleteConfirmOpen}
                onOpenChange={setDeleteConfirmOpen}
                title="Excluir definitivamente este usuário?"
                description="A exclusão só será concluída se a conta não possuir clínicas, consultas, cadastros ou outros registros vinculados. Caso existam vínculos, suspenda o acesso."
                confirmLabel="Excluir usuário"
                destructive
                onConfirm={() => deleteFormRef.current?.requestSubmit()}
              />
            </form>
          </div>
        </header>

        <div className="grid gap-3 border-t pt-4 lg:grid-cols-2">
          <form ref={roleFormRef} action={roleAction} className="grid min-w-0 gap-2">
            <input type="hidden" name="member_id" value={member.id} />
            <span className="text-xs font-medium text-muted-foreground">Perfil na clínica</span>
            <div className="flex min-w-0 gap-2">
              <Select
                key={member.role}
                name="role"
                defaultValue={member.role}
                disabled={!canManageMembers || isOwner || rolePending}
                className="min-w-0 flex-1"
              >
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canManageMembers || isOwner || rolePending}
                onClick={() => setRoleConfirmOpen(true)}
              >
                {rolePending ? <LoaderCircle className="animate-spin" /> : null}
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
              <Select
                key={member.status}
                name="status"
                defaultValue={member.status}
                disabled={memberActionsDisabled || statusPending}
                className="min-w-0 flex-1"
              >
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {MEMBER_STATUS_LABELS[status]}
                  </option>
                ))}
              </Select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={memberActionsDisabled || statusPending}
                onClick={() => setStatusConfirmOpen(true)}
              >
                {statusPending ? <LoaderCircle className="animate-spin" /> : null}
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

      <MemberPermissionsDialog
        open={permissionsOpen}
        onOpenChange={setPermissionsOpen}
        member={member}
        permissionOverrides={permissionOverrides}
        canManage={canManagePermissions}
      />
    </article>
  );
}

function MemberPermissionsDialog({
  open,
  onOpenChange,
  member,
  permissionOverrides,
  canManage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: ClinicMember;
  permissionOverrides: MemberPermissionOverride[];
  canManage: boolean;
}) {
  const { toast } = useToast();
  const [state, formAction, pending] = useActionState(updateMemberPermissionsAction, {});
  const isOwner = member.role === "clinic_owner";

  useEffect(() => {
    if (state.success) {
      toast({
        title: state.success,
        description: "O conjunto anterior e o novo foram registrados na auditoria.",
      });
      onOpenChange(false);
    }

    if (state.error) {
      toast({ title: "Permissões não atualizadas", description: state.error, variant: "destructive" });
    }
  }, [onOpenChange, state, toast]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in data-[state=closed]:fade-out" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[min(760px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border bg-card shadow-2xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in data-[state=open]:zoom-in-95 data-[state=closed]:fade-out data-[state=closed]:zoom-out-95">
          <header className="flex items-start justify-between gap-4 border-b px-5 py-4">
            <div className="min-w-0">
              <Dialog.Title className="text-lg font-semibold">Permissões individuais</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm leading-6 text-muted-foreground">
                Ajustes adicionais para {member.profile?.full_name ?? "este usuário"} na clínica ativa.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" className="size-9 shrink-0" aria-label="Fechar">
                <X />
              </Button>
            </Dialog.Close>
          </header>

          {isOwner ? (
            <div className="p-5">
              <div className="rounded-md border bg-primary/5 p-4">
                <p className="font-medium">Acesso administrativo completo</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  O proprietário possui acesso total por definição e não precisa de liberações individuais.
                </p>
              </div>
            </div>
          ) : (
            <form action={formAction} className="flex min-h-0 flex-1 flex-col">
              <input type="hidden" name="member_id" value={member.id} />
              <div className="min-h-0 flex-1 overflow-y-auto p-5">
                <div className="grid gap-3 md:grid-cols-2">
                  {CRITICAL_PERMISSION_OPTIONS.map((option) => {
                    const key = `${option.module}:${option.action}`;
                    const enabled = permissionOverrides.some(
                      (permission) =>
                        permission.module === option.module && permission.action === option.action,
                    );

                    return (
                      <label
                        key={key}
                        className="flex cursor-pointer gap-3 rounded-md border p-3 transition-colors hover:bg-muted/50 has-[:checked]:border-primary/40 has-[:checked]:bg-primary/5"
                      >
                        <input
                          type="checkbox"
                          name="permissions"
                          value={key}
                          defaultChecked={enabled}
                          disabled={!canManage || pending}
                          className="mt-1 size-4 shrink-0 accent-primary"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">{option.label}</span>
                          <span className="mt-1 block text-xs font-medium text-primary">
                            {MODULE_LABELS[option.module]}
                          </span>
                          <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                            {option.description}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <footer className="flex items-center justify-end gap-2 border-t bg-card px-5 py-4">
                <Dialog.Close asChild>
                  <Button type="button" variant="outline" disabled={pending}>
                    Cancelar
                  </Button>
                </Dialog.Close>
                <Button type="submit" disabled={!canManage || pending}>
                  {pending ? <LoaderCircle className="animate-spin" /> : <ShieldCheck />}
                  {pending ? "Salvando..." : "Salvar permissões"}
                </Button>
              </footer>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
