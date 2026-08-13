import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canAccessOutlet, getAuthProfile, isAdmin } from "@/lib/audit";

// GET /api/outlets/:id/employees
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getAuthProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!canAccessOutlet(profile, id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const employees = await prisma.employee.findMany({
    where: { outlet_id: id, outlet: { org_id: profile.org_id } },
    orderBy: { name: "asc" },
  });

  // Staff: never receive salary / OT rate figures
  const safe = isAdmin(profile)
    ? employees
    : employees.map((e) => ({
        ...e,
        monthly_salary: 0 as unknown as typeof e.monthly_salary,
        overtime_rate: 0 as unknown as typeof e.overtime_rate,
        salary_masked: true,
      }));

  return NextResponse.json(safe, {
    headers: { "Cache-Control": "private, max-age=20, stale-while-revalidate=60" },
  });
}
