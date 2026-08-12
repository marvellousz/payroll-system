"use client";

import Dropdown from "@/components/Dropdown";
import { useOutlets } from "@/lib/outlet-context";

export default function OutletSwitcher() {
  const { outlets, selectedOutletId, setSelectedOutlet, loading } = useOutlets();

  if (loading && outlets.length === 0) {
    return <div className="header-switcher header-switcher--placeholder">Loading…</div>;
  }

  if (outlets.length === 0) return null;

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