import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthProfile, logAudit } from "@/lib/audit";

// GET /api/outlets/:id/employees
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getAuthProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Verify outlet belongs to org
  const outlet = await prisma.outlet.findFirst({
    where: { id, org_id: profile.org_id },
  });
  if (!outlet) return NextResponse.json({ error: "Outlet not found" }, { status: 404 });

  const employees = await prisma.employee.findMany({
    where: { outlet_id: id },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(employees);
}
