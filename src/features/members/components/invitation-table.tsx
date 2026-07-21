"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { Clipboard, Clock3, History, LoaderCircle, Mail, RefreshCw, ShieldCheck, X } from "lucide-react";
import { ROLE_LABELS } from "@/config/permissions";
import { cancelInvitationAction, copyInvitationLinkAction, resendInvitationAction } from "@/features/members/invitation-actions";
import type { ClinicInvitation } from "@/repositories/invitations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

const statusLabels: Record<ClinicInvitation["status"], string> = {
  pending: "Preparando",
  sent: "Enviado",
  accepted: "Aceito",
  expired: "Expirado",
  canceled: "Cancelado",
  failed: "Falha no envio",
};

function dateTime(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function statusClass(status: ClinicInvitation["status"]) {
  if (status === "sent") return "bg-primary/10 text-primary";
  if (status === "accepted") return "bg-emerald-500/10 text-emerald-700";
  if (status === "expired" || status === "canceled") return "bg-muted text-muted-foreground";
  if (status === "failed") return "bg-destructive/10 text-destructive";
  return "bg-amber-500/10 text-amber-700";
}

export function InvitationTable({
  invitations,
  canManageMembers,
}: {
  invitations: ClinicInvitation[];
  canManageMembers: boolean;
}) {
  if (invitations.length === 0) {
    return (
      <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
        <Mail className="mx-auto size-5 opacity-60" />
        <p className="mt-2">Nenhum convite registrado.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <div className="min-w-[860px] divide-y">
        <div className="grid grid-cols-[minmax(220px,1.5fr)_140px_110px_155px_155px] gap-3 bg-muted/35 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span>Destinatario</span>
          <span>Perfil</span>
          <span>Status</span>
          <span>Envio</span>
          <span>Validade / acoes</span>
        </div>
        {invitations.map((invitation) => (
          <InvitationRow key={invitation.id} invitation={invitation} canManageMembers={canManageMembers} />
        ))}
      </div>
    </div>
  );
}

function InvitationRow({
  invitation,
  canManageMembers,
}: {
  invitation: ClinicInvitation;
  canManageMembers: boolean;
}) {
  const { toast } = useToast();
  const resendFormRef = useRef<HTMLFormElement>(null);
  const [resendConfirmOpen, setResendConfirmOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [resendState, resendAction, resendPending] = useActionState(resendInvitationAction, {});
  const [cancelState, cancelAction, cancelPending] = useActionState(cancelInvitationAction, {});
  const [copyState, copyAction, copyPending] = useActionState(copyInvitationLinkAction, {});

  useEffect(() => {
    if (resendState.success) toast({ title: resendState.success, description: "O evento foi registrado na auditoria." });
    if (resendState.error) toast({ title: "Reenvio nao concluido", description: resendState.error, variant: "destructive" });
  }, [resendState, toast]);

  useEffect(() => {
    if (cancelState.success) {
      toast({ title: cancelState.success, description: "O convite e o vinculo pendente foram atualizados." });
      setCancelOpen(false);
    }
    if (cancelState.error) toast({ title: "Cancelamento nao concluido", description: cancelState.error, variant: "destructive" });
  }, [cancelState, toast]);

  useEffect(() => {
    if (copyState.inviteLink) {
      if (!navigator.clipboard) {
        toast({ title: "Link gerado", description: copyState.inviteLink });
      } else {
        void navigator.clipboard.writeText(copyState.inviteLink).then(
          () => toast({ title: "Link copiado", description: "Compartilhe somente com o destinatario." }),
          () => toast({ title: "Link gerado", description: copyState.inviteLink }),
        );
      }
    }
    if (copyState.error) toast({ title: "Link nao gerado", description: copyState.error, variant: "destructive" });
  }, [copyState, toast]);

  const canResend = canManageMembers && ["pending", "sent"].includes(invitation.status) && invitation.send_count < 5;
  const canCancel = canManageMembers && ["pending", "sent"].includes(invitation.status);

  return (
    <div className="grid grid-cols-[minmax(220px,1.5fr)_140px_110px_155px_155px] items-center gap-3 px-3 py-3 text-sm">
      <div className="min-w-0">
        <p className="truncate font-medium">{invitation.full_name ?? "Usuario convidado"}</p>
        <p className="truncate text-xs text-muted-foreground">{invitation.email}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">{invitation.send_count} de 5 envios utilizados</p>
      </div>
      <span className="truncate text-xs">{ROLE_LABELS[invitation.role] ?? invitation.role}</span>
      <Badge className={statusClass(invitation.status)}>{statusLabels[invitation.status]}</Badge>
      <div className="text-xs text-muted-foreground">
        <p>{dateTime(invitation.last_sent_at ?? invitation.created_at)}</p>
        {invitation.accepted_at ? <p className="mt-1 text-emerald-700">Aceito {dateTime(invitation.accepted_at)}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="text-[11px] text-muted-foreground">
          <Clock3 className="mr-1 inline size-3" />
          {dateTime(invitation.expires_at)}
        </div>
        {canResend ? (
          <form ref={resendFormRef} action={resendAction}>
            <input type="hidden" name="invitation_id" value={invitation.id} />
            <Button type="button" variant="outline" size="icon" title="Reenviar convite" aria-label="Reenviar convite" disabled={resendPending} onClick={() => setResendConfirmOpen(true)}>
              {resendPending ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
            </Button>
            <ConfirmDialog open={resendConfirmOpen} onOpenChange={setResendConfirmOpen} title="Reenviar este convite?" description="O link atual sera invalidado e um novo link com nova validade sera enviado por e-mail." confirmLabel="Reenviar convite" onConfirm={() => resendFormRef.current?.requestSubmit()} />
          </form>
        ) : null}
        {canCancel ? (
          <Button type="button" variant="outline" size="icon" title="Cancelar convite" aria-label="Cancelar convite" disabled={cancelPending} onClick={() => setCancelOpen(true)}>
            {cancelPending ? <LoaderCircle className="animate-spin" /> : <X />}
          </Button>
        ) : null}
        {canResend ? (
          <form action={copyAction}>
            <input type="hidden" name="invitation_id" value={invitation.id} />
            <Button type="submit" variant="ghost" size="icon" title="Copiar link seguro" aria-label="Copiar link seguro" disabled={copyPending}>
              {copyPending ? <LoaderCircle className="animate-spin" /> : <Clipboard />}
            </Button>
          </form>
        ) : null}
        <Button asChild type="button" variant="ghost" size="icon" title="Ver historico" aria-label="Ver historico">
          <Link href={`/auditoria?searched=1&module=members&record_id=${invitation.id}`}><History /></Link>
        </Button>
      </div>

      <Dialog.Root open={cancelOpen} onOpenChange={setCancelOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[2px]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(440px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card p-5 shadow-2xl outline-none">
            <Dialog.Title className="text-base font-semibold">Cancelar convite</Dialog.Title>
            <Dialog.Description className="mt-1 text-sm leading-6 text-muted-foreground">O acesso pendente sera revogado. A conta Auth nao sera apagada.</Dialog.Description>
            <form action={cancelAction} className="mt-4 grid gap-4">
              <input type="hidden" name="invitation_id" value={invitation.id} />
              <label className="grid gap-1.5 text-sm font-medium" htmlFor={`cancel-reason-${invitation.id}`}>
                Motivo <span className="font-normal text-muted-foreground">(opcional)</span>
                <Input id={`cancel-reason-${invitation.id}`} name="reason" placeholder="Ex.: convite enviado por engano" disabled={cancelPending} />
              </label>
              <div className="flex justify-end gap-2">
                <Dialog.Close asChild><Button type="button" variant="outline" disabled={cancelPending}>Voltar</Button></Dialog.Close>
                <Button type="submit" variant="destructive" disabled={cancelPending}>{cancelPending ? <LoaderCircle className="animate-spin" /> : <ShieldCheck />}{cancelPending ? "Cancelando..." : "Confirmar cancelamento"}</Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
