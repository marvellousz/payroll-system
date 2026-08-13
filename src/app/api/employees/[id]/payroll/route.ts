import { NextResponse } from "next/server";
import { getAuthProfile, logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { computeEmployeePayroll } from "@/lib/payroll-server";

// GET /api/employees/:id/payroll?month=&year=
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

  if (!month || !year) {
    return NextResponse.json({ error: "month and year are required" }, { status: 400 });
  }

  const computed = await computeEmployeePayroll(id, profile.org_id, month, year);
  if (!computed) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(computed.payroll, {
    headers: { "Cache-Control": "private, max-age=20, stale-while-revalidate=90" },
  });
}

// POST /api/employees/:id/payroll — finalize/save a payroll summary
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getAuthProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const { month, year } = body;

  if (!month || !year) {
    return NextResponse.json({ error: "month and year are required" }, { status: 400 });
  }

  const computed = await computeEmployeePayroll(id, profile.org_id, month, year);
  if (!computed) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const p = computed.payroll;

  const summary = await prisma.payrollSummary.upsert({
    where: { employee_id_month_year: { employee_id: id, month, year } },
    create: {
      employee_id: id,
      month,
      year,
      days_present: p.days_present,
      days_absent: p.days_absent,
      days_half: p.days_half,
      paid_leave_days: p.paid_leave_days,
      base_pay: p.base_pay,
      overtime_total_units: p.overtime_total_units,
      overtime_rate_snapshot: p.overtime_rate_snapshot,
      overtime_pay: p.overtime_pay,
      total_pay: p.total_pay,
      salary_given: p.salary_given,
      previous_balance: p.previous_balance,
      monthly_balance: p.monthly_balance,
      closing_balance: p.closing_balance,
    },
    update: {
      days_present: p.days_present,
      days_absent: p.days_absent,
      days_half: p.days_half,
      paid_leave_days: p.paid_leave_days,
      base_pay: p.base_pay,
      overtime_total_units: p.overtime_total_units,
      overtime_rate_snapshot: p.overtime_rate_snapshot,
      overtime_pay: p.overtime_pay,
      total_pay: p.total_pay,
      salary_given: p.salary_given,
      previous_balance: p.previous_balance,
      monthly_balance: p.monthly_balance,
      closing_balance: p.closing_balance,
      generated_at: new Date(),
    },
  });

  await logAudit({
    org_id: profile.org_id,
    user_id: profile.id,
    entity_type: "PayrollSummary",
    entity_id: summary.id,
    field_changed: "generated",
    old_value: null,
    new_value: JSON.stringify({ month, year, total_pay: p.total_pay, closing_balance: p.closing_balance }),
  });

  return NextResponse.json(summary);
}
