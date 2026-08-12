import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthProfile } from "@/lib/audit";

// GET /api/audit-logs?entity_type=&entity_id=&user_id=&date_from=&date_to=&page=&limit=
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

  const where: Record<string, unknown> = { org_id: profile.org_id };
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
      },
    }),
  ]);

  return NextResponse.json({ logs, total, page, limit, pages: Math.ceil(total / limit) });
}
