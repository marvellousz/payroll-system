"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { swrKeys } from "@/lib/swr-config";
import { prefetchOutletData } from "@/lib/prefetch";

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
    // ignore
  }
}

export function OutletProvider({ children }: { children: React.ReactNode }) {
  const { data, isLoading, mutate } = useSWR<
    Array<{ id: string; name: string; _count?: { employees?: number } }>
  >(swrKeys.outlets());
  const { data: me } = useSWR<{ role: string; outlet_id?: string | null }>(swrKeys.me());
  const isAdmin = me?.role === "admin";

  const outlets = useMemo(
    () =>
      (Array.isArray(data) ? data : []).map((o) => ({
        id: o.id,
        name: o.name,
        employee_count: o._count?.employees ?? 0,
      })),
    [data]
  );

  const [selectedOutletId, setSelectedOutletIdState] = useState("");

  useEffect(() => {
    if (!outlets.length || !me) return;

    // Staff: always locked to their assigned outlet (outlets are independent)
    if (!isAdmin) {
      const locked =
        (me.outlet_id && outlets.some((o) => o.id === me.outlet_id)
          ? me.outlet_id
          : outlets[0]?.id) ?? "";
      setSelectedOutletIdState(locked);
      return;
    }

    setSelectedOutletIdState((prev) => {
      const preferred = prev || readStoredOutletId();
      if (preferred && outlets.some((o) => o.id === preferred)) return preferred;
      const fallback = outlets[0]?.id ?? "";
      writeStoredOutletId(fallback);
      return fallback;
    });
  }, [outlets, me, isAdmin]);

  useEffect(() => {
    if (!selectedOutletId) return;
    prefetchOutletData(selectedOutletId);
  }, [selectedOutletId]);

  const setSelectedOutlet = useCallback(
    (id: string) => {
      // Staff cannot switch outlets
      if (me && me.role !== "admin") return;
      writeStoredOutletId(id);
      setSelectedOutletIdState(id);
    },
    [me]
  );

  const refresh = useCallback(() => {
    void mutate();
  }, [mutate]);

  return (
    <OutletContext.Provider
      value={{
        outlets,
        selectedOutletId,
        selectedOutlet: outlets.find((o) => o.id === selectedOutletId) ?? null,
        setSelectedOutlet,
        refresh,
        loading: (isLoading && outlets.length === 0) || !me,
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
