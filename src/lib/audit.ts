import { cache } from "react";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export interface AuditLogParams {
  org_id: string;
  user_id: string;
  entity_type: string;
  entity_id: string;
  field_changed?: string;
  old_value?: string | null;
  new_value?: string | null;
}

export async function logAudit(params: AuditLogParams) {
  try {
    await prisma.auditLog.create({
      data: {
        org_id: params.org_id,
        user_id: params.user_id,
        entity_type: params.entity_type,
        entity_id: params.entity_id,
        field_changed: params.field_changed ?? null,
        old_value:
          params.old_value !== undefined
            ? String(params.old_value ?? "")
            : null,
        new_value:
          params.new_value !== undefined
            ? String(params.new_value ?? "")
            : null,
      },
    });
  } catch (error) {
    // Audit failures should never block the main operation
    console.error("[AuditLog] Failed to write audit entry:", error);
  }
}

const PROFILE_SELECT = {
  id: true,
  org_id: true,
  email: true,
  username: true,
  role: true,
} as const;

const getCachedProfile = unstable_cache(
  async (userId: string) =>
    prisma.profile.findUnique({
      where: { id: userId },
      select: PROFILE_SELECT,
    }),
  ["auth-profile"],
  { revalidate: 60 }
);

/**
 * Authenticated profile for the current request.
 * Verifies the JWT locally (getClaims) instead of calling the Auth API,
 * and caches the Prisma profile for 60s.
 */
export const getAuthProfile = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId || typeof userId !== "string") return null;
  return getCachedProfile(userId);
});
