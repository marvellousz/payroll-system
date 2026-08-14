import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canAccessOutlet, getAuthProfile, logAudit } from "@/lib/audit";
import { shouldHideEmployeeMoney } from "@/lib/money-visibility";
import { netSalaryGiven } from "@/lib/payroll-server";

async function verifyEmployee(employeeId: string, orgId: string) {
  return prisma.employee.findFirst({
    where: { id: employeeId, outlet: { org_id: orgId } },
  });
}

function formatPaidAt(d: Date) {
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// GET /api/employees/:id/payments?month=&year=
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

  const employee = await verifyEmployee(id, profile.org_id);
  if (!employee) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canAccessOutlet(profile, employee.outlet_id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const where: Record<string, unknown> = { employee_id: id };
  if (month) where.month = month;
  if (year) where.year = year;

  const payments = await prisma.salaryPayment.findMany({
    where,
    orderBy: { paid_at: "desc" },
    include: { created_by_profile: { select: { username: true } } },
  });

  if (shouldHideEmployeeMoney(profile, employee.salary_hidden)) {
    return NextResponse.json(payments.map((p) => ({ ...p, amount: "0" })));
  }

  return NextResponse.json(payments);
}

// POST /api/employees/:id/payments — record salary payment or repayment
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getAuthProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const { month, year, amount, paid_at, type } = body;
  const paymentType = type === "repayment" ? "repayment" : "salary";
  const roundedAmount = Math.round(Number(amount));

  if (!month || !year || amount === undefined) {
    return NextResponse.json({ error: "month, year, and amount are required" }, { status: 400 });
  }
  if (!Number.isFinite(roundedAmount) || roundedAmount <= 0) {
    return NextResponse.json({ error: "amount must be a positive whole rupee" }, { status: 400 });
  }

  const employee = await verifyEmployee(id, profile.org_id);
  if (!employee) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canAccessOutlet(profile, employee.outlet_id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const paidAt = paid_at ? new Date(paid_at) : new Date();

  const payment = await prisma.salaryPayment.create({
    data: {
      employee_id: id,
      month: Number(month),
      year: Number(year),
      amount: roundedAmount,
      type: paymentType,
      paid_at: paidAt,
      created_by: profile.id,
    },
  });

  // Recompute net salary_given for the month summary if it exists
  const monthPayments = await prisma.salaryPayment.findMany({
    where: { employee_id: id, month: Number(month), year: Number(year) },
    select: { amount: true, type: true },
  });
  const net = netSalaryGiven(monthPayments);
  await prisma.payrollSummary.updateMany({
    where: { employee_id: id, month: Number(month), year: Number(year) },
    data: { salary_given: net },
  });

  const label =
    paymentType === "repayment"
      ? `Repayment received ${formatPaidAt(paidAt)}: ₹${roundedAmount.toLocaleString("en-IN")} (${employee.name})`
      : `Salary paid ${formatPaidAt(paidAt)}: ₹${roundedAmount.toLocaleString("en-IN")} (${employee.name})`;

  await logAudit({
    org_id: profile.org_id,
    user_id: profile.id,
    entity_type: "SalaryPayment",
    entity_id: payment.id,
    field_changed: paymentType,
    old_value: null,
    new_value: label,
    outlet_id: employee.outlet_id,
  });

  return NextResponse.json(payment, { status: 201 });
}
