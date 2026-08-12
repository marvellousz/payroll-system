import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthProfile, logAudit } from "@/lib/audit";
import { calculatePayroll, calculateBalance } from "@/lib/payroll";

async function verifyEmployee(employeeId: string, orgId: string) {
  return prisma.employee.findFirst({
    where: { id: employeeId, outlet: { org_id: orgId } },
    include: { outlet: true },
  });
}

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

  const employee = await verifyEmployee(id, profile.org_id);
  if (!employee) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Get existing summary if any
  const existing = await prisma.payrollSummary.findUnique({
    where: { employee_id_month_year: { employee_id: id, month, year } },
  });

  // Get attendance records for this month
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  const attendance = await prisma.attendanceRecord.findMany({
    where: { employee_id: id, date: { gte: startDate, lte: endDate } },
  });

  const days_present = attendance.filter((r: { status: string }) => r.status === "present").length;
  const days_absent = attendance.filter((r: { status: string }) => r.status === "absent").length;
  const overtime_total_units = attendance.reduce(
    (sum: number, r: { overtime_units: unknown }) => sum + (r.overtime_units ? Number(r.overtime_units) : 0),
    0
  );

  // Get previous month's closing balance
  let prevMonth = month - 1;
  let prevYear = year;
  if (prevMonth === 0) { prevMonth = 12; prevYear -= 1; }

  const prevSummary = await prisma.payrollSummary.findUnique({
    where: { employee_id_month_year: { employee_id: id, month: prevMonth, year: prevYear } },
  });
  const previous_balance = prevSummary ? Number(prevSummary.closing_balance) : 0;

  // Get total salary given (sum of payments)
  const payments = await prisma.salaryPayment.findMany({
    where: { employee_id: id, month, year },
  });
  const salary_given = payments.reduce((sum: number, p: { amount: unknown }) => sum + Number(p.amount), 0);

  // Calculate payroll
  const { base_pay, overtime_pay, total_pay } = calculatePayroll({
    monthly_salary: employee.monthly_salary,
    paid_leave_days: employee.paid_leave_days,
    days_absent,
    overtime_total_units,
    overtime_rate: employee.outlet.overtime_rate,
  });

  const { monthly_balance, closing_balance } = calculateBalance(
    total_pay,
    salary_given,
    previous_balance
  );

  const result = {
    employee_id: id,
    month,
    year,
    days_present,
    days_absent,
    paid_leave_days: employee.paid_leave_days,
    base_pay,
    overtime_total_units,
    overtime_rate_snapshot: Number(employee.outlet.overtime_rate),
    overtime_pay,
    total_pay,
    salary_given,
    previous_balance,
    monthly_balance,
    closing_balance,
    generated_at: existing?.generated_at ?? new Date(),
  };

  return NextResponse.json(result);
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

  const employee = await verifyEmployee(id, profile.org_id);
  if (!employee) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Build the same calculation as GET
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);
  const attendance = await prisma.attendanceRecord.findMany({
    where: { employee_id: id, date: { gte: startDate, lte: endDate } },
  });

  const days_present = attendance.filter((r: { status: string }) => r.status === "present").length;
  const days_absent = attendance.filter((r: { status: string }) => r.status === "absent").length;
  const overtime_total_units = attendance.reduce(
    (sum: number, r: { overtime_units: unknown }) => sum + (r.overtime_units ? Number(r.overtime_units) : 0),
    0
  );

  let prevMonth = month - 1;
  let prevYear = year;
  if (prevMonth === 0) { prevMonth = 12; prevYear -= 1; }

  const prevSummary = await prisma.payrollSummary.findUnique({
    where: { employee_id_month_year: { employee_id: id, month: prevMonth, year: prevYear } },
  });
  const previous_balance = prevSummary ? Number(prevSummary.closing_balance) : 0;

  const payments = await prisma.salaryPayment.findMany({
    where: { employee_id: id, month, year },
  });
  const salary_given = payments.reduce((sum: number, p: { amount: unknown }) => sum + Number(p.amount), 0);

  const { base_pay, overtime_pay, total_pay } = calculatePayroll({
    monthly_salary: employee.monthly_salary,
    paid_leave_days: employee.paid_leave_days,
    days_absent,
    overtime_total_units,
    overtime_rate: employee.outlet.overtime_rate,
  });

  const { monthly_balance, closing_balance } = calculateBalance(
    total_pay,
    salary_given,
    previous_balance
  );

  const summary = await prisma.payrollSummary.upsert({
    where: { employee_id_month_year: { employee_id: id, month, year } },
    create: {
      employee_id: id,
      month,
      year,
      days_present,
      days_absent,
      paid_leave_days: employee.paid_leave_days,
      base_pay,
      overtime_total_units,
      overtime_rate_snapshot: Number(employee.outlet.overtime_rate),
      overtime_pay,
      total_pay,
      salary_given,
      previous_balance,
      monthly_balance,
      closing_balance,
    },
    update: {
      days_present,
      days_absent,
      paid_leave_days: employee.paid_leave_days,
      base_pay,
      overtime_total_units,
      overtime_rate_snapshot: Number(employee.outlet.overtime_rate),
      overtime_pay,
      total_pay,
      salary_given,
      previous_balance,
      monthly_balance,
      closing_balance,
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
    new_value: JSON.stringify({ month, year, total_pay, closing_balance }),
  });

  return NextResponse.json(summary);
}
