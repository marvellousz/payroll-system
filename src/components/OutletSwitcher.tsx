"use client";

import useSWR from "swr";
import Dropdown from "@/components/Dropdown";
import { useOutlets } from "@/lib/outlet-context";
import { swrKeys } from "@/lib/swr-config";

export default function OutletSwitcher() {
  const { outlets, selectedOutletId, setSelectedOutlet, loading, selectedOutlet } = useOutlets();
  const { data: me } = useSWR<{ role: string }>(swrKeys.me());
  const isAdmin = me?.role === "admin";

  if (loading && outlets.length === 0) {
    return <div className="header-switcher header-switcher--placeholder">Loading…</div>;
  }

  if (outlets.length === 0) return null;

  // Staff are locked to their assigned outlet — show name only
  if (!isAdmin) {
    return (
      <div className="header-switcher" style={{ fontWeight: 700, fontSize: "0.9375rem" }}>
        {selectedOutlet?.name ?? outlets[0]?.name ?? "Outlet"}
      </div>
    );
  }

  return (
    <Dropdown
      variant="header"
      value={selectedOutletId}
      onChange={setSelectedOutlet}
      options={outlets.map((o) => ({
        value: o.id,
        label: `${o.name} (${o.employee_count})`,
      }))}
      placeholder="Select outlet"
    />
  );
}
