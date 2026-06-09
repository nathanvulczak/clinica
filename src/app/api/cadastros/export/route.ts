import { NextResponse, type NextRequest } from "next/server";
import { getActiveClinicContext } from "@/features/clinics/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getRegistrationAccess,
  listClinicRooms,
  listClinicServices,
  listPatients,
} from "@/repositories/registrations";
import { logAuditEvent } from "@/services/audit/audit-service";

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function createCsv(headers: string[], rows: unknown[][]) {
  return `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n")}`;
}

export async function GET(request: NextRequest) {
  const resource = request.nextUrl.searchParams.get("resource");

  if (!resource || !["patients", "services", "rooms"].includes(resource)) {
    return NextResponse.json({ error: "Recurso de exportação inválido." }, { status: 400 });
  }

  const [{ activeClinic }, supabase] = await Promise.all([
    getActiveClinicContext(),
    createSupabaseServerClient(),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !activeClinic) {
    return NextResponse.json({ error: "Sessão ou clínica ativa não encontrada." }, { status: 401 });
  }

  const access = await getRegistrationAccess(activeClinic.id);
  let csv = "";

  if (resource === "patients") {
    if (!access.canExportPatients) {
      return NextResponse.json({ error: "Sem permissão para exportar pacientes." }, { status: 403 });
    }

    const patients = await listPatients(activeClinic.id, {
      includeInactive: true,
      access,
    });
    csv = createCsv(
      [
        "Nome",
        "Nome social",
        "CPF",
        "Nascimento",
        "Telefone",
        "E-mail",
        "Cidade",
        "UF",
        "Convênio",
        "Carteirinha",
        "Ativo",
      ],
      patients.map((patient) => [
        patient.full_name,
        patient.social_name,
        patient.cpf,
        patient.birth_date,
        patient.phone,
        patient.email,
        patient.city,
        patient.state,
        patient.health_plan_name,
        patient.health_plan_number,
        patient.active ? "Sim" : "Não",
      ]),
    );
  }

  if (resource === "services") {
    if (!access.canExportCatalog) {
      return NextResponse.json({ error: "Sem permissão para exportar serviços." }, { status: 403 });
    }

    const services = await listClinicServices(activeClinic.id, true, access);
    csv = createCsv(
      ["Código", "Serviço", "Categoria", "Duração", "Preço em centavos", "Autorização", "Ativo"],
      services.map((service) => [
        service.code,
        service.name,
        service.category,
        service.duration_minutes,
        service.price_cents,
        service.requires_authorization ? "Sim" : "Não",
        service.active ? "Sim" : "Não",
      ]),
    );
  }

  if (resource === "rooms") {
    if (!access.canExportCatalog) {
      return NextResponse.json({ error: "Sem permissão para exportar consultórios." }, { status: 403 });
    }

    const rooms = await listClinicRooms(activeClinic.id, true, access);
    csv = createCsv(
      ["Código", "Consultório", "Tipo", "Andar/setor", "Capacidade", "Recursos", "Ativo"],
      rooms.map((room) => [
        room.code,
        room.name,
        room.room_type,
        room.floor,
        room.capacity,
        room.resources.join(", "),
        room.active ? "Sim" : "Não",
      ]),
    );
  }

  await logAuditEvent({
    clinicId: activeClinic.id,
    userId: user.id,
    actionType: "registration_exported",
    module: resource === "patients" ? "patients" : "schedule",
    recordTable: resource,
    level: resource === "patients" ? "security" : "info",
    notes: `Exportação CSV de ${resource} realizada.`,
  });

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Disposition": `attachment; filename="clinicore-${resource}-${date}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
