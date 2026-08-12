import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthProfile, logAudit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/server";

// DELETE /api/users/:id — remove a user (admin only, cannot delete self)
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getAuthProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (profile.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  if (id === profile.id) {
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
  }

  const target = await prisma.profile.findFirst({
    where: { id, org_id: profile.org_id },
  });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Delete from Supabase auth first
  const supabaseAdmin = await createAdminClient();
  const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(id);
  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 });
  }

  await prisma.profile.delete({ where: { id } });

  await logAudit({
    org_id: profile.org_id,
    user_id: profile.id,
    entity_type: "Profile",
    entity_id: id,
    field_changed: "deleted",
    old_value: target.username,
    new_value: null,
  });

  return NextResponse.json({ success: true });
}
