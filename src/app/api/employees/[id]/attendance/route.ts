import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthProfile, logAudit } from "@/lib/audit";

async function verifyEmployee(employeeId: string, orgId: string) {
  return prisma.employee.findFirst({
    where: { id: employeeId, outlet: { org_id: orgId } },
    select: { id: true, name: true, outlet_id: true },
  });
}

function formatDay(date: Date) {
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// GET /api/employees/:id/attendance?month=&year=
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getAuthProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const month = Number(searchParams.get("month"));
  const year = Number(searchParams.get("year"));

  if (!month || !year || month < 1 || month > 12) {
    return NextResponse.json({ error: "month and year are required" }, { status: 400 });
  }

  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  const records = await prisma.attendanceRecord.findMany({
    where: {
      employee_id: id,
      date: { gte: startDate, lte: endDate },
      employee: { outlet: { org_id: profile.org_id } },
    },
    orderBy: { date: "asc" },
  });

  return NextResponse.json(records, {
    headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=60" },
  });
}

// POST /api/employees/:id/attendance — upsert a single attendance record
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getAuthProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const { date, status, overtime_units } = body;

  if (!date || !status) {
    return NextResponse.json({ error: "date and status are required" }, { status: 400 });
  }
  if (!["present", "absent", "half"].includes(status)) {
    return NextResponse.json({ error: "status must be present, absent, or half" }, { status: 400 });
  }

  const allowedOt = [null, 0, 0.5, 1, 1.5, 2];
  const otRaw = status === "absent" ? null : overtime_units ?? null;
  const otUnits =
    otRaw === null || otRaw === "" || otRaw === undefined
      ? null
      : Number(otRaw);
  if (otUnits !== null && !allowedOt.includes(otUnits)) {
    return NextResponse.json(
      { error: "overtime_units must be one of: none, 0.5, 1, 1.5, 2" },
      { status: 400 }
    );
  }

  const employee = await verifyEmployee(id, profile.org_id);
  if (!employee) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (
    profile.role !== "admin" &&
    profile.outlet_id &&
    employee.outlet_id !== profile.outlet_id
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const dateObj = new Date(date);

  const existing = await prisma.attendanceRecord.findUnique({
    where: { employee_id_date: { employee_id: id, date: dateObj } },
  });

  const record = await prisma.attendanceRecord.upsert({
    where: { employee_id_date: { employee_id: id, date: dateObj } },
    create: {
      employee_id: id,
      date: dateObj,
      status,
      overtime_units: otUnits,
    },
    update: {
      status,
      overtime_units: otUnits,
    },
  });

  const dateLabel = formatDay(dateObj);
  if (!existing || existing.status !== status) {
    void logAudit({
      org_id: profile.org_id,
      user_id: profile.id,
      entity_type: "AttendanceRecord",
      entity_id: record.id,
      field_changed: "status",
      old_value: existing?.status ?? null,
      new_value: `${employee.name} · ${dateLabel} · ${existing?.status ?? "unmarked"} → ${status}`,
    });
  }

  const oldOt = existing?.overtime_units != null ? String(existing.overtime_units) : null;
  const newOt = otUnits != null ? String(otUnits) : null;
  if (oldOt !== newOt) {
    void logAudit({
      org_id: profile.org_id,
      user_id: profile.id,
      entity_type: "AttendanceRecord",
      entity_id: record.id,
      field_changed: "overtime_units",
      old_value: oldOt,
      new_value: `${employee.name} · ${dateLabel} · OT ${oldOt ?? "None"} → ${newOt ?? "None"}`,
    });
  }

  return NextResponse.json(record);
}
