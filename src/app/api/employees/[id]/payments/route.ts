import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthProfile, logAudit } from "@/lib/audit";

async function verifyEmployee(employeeId: string, orgId: string) {
  return prisma.employee.findFirst({
    where: { id: employeeId, outlet: { org_id: orgId } },
  });
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

  const where: Record<string, unknown> = { employee_id: id };
  if (month) where.month = month;
  if (year) where.year = year;

  const payments = await prisma.salaryPayment.findMany({
    where,
    orderBy: { paid_at: "desc" },
    include: { created_by_profile: { select: { username: true } } },
  });

  return NextResponse.json(payments);
}

// POST /api/employees/:id/payments — record a salary payment
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getAuthProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const { month, year, amount, paid_at } = body;

  if (!month || !year || amount === undefined) {
    return NextResponse.json({ error: "month, year, and amount are required" }, { status: 400 });
  }
  if (Number(amount) <= 0) {
    return NextResponse.json({ error: "amount must be positive" }, { status: 400 });
  }

  const employee = await verifyEmployee(id, profile.org_id);
  if (!employee) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const payment = await prisma.salaryPayment.create({
    data: {
      employee_id: id,
      month: Number(month),
      year: Number(year),
      amount: Number(amount),
      paid_at: paid_at ? new Date(paid_at) : new Date(),
      created_by: profile.id,
    },
  });

  // Update salary_given in payroll summary if it exists
  await prisma.payrollSummary.updateMany({
    where: { employee_id: id, month: Number(month), year: Number(year) },
    data: {
      salary_given: {
        increment: Number(amount),
      },
    },
  });

  await logAudit({
    org_id: profile.org_id,
    user_id: profile.id,
    entity_type: "SalaryPayment",
    entity_id: payment.id,
    field_changed: "amount",
    old_value: null,
    new_value: String(amount),
  });

  return NextResponse.json(payment, { status: 201 });
}
