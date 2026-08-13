import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthProfile, logAudit } from "@/lib/audit";

async function verifyEmployee(employeeId: string, orgId: string) {
  return prisma.employee.findFirst({
    where: { id: employeeId, outlet: { org_id: orgId } },
  });
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

// POST /api/attendance — upsert a single attendance record
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

  const employee = await verifyEmployee(id, profile.org_id);
  if (!employee) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const dateObj = new Date(date);

  // If absent, overtime must be null
  const otUnits = status === "absent" ? null : (overtime_units ?? null);

  // Get existing record for audit diff
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

  // Audit in the background so the click feels instant
  if (!existing || existing.status !== status) {
    void logAudit({
      org_id: profile.org_id,
      user_id: profile.id,
      entity_type: "AttendanceRecord",
      entity_id: record.id,
      field_changed: "status",
      old_value: existing?.status ?? null,
      new_value: status,
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
      new_value: newOt,
    });
  }

  return NextResponse.json(record);
}
