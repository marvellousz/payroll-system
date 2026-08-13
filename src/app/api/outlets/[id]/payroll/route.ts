import { NextResponse } from "next/server";
import { canAccessOutlet, getAuthProfile, isAdmin } from "@/lib/audit";
import { computeOutletPayroll } from "@/lib/payroll-server";

// GET /api/outlets/:id/payroll?month=&year=&for=dashboard|payroll
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
  const forPage = searchParams.get("for") === "payroll" ? "payroll" : "dashboard";

  if (!month || !year) {
    return NextResponse.json({ error: "month and year are required" }, { status: 400 });
  }

  const result = await computeOutletPayroll(id, profile.org_id, month, year, {
    includeHidden: true,
  });
  if (!result) return NextResponse.json({ error: "Outlet not found" }, { status: 404 });

  // Overview: never show salary_hidden employees
  // Payroll: admin sees all; staff only non-hidden
  let employees = result.employees;
  if (forPage === "dashboard") {
    employees = employees.filter((e) => !e.salary_hidden);
  } else if (!isAdmin(profile)) {
    employees = employees.filter((e) => !e.salary_hidden);
  }

  const payroll: typeof result.payroll = {};
  for (const emp of employees) {
    const row = result.payroll[emp.id];
    if (!row) continue;
    // Staff: mask salary figures for hidden (already filtered) — also mask monthly_salary on list
    if (!isAdmin(profile) && emp.salary_hidden) continue;
    payroll[emp.id] = row;
  }

  const safeEmployees = isAdmin(profile)
    ? employees
    : employees.map((e) =>
        e.salary_hidden
          ? { ...e, monthly_salary: "0" }
          : e
      );

  return NextResponse.json(
    { employees: safeEmployees, payroll },
    { headers: { "Cache-Control": "private, max-age=20, stale-while-revalidate=90" } }
  );
}
