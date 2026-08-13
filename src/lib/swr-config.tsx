"use client";

import { preload, SWRConfig } from "swr";

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        revalidateOnFocus: false,
        revalidateOnReconnect: true,
        revalidateIfStale: false,
        dedupingInterval: 15_000,
        keepPreviousData: true,
        errorRetryCount: 1,
      }}
    >
      {children}
    </SWRConfig>
  );
}

export { fetcher, preload };

/** Invalidate payroll caches after payments, attendance, or summary saves */
export async function invalidatePayrollCaches(outletId?: string, employeeId?: string) {
  const { mutate } = await import("swr");
  await mutate(
    (key) => {
      if (typeof key !== "string") return false;
      if (outletId && key.includes(`/api/outlets/${outletId}/payroll`)) return true;
      if (employeeId && key.includes(`/api/employees/${employeeId}/`)) return true;
      return false;
    },
    undefined,
    { revalidate: true }
  );
}

export const swrKeys = {
  outlets: () => "/api/outlets",
  employees: (outletId: string) => `/api/outlets/${outletId}/employees`,
  outletPayroll: (outletId: string, month: number, year: number, forPage: "dashboard" | "payroll" = "dashboard") =>
    `/api/outlets/${outletId}/payroll?month=${month}&year=${year}${forPage === "payroll" ? "&for=payroll" : ""}`,
  me: () => "/api/me",
  salaryAdjustments: () => "/api/settings/salary-adjustments",
  employeeOverview: (employeeId: string, month: number, year: number) =>
    `/api/employees/${employeeId}/overview?month=${month}&year=${year}`,
  attendance: (employeeId: string, month: number, year: number) =>
    `/api/employees/${employeeId}/attendance?month=${month}&year=${year}`,
  auditLogs: (params: URLSearchParams) => `/api/audit-logs?${params.toString()}`,
  users: () => "/api/users",
};
