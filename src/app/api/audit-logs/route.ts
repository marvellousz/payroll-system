import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canAccessOutlet, getAuthProfile, isAdmin, logAudit } from "@/lib/audit";
import { redactAuditMoney } from "@/lib/money-visibility";

function parseOutletIds(searchParams: URLSearchParams): string[] {
  const multi = searchParams.getAll("outlet_id").filter(Boolean);
  const csv = searchParams.get("outlet_ids");
  if (csv) {
    return [...new Set([...multi, ...csv.split(",").map((s) => s.trim()).filter(Boolean)])];
  }
  return [...new Set(multi)];
}

// GET /api/audit-logs?outlet_ids=a,b&outlet_id=&entity_type=&date_from=&date_to=&page=&limit=
export async function GET(request: Request) {
  const profile = await getAuthProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const entity_type = searchParams.get("entity_type");
  const entity_id = searchParams.get("entity_id");
  const user_id = searchParams.get("user_id");
  const date_from = searchParams.get("date_from");
  const date_to = searchParams.get("date_to");
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const limit = Math.min(100, Math.max(10, Number(searchParams.get("limit") ?? 50)));
  const wantAll = searchParams.get("all") === "1" || searchParams.get("all") === "true";

  let outletIds = parseOutletIds(searchParams);

  if (wantAll && isAdmin(profile)) {
    const allOutlets = await prisma.outlet.findMany({
      where: { org_id: profile.org_id },
      select: { id: true },
    });
    outletIds = allOutlets.map((o) => o.id);
  }

  if (outletIds.length === 0) {
    return NextResponse.json({ error: "Select at least one outlet" }, { status: 400 });
  }

  for (const id of outletIds) {
    if (!canAccessOutlet(profile, id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const outlets = await prisma.outlet.findMany({
    where: { id: { in: outletIds }, org_id: profile.org_id },
    select: { id: true },
  });
  if (outlets.length === 0) {
    return NextResponse.json({ error: "Outlet not found" }, { status: 404 });
  }
  const allowedIds = outlets.map((o) => o.id);

  const where: Record<string, unknown> = {
    org_id: profile.org_id,
    outlet_id: allowedIds.length === 1 ? allowedIds[0] : { in: allowedIds },
  };
  if (entity_type) where.entity_type = entity_type;
  if (entity_id) where.entity_id = entity_id;
  if (user_id) where.user_id = user_id;
  if (date_from || date_to) {
    where.timestamp = {
      ...(date_from ? { gte: new Date(date_from) } : {}),
      ...(date_to ? { lte: new Date(date_to) } : {}),
    };
  }

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        user: { select: { username: true, email: true } },
        outlet: { select: { id: true, name: true } },
      },
    }),
  ]);

  return NextResponse.json(
    {
      logs: isAdmin(profile) ? logs : logs.map(redactAuditMoney),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    },
    { headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=30" } }
  );
}

function formatRangeDate(d: Date) {
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// DELETE /api/audit-logs?outlet_ids= — admin only; deletes logs older than 1 year for selected outlets
export async function DELETE(request: Request) {
  const profile = await getAuthProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(profile)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const wantAll = searchParams.get("all") === "1" || searchParams.get("all") === "true";
  let outletIds = parseOutletIds(searchParams);

  if (wantAll) {
    const allOutlets = await prisma.outlet.findMany({
      where: { org_id: profile.org_id },
      select: { id: true },
    });
    outletIds = allOutlets.map((o) => o.id);
  }

  if (outletIds.length === 0) {
    return NextResponse.json({ error: "Select at least one outlet" }, { status: 400 });
  }

  const outlets = await prisma.outlet.findMany({
    where: { id: { in: outletIds }, org_id: profile.org_id },
    select: { id: true },
  });
  if (outlets.length === 0) {
    return NextResponse.json({ error: "Outlet not found" }, { status: 404 });
  }
  const allowedIds = outlets.map((o) => o.id);

  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 1);

  const oldLogs = await prisma.auditLog.findMany({
    where: {
      org_id: profile.org_id,
      outlet_id: { in: allowedIds },
      timestamp: { lt: cutoff },
    },
    select: { id: true, timestamp: true },
    orderBy: { timestamp: "asc" },
  });

  if (oldLogs.length === 0) {
    return NextResponse.json({
      deleted: 0,
      message: "No logs older than 1 year to delete for the selected outlets",
    });
  }

  const from = oldLogs[0]!.timestamp;
  const to = oldLogs[oldLogs.length - 1]!.timestamp;
  const ids = oldLogs.map((l) => l.id);

  await prisma.auditLog.deleteMany({
    where: { id: { in: ids } },
  });

  const summary = `Logs deleted from ${formatRangeDate(from)} to ${formatRangeDate(to)}`;

  await logAudit({
    org_id: profile.org_id,
    user_id: profile.id,
    entity_type: "AuditLog",
    entity_id: allowedIds[0]!,
    field_changed: "deleted_range",
    old_value: String(ids.length),
    new_value: summary,
    highlighted: true,
    outlet_id: allowedIds[0]!,
  });

  return NextResponse.json({ deleted: ids.length, message: summary });
}
