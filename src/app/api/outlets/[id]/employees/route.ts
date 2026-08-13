import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthProfile } from "@/lib/audit";

// GET /api/outlets/:id/employees
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getAuthProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const employees = await prisma.employee.findMany({
    where: { outlet_id: id, outlet: { org_id: profile.org_id } },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(employees, {
    headers: { "Cache-Control": "private, max-age=20, stale-while-revalidate=60" },
  });
}
