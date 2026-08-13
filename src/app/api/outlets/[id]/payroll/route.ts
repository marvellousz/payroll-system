import { NextResponse } from "next/server";
import { canAccessOutlet, getAuthProfile } from "@/lib/audit";
import { canViewMoney } from "@/lib/money-visibility";
import { computeOutletPayroll, type PayrollBreakdown } from "@/lib/payroll-server";

function maskPayrollRow(row: PayrollBreakdown): PayrollBreakdown & { salary_masked: true } {
  return {
    ...row,
    base_pay: 0,
    overtime_pay: 0,
    total_pay: 0,
    salary_given: 0,
    previous_balance: 0,
    monthly_balance: 0,
    closing_balance: 0,
    overtime_rate_snapshot: 0,
    salary_masked: true,
  };
}

// GET /api/outlets/:id/payroll?month=&year=
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getAuthProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!canAccessOutlet(profile, id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const month = Number(searchParams.get("month"));
  const year = Number(searchParams.get("year"));

  if (!month || !year) {
    return NextResponse.json({ error: "month and year are required" }, { status: 400 });
  }

  const result = await computeOutletPayroll(id, profile.org_id, month, year, {
    includeHidden: true,
  });
  if (!result) return NextResponse.json({ error: "Outlet not found" }, { status: 404 });

  const showMoney = canViewMoney(profile);
  const employees = result.employees;

  const payroll: Record<string, PayrollBreakdown | (PayrollBreakdown & { salary_masked: true })> = {};
  for (const emp of employees) {
    const row = result.payroll[emp.id];
    if (!row) continue;
    payroll[emp.id] = showMoney ? row : maskPayrollRow(row);
  }

  const safeEmployees = employees.map((e) => {
    if (!showMoney) {
      return { ...e, monthly_salary: "0", overtime_rate: "0", salary_masked: true };
    }
    return { ...e, salary_masked: false };
  });

  return NextResponse.json(
    { employees: safeEmployees, payroll, money_hidden: !showMoney },
    { headers: { "Cache-Control": "private, max-age=20, stale-while-revalidate=90" } }
  );
}
