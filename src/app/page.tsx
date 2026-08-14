import { redirect } from "next/navigation";
import { getAuthProfile } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const profile = await getAuthProfile();
  redirect(profile ? "/dashboard" : "/login");
}
