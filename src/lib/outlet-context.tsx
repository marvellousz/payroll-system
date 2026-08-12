"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export interface OutletOption {
  id: string;
  name: string;
  employee_count: number;
}

interface OutletContextValue {
  outlets: OutletOption[];
  selectedOutletId: string;
  selectedOutlet: OutletOption | null;
  setSelectedOutlet: (id: string) => void;
  refresh: () => void;
  loading: boolean;
}

const STORAGE_KEY = "payroll:selectedOutletId";

const OutletContext = createContext<OutletContextValue | null>(null);

function readStoredOutletId(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeStoredOutletId(id: string) {
  if (typeof window === "undefined") return;
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore quota / private-mode failures
  }
}

export function OutletProvider({ children }: { children: React.ReactNode }) {
  const [outlets, setOutlets] = useState<OutletOption[]>([]);
  const [selectedOutletId, setSelectedOutletId] = useState("");
  const [loading, setLoading] = useState(true);

  const setSelectedOutlet = useCallback((id: string) => {
    setSelectedOutletId(id);
    writeStoredOutletId(id);
  }, []);

  const refresh = useCallback(() => {
    fetch("/api/outlets")
      .then((r) => r.json())
      .then((data) => {
        const list = (Array.isArray(data) ? data : []).map(
          (o: { id: string; name: string; _count?: { employees?: number } }) => ({
            id: o.id,
            name: o.name,
            employee_count: o._count?.employees ?? 0,
          })
        );
        setOutlets(list);
        setSelectedOutletId((prev) => {
          const preferred = prev || readStoredOutletId();
          if (preferred && list.some((o) => o.id === preferred)) {
            writeStoredOutletId(preferred);
            return preferred;
          }
          const fallback = list[0]?.id ?? "";
          writeStoredOutletId(fallback);
          return fallback;
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <OutletContext.Provider
      value={{
        outlets,
        selectedOutletId,
        selectedOutlet: outlets.find((o) => o.id === selectedOutletId) ?? null,
        setSelectedOutlet,
        refresh,
        loading,
      }}
    >
      {children}
    </OutletContext.Provider>
  );
}

export function useOutlets() {
  const ctx = useContext(OutletContext);
  if (!ctx) throw new Error("useOutlets must be used within an OutletProvider");
  return ctx;
}
