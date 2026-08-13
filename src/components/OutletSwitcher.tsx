"use client";

import useSWR from "swr";
import Dropdown from "@/components/Dropdown";
import { useOutlets } from "@/lib/outlet-context";
import { swrKeys } from "@/lib/swr-config";

/** Admin only — staff are locked to one outlet and don't see a switcher. */
export default function OutletSwitcher() {
  const { outlets, selectedOutletId, setSelectedOutlet, loading } = useOutlets();
  const { data: me } = useSWR<{ role: string }>(swrKeys.me());
  const isAdmin = me?.role === "admin";

  // Staff: no outlet picker (one outlet only)
  if (me && !isAdmin) return null;

  if (loading && outlets.length === 0) {
    return <div className="header-switcher header-switcher--placeholder">Loading…</div>;
  }

  if (outlets.length === 0) return null;

  // Wait for role before showing admin switcher
  if (!me) {
    return <div className="header-switcher header-switcher--placeholder">Loading…</div>;
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
