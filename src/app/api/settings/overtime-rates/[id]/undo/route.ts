import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthProfile, isAdmin, logAudit } from "@/lib/audit";
import { saveEmployeePayrollSummary } from "@/lib/payroll-server";

type SnapshotRow = { id: string; name: string; overtime_rate: number };

// POST /api/settings/overtime-rates/:id/undo — restore previous OT rates (admin)
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getAuthProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(profile)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const adjustment = await prisma.overtimeRateAdjustment.findFirst({
    where: { id, org_id: profile.org_id },
  });

  if (!adjustment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (adjustment.undone_at) {
    return NextResponse.json({ error: "Already undone" }, { status: 400 });
  }

  let snapshot: SnapshotRow[] = [];
  try {
    snapshot = JSON.parse(adjustment.snapshot) as SnapshotRow[];
  } catch {
    return NextResponse.json({ error: "Invalid snapshot data" }, { status: 500 });
  }

  await prisma.$transaction(async (tx) => {
    for (const row of snapshot) {
      await tx.employee.updateMany({
        where: { id: row.id, outlet: { org_id: profile.org_id } },
        data: { overtime_rate: row.overtime_rate },
      });
    }
    await tx.overtimeRateAdjustment.update({
      where: { id },
      data: { undone_at: new Date() },
    });
  });

  // If that change had applied OT to a month, re-lock payroll with restored rates
  if (adjustment.apply_month && adjustment.apply_year) {
    for (const row of snapshot) {
      await saveEmployeePayrollSummary(
        row.id,
        profile.org_id,
        adjustment.apply_month,
        adjustment.apply_year,
        { forceNewOtRate: true }
      );
    }
  }

  await logAudit({
    org_id: profile.org_id,
    user_id: profile.id,
    entity_type: "OvertimeRateAdjustment",
    entity_id: id,
    field_changed: "undo",
    old_value: adjustment.details,
    new_value: `Undid OT rate change (${snapshot.length} employee${snapshot.length === 1 ? "" : "s"} restored)`,
    highlighted: true,
  });

  return NextResponse.json({ success: true });
}
