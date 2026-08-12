import type { Metadata } from "next";
import OutletsClient from "./OutletsClient";

export const metadata: Metadata = { title: "Outlets" };

export default function OutletsPage() {
  return <OutletsClient />;
}
