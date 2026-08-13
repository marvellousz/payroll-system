import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthProfile, isAdmin } from "@/lib/audit";
import DashboardClient from "./DashboardClient";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const profile = await getAuthProfile();
  if (!profile) redirect("/login");
  if (!isAdmin(profile)) redirect("/employees");
  return <DashboardClient />;
}
