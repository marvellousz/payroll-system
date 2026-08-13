"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import Sidebar from "./Sidebar";
import OutletSwitcher from "./OutletSwitcher";
import { OutletProvider } from "@/lib/outlet-context";
import { SWRProvider } from "@/lib/swr-config";

interface AppShellProps {
  children: React.ReactNode;
  role: string;
  username: string;
}

export default function AppShell({ children, role, username }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <SWRProvider>
      <OutletProvider>
        <div className="app-layout">
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          role={role}
          username={username}
        />

        <div className="main-content">
          {/* Top bar: outlet selector + org context */}
          <header className="main-header">
            <button
              className="mobile-menu-btn"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={22} strokeWidth={2.5} />
            </button>

            <OutletSwitcher />
          </header>

          <main style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            {children}
          </main>
        </div>
        </div>
      </OutletProvider>
    </SWRProvider>
  );
}