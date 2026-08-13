import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthProfile, isAdmin, logAudit } from "@/lib/audit";

// GET /api/settings/salary-adjustments — list recent adjustments
export async function GET() {
  const profile = await getAuthProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(profile)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const adjustments = await prisma.salaryAdjustment.findMany({
    where: { org_id: profile.org_id },
    orderBy: { created_at: "desc" },
    take: 50,
    include: {
      creator: { select: { username: true } },
    },
  });

  return NextResponse.json(adjustments);
}

// POST /api/settings/salary-adjustments — apply % or fixed ₹ change
export async function POST(request: Request) {
  const profile = await getAuthProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(profile)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const { scope, employee_id, mode, value } = body as {
    scope?: string;
    employee_id?: string;
    mode?: string;
    value?: number;
  };

  if (scope !== "employee" && scope !== "all") {
    return NextResponse.json({ error: "scope must be employee or all" }, { status: 400 });
  }
  if (mode !== "percent" && mode !== "amount") {
    return NextResponse.json({ error: "mode must be percent or amount" }, { status: 400 });
  }
  if (value === undefined || !Number.isFinite(Number(value))) {
    return NextResponse.json({ error: "value is required" }, { status: 400 });
  }
  if (scope === "employee" && !employee_id) {
    return NextResponse.json({ error: "employee_id is required for employee scope" }, { status: 400 });
  }

  const amount = Number(value);

  const employees =
    scope === "all"
      ? await prisma.employee.findMany({
          where: { outlet: { org_id: profile.org_id } },
          select: { id: true, name: true, monthly_salary: true },
        })
      : await prisma.employee.findMany({
          where: {
            id: employee_id,
            outlet: { org_id: profile.org_id },
          },
          select: { id: true, name: true, monthly_salary: true },
        });

  if (employees.length === 0) {
    return NextResponse.json({ error: "No employees found" }, { status: 404 });
  }

  const snapshot = employees.map((e) => ({
    id: e.id,
    monthly_salary: Number(e.monthly_salary),
  }));

  await prisma.$transaction(
    employees.map((e) => {
      const current = Number(e.monthly_salary);
      const next =
        mode === "percent"
          ? Math.round(current * (1 + amount / 100) * 100) / 100
          : Math.round((current + amount) * 100) / 100;
      return prisma.employee.update({
        where: { id: e.id },
        data: { monthly_salary: Math.max(0, next) },
      });
    })
  );

  const adjustment = await prisma.salaryAdjustment.create({
    data: {
      org_id: profile.org_id,
      scope,
      employee_id: scope === "employee" ? employee_id! : null,
      mode,
      value: amount,
      snapshot: JSON.stringify(snapshot),
      created_by: profile.id,
    },
  });

  const targetLabel =
    scope === "all"
      ? `all employees (${employees.length})`
      : employees[0]?.name ?? "employee";
  const modeLabel = mode === "percent" ? `${amount}%` : `₹${amount.toLocaleString("en-IN")}`;

  await logAudit({
    org_id: profile.org_id,
    user_id: profile.id,
    entity_type: "SalaryAdjustment",
    entity_id: adjustment.id,
    field_changed: "apply",
    old_value: null,
    new_value: `Adjusted ${targetLabel} by ${modeLabel}`,
    highlighted: true,
  });

  // Highlight individual base salary changes for employee scope
  if (scope === "employee" && employees[0]) {
    const e = employees[0];
    const current = Number(e.monthly_salary);
    const next =
      mode === "percent"
        ? Math.round(current * (1 + amount / 100) * 100) / 100
        : Math.round((current + amount) * 100) / 100;
    await logAudit({
      org_id: profile.org_id,
      user_id: profile.id,
      entity_type: "Employee",
      entity_id: e.id,
      field_changed: "monthly_salary",
      old_value: String(current),
      new_value: String(Math.max(0, next)),
      highlighted: true,
    });
  }

  return NextResponse.json(adjustment, { status: 201 });
}
