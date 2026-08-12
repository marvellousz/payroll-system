"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  Banknote,
  ScrollText,
  Building2,
  UserCog,
  LogOut,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: <LayoutDashboard size={20} strokeWidth={2.5} />,
  },
  {
    label: "Employees",
    href: "/employees",
    icon: <Users size={20} strokeWidth={2.5} />,
  },
  {
    label: "Attendance",
    href: "/attendance",
    icon: <CalendarDays size={20} strokeWidth={2.5} />,
  },
  {
    label: "Payroll",
    href: "/payroll",
    icon: <Banknote size={20} strokeWidth={2.5} />,
  },
  {
    label: "Audit Logs",
    href: "/audit",
    icon: <ScrollText size={20} strokeWidth={2.5} />,
  },
  {
    label: "Outlets",
    href: "/outlets",
    icon: <Building2 size={20} strokeWidth={2.5} />,
    adminOnly: true,
  },
  {
    label: "Users",
    href: "/users",
    icon: <UserCog size={20} strokeWidth={2.5} />,
    adminOnly: true,
  },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  role: string;
  username: string;
}

export default function Sidebar({ isOpen, onClose, role, username }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  const visibleItems = navItems.filter((item) => !item.adminOnly || role === "admin");

  return (
    <>
      {isOpen && (
        <div
          className="mobile-overlay visible"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <nav className={`sidebar ${isOpen ? "open" : ""}`} aria-label="Main navigation">
        {/* Brand */}
        <Link href="/dashboard" className="sidebar__logo" onClick={onClose}>
          <div className="sidebar__logo-text">Payroll</div>
        </Link>

        {/* Links */}
        <div className="sidebar__nav">
          {visibleItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar__link ${isActive ? "active" : ""}`}
                onClick={onClose}
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* User Footer */}
        <div className="sidebar__footer">
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.5rem 0.25rem", marginBottom: "0.5rem" }}>
            <div
              style={{
                width: "36px", height: "36px", borderRadius: "50%",
                background: "#3B82F6", display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 800, color: "#FFFFFF", fontSize: "0.9375rem", flexShrink: 0,
              }}
            >
              {username.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "#FFFFFF" }} className="truncate">
                {username}
              </div>
              <div style={{ fontSize: "0.75rem", color: "#9CA3AF", textTransform: "capitalize", fontWeight: 600 }}>
                {role}
              </div>
            </div>
          </div>

          <button
            onClick={handleSignOut}
            className="sidebar__link"
            style={{ width: "100%", background: "none", border: "none", cursor: "pointer", color: "#EF4444" }}
          >
            <LogOut size={20} strokeWidth={2.5} />
            Sign Out
          </button>
        </div>
      </nav>
    </>
  );
}