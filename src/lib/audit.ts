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

/**
 * Get the authenticated user's profile from the current request context.
 * Returns null if unauthenticated.
 */
export async function getAuthProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    include: { org: true },
  });
  return profile;
}
