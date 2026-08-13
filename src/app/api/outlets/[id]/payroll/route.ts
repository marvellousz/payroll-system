import { NextResponse } from "next/server";
import { getAuthProfile } from "@/lib/audit";
import { computeOutletPayroll } from "@/lib/payroll-server";

// GET /api/outlets/:id/payroll?month=&year=
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

  const result = await computeOutletPayroll(id, profile.org_id, month, year);
  if (!result) return NextResponse.json({ error: "Outlet not found" }, { status: 404 });

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "private, max-age=20, stale-while-revalidate=90",
    },
  });
}
