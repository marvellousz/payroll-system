import { NextResponse } from "next/server";
import { getAuthProfile } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { computeEmployeePayroll } from "@/lib/payroll-server";

// GET /api/employees/:id/overview?month=&year=
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

  const [computed, payments] = await Promise.all([
    computeEmployeePayroll(id, profile.org_id, month, year),
    prisma.salaryPayment.findMany({
      where: { employee_id: id },
      orderBy: { paid_at: "desc" },
      include: { created_by_profile: { select: { username: true } } },
    }),
  ]);

  if (!computed) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(
    {
      employee: computed.employee,
      payroll: computed.payroll,
      payments,
    },
    {
      headers: {
        "Cache-Control": "private, max-age=20, stale-while-revalidate=90",
      },
    }
  );
}
