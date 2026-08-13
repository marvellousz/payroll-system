import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthProfile, isAdmin } from "@/lib/audit";
import SettingsClient from "./SettingsClient";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const profile = await getAuthProfile();
  if (!profile) redirect("/login");
  if (!isAdmin(profile)) redirect("/employees");
  return <SettingsClient />;
}
