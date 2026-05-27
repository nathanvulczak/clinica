"use client";

import { ROLE_LABELS } from "@/config/permissions";
import { suspendMemberAction, updateMemberRoleAction } from "@/features/members/actions";
import type { ClinicMember } from "@/types/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

const editableRoles = [
  "clinic_owner",
  "clinic_admin",
  "doctor",
  "nurse",
  "receptionist",
  "financial",
  "professional",
] as const;

export function MembersTable({ members }: { members: ClinicMember[] }) {
  if (members.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum membro vinculado à clínica ativa.</p>;
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="grid min-w-[760px] grid-cols-[1.4fr_1fr_160px_140px_120px] bg-muted px-4 py-3 text-xs font-medium uppercase text-muted-foreground">
        <span>Usuário</span>
        <span>E-mail</span>
        <span>Papel</span>
        <span>Status</span>
        <span className="text-right">Ações</span>
      </div>
      <div className="min-w-[760px] divide-y">
        {members.map((member) => (
          <div key={member.id} className="grid grid-cols-[1.4fr_1fr_160px_140px_120px] items-center px-4 py-3 text-sm">
            <div>
              <p className="font-medium">{member.profile?.full_name ?? "Usuário sem perfil"}</p>
              <p className="text-xs text-muted-foreground">{member.user_id}</p>
            </div>
            <span className="text-muted-foreground">{member.profile?.email ?? "sem e-mail"}</span>
            <form action={updateMemberRoleAction}>
              <input type="hidden" name="member_id" value={member.id} />
              <Select name="role" defaultValue={member.role} onChange={(event) => event.currentTarget.form?.requestSubmit()}>
                {editableRoles.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </Select>
            </form>
            <span>
              <Badge>{member.status}</Badge>
            </span>
            <form action={suspendMemberAction} className="text-right">
              <input type="hidden" name="member_id" value={member.id} />
              <Button variant="outline" size="sm" disabled={member.role === "clinic_owner"}>
                Suspender
              </Button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
