import type { Metadata } from "next";
import UsersClient from "./UsersClient";

export const metadata: Metadata = { title: "User Management" };

export default function UsersPage() {
  return <UsersClient />;
}
