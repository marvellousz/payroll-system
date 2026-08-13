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
  return date.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function titleStatus(status: string | null | undefined) {
  if (!status) return "Unmarked";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/** Parse YYYY-MM-DD as UTC date (avoids timezone day shifts). */
function parseAttendanceDate(date: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date).trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return new Date(Date.UTC(y, mo - 1, d));
}

function calendarYmd(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addCalendarDays(ymd: string, delta: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().slice(0, 10);
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

  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59));

  const records = await prisma.attendanceRecord.findMany({
    where: {
      employee_id: id,
      date: { gte: startDate, lte: endDate },
      employee: { outlet: { org_id: profile.org_id } },
    },
    orderBy: { date: "asc" },
  });

  return NextResponse.json(records, {
    headers: { "Cache-Control": "private, no-store" },
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

  // OT only applies to Present days (binary on/off)
  let otUnits: number | null = null;
  if (status === "present") {
    const otRaw = overtime_units ?? null;
    if (otRaw !== null && otRaw !== "" && otRaw !== undefined) {
      const n = Number(otRaw);
      if (n > 0) otUnits = 1;
      else if (n !== 0 && !Number.isNaN(n)) {
        return NextResponse.json(
          { error: "overtime is either on (1) or off" },
          { status: 400 }
        );
      }
    }
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

  const dateObj = parseAttendanceDate(date);
  if (!dateObj) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  // Staff may only change today and yesterday; admin can edit any day
  if (profile.role !== "admin") {
    const ymd = String(date).trim();
    const today = calendarYmd("Asia/Kolkata");
    const yesterday = addCalendarDays(today, -1);
    if (ymd !== today && ymd !== yesterday) {
      return NextResponse.json(
        { error: "Staff can only mark attendance for today or yesterday" },
        { status: 403 }
      );
    }
  }

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
      new_value: `${employee.name} · ${dateLabel} · ${titleStatus(existing?.status)} → ${titleStatus(status)}`,
      outlet_id: employee.outlet_id,
    });
  }

  const hadOt = existing?.overtime_units != null && Number(existing.overtime_units) > 0;
  const hasOt = otUnits != null && Number(otUnits) > 0;
  if (hadOt !== hasOt) {
    void logAudit({
      org_id: profile.org_id,
      user_id: profile.id,
      entity_type: "AttendanceRecord",
      entity_id: record.id,
      field_changed: "overtime_units",
      old_value: hadOt ? "on" : "off",
      new_value: `${employee.name} · ${dateLabel} · OT ${hadOt ? "on" : "off"} → ${hasOt ? "on" : "off"}`,
      outlet_id: employee.outlet_id,
    });
  }

  return NextResponse.json(record);
}
