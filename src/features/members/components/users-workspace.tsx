"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Search,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { ROLE_LABELS } from "@/config/permissions";
import { InviteMemberForm } from "@/features/members/components/invite-member-form";
import {
  MEMBER_STATUS_LABELS,
  MembersTable,
} from "@/features/members/components/members-table";
import type { ClinicMember, MemberPermissionOverride } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";

const PAGE_SIZE = 6;

export function UsersWorkspace({
  members,
  currentUserId,
  permissionOverrides,
  activeClinicName,
  canManageMembers,
  canManagePermissions,
}: {
  members: ClinicMember[];
  currentUserId?: string | null;
  permissionOverrides: Record<string, MemberPermissionOverride[]>;
  activeClinicName?: string | null;
  canManageMembers: boolean;
  canManagePermissions: boolean;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formVersion, setFormVersion] = useState(0);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const deferredSearch = useDeferredValue(search);
  const isFiltering = search !== deferredSearch;

  const filteredMembers = useMemo(() => {
    const normalizedSearch = deferredSearch.trim().toLocaleLowerCase("pt-BR");

    return members.filter((member) => {
      const matchesSearch =
        !normalizedSearch ||
        member.profile?.full_name?.toLocaleLowerCase("pt-BR").includes(normalizedSearch) ||
        member.profile?.email?.toLocaleLowerCase("pt-BR").includes(normalizedSearch);
      const matchesRole = role === "all" || member.role === role;
      const matchesStatus = status === "all" || member.status === status;

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [deferredSearch, members, role, status]);

  const totalPages = Math.max(1, Math.ceil(filteredMembers.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleMembers = filteredMembers.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  useEffect(() => {
    setPage(1);
  }, [deferredSearch, role, status]);

  const handleInviteCompleted = useCallback(() => {
    setDrawerOpen(false);
    setFormVersion((version) => version + 1);
  }, []);

  return (
    <div className="grid gap-5">
      <div className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium">
            <UsersRound className="size-4 text-primary" />
            {members.length} {members.length === 1 ? "usuário vinculado" : "usuários vinculados"}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {activeClinicName
              ? `Clínica ativa: ${activeClinicName}`
              : "Selecione uma clínica para gerenciar seus usuários."}
          </p>
        </div>
        <Button
          type="button"
          disabled={!activeClinicName || !canManageMembers}
          onClick={() => setDrawerOpen(true)}
        >
          <UserPlus />
          Cadastrar usuário
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(240px,1fr)_190px_180px]">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome ou e-mail"
            className="pl-9 pr-9"
            aria-label="Buscar usuários"
          />
          {isFiltering ? (
            <LoaderCircle className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : null}
        </label>
        <Select value={role} onChange={(event) => setRole(event.target.value)} aria-label="Filtrar por perfil">
          <option value="all">Todos os perfis</option>
          {Object.entries(ROLE_LABELS)
            .filter(([value]) => value !== "platform_admin")
            .map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
        </Select>
        <Select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filtrar por status">
          <option value="all">Todos os status</option>
          {Object.entries(MEMBER_STATUS_LABELS)
            .filter(([value]) => value !== "removed")
            .map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
        </Select>
      </div>

      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>
          {filteredMembers.length} {filteredMembers.length === 1 ? "resultado" : "resultados"}
        </span>
        {(search || role !== "all" || status !== "all") && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              setRole("all");
              setStatus("all");
            }}
          >
            Limpar filtros
          </Button>
        )}
      </div>

      <MembersTable
        members={visibleMembers}
        currentUserId={currentUserId}
        permissionOverrides={permissionOverrides}
        canManageMembers={canManageMembers}
        canManagePermissions={canManagePermissions}
      />

      {totalPages > 1 ? (
        <nav className="flex items-center justify-between border-t pt-4" aria-label="Paginação de usuários">
          <p className="text-sm text-muted-foreground">
            Página {currentPage} de {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={currentPage === 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              aria-label="Página anterior"
            >
              <ChevronLeft />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={currentPage === totalPages}
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              aria-label="Próxima página"
            >
              <ChevronRight />
            </Button>
          </div>
        </nav>
      ) : null}

      <Sheet
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title="Cadastrar usuário"
        description="Crie o vínculo, defina o perfil na clínica e envie um acesso seguro por e-mail."
      >
        <div className="mb-5 rounded-md border bg-muted/35 p-3 text-xs leading-5 text-muted-foreground">
          O novo usuário receberá um link para confirmar o convite e criar a própria senha. O acesso
          só será ativado depois dessa etapa.
        </div>
        <InviteMemberForm
          key={formVersion}
          disabled={!activeClinicName || !canManageMembers}
          onCompleted={handleInviteCompleted}
        />
      </Sheet>
    </div>
  );
}
