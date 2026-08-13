"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import Dropdown from "@/components/Dropdown";
import { useOutlets } from "@/lib/outlet-context";
import { formatINR } from "@/lib/payroll";
import { invalidatePayrollCaches, swrKeys } from "@/lib/swr-config";

interface Adjustment {
  id: string;
  scope: "employee" | "all";
  employee_id: string | null;
  mode: "percent" | "amount";
  value: string;
  created_at: string;
  undone_at: string | null;
  creator?: { username: string };
}

interface OtAdjustment {
  id: string;
  details: string;
  apply_month: number | null;
  apply_year: number | null;
  created_at: string;
  undone_at: string | null;
  creator?: { username: string };
}

interface OutletEmp {
  id: string;
  name: string;
  monthly_salary: string;
  overtime_rate?: string | number;
}

interface Outlet {
  id: string;
  name: string;
  overtime_rate: string;
  overtime_unit?: string;
  _count?: { employees?: number };
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function SettingsClient() {
  const { data: adjustments, mutate } = useSWR<Adjustment[]>(swrKeys.salaryAdjustments());
  const { data: otAdjustments, mutate: mutateOtAdj } = useSWR<OtAdjustment[]>(
    swrKeys.overtimeAdjustments()
  );
  const { data: outlets } = useSWR<Outlet[]>(swrKeys.outlets());
  const { selectedOutletId, selectedOutlet } = useOutlets();
  const [outletId, setOutletId] = useState("");
  const otOutletId = selectedOutletId;
  const { data: employees } = useSWR<OutletEmp[]>(
    outletId ? swrKeys.employees(outletId) : null
  );
  const { data: otEmployees, mutate: mutateOtEmployees } = useSWR<OutletEmp[]>(
    otOutletId ? swrKeys.employees(otOutletId) : null
  );

  const [scope, setScope] = useState<"all" | "employee">("all");
  const [employeeId, setEmployeeId] = useState("");
  const [mode, setMode] = useState<"percent" | "amount">("percent");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [undoing, setUndoing] = useState<string | null>(null);
  const [otUndoing, setOtUndoing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [otDrafts, setOtDrafts] = useState<Record<string, string>>({});
  const [otSaving, setOtSaving] = useState(false);
  const [otMessage, setOtMessage] = useState("");
  const [otError, setOtError] = useState("");
  const [applyCurrentMonth, setApplyCurrentMonth] = useState(false);

  const now = new Date();
  const currentMonthLabel = `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;

  useEffect(() => {
    const preferred = selectedOutletId || outlets?.[0]?.id || "";
    if (!outletId && preferred) setOutletId(preferred);
  }, [selectedOutletId, outlets, outletId]);

  useEffect(() => {
    setOtDrafts({});
    setOtMessage("");
    setOtError("");
  }, [otOutletId]);

  const outletOptions = useMemo(
    () => (Array.isArray(outlets) ? outlets : []).map((o) => ({ value: o.id, label: o.name })),
    [outlets]
  );
  const empOptions = useMemo(
    () =>
      (Array.isArray(employees) ? employees : []).map((e) => ({
        value: e.id,
        label: `${e.name} (${formatINR(Number(e.monthly_salary))})`,
      })),
    [employees]
  );

  const lastOtChange = otAdjustments?.[0] ?? null;

  async function handleApply(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    if (!value || !Number.isFinite(Number(value))) {
      setError("Enter a valid adjustment value.");
      return;
    }
    if (scope === "employee" && !employeeId) {
      setError("Select an employee.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/settings/salary-adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope,
          employee_id: scope === "employee" ? employeeId : undefined,
          mode,
          value: Number(value),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || "Failed to apply adjustment");
        return;
      }
      setMessage("Salaries updated. You can undo from the history below.");
      setValue("");
      void mutate();
    } finally {
      setSaving(false);
    }
  }

  async function handleUndo(id: string) {
    if (!confirm("Restore previous salaries from this adjustment?")) return;
    setUndoing(id);
    try {
      const res = await fetch(`/api/settings/salary-adjustments/${id}/undo`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        alert(body.error || "Undo failed");
        return;
      }
      void mutate();
    } finally {
      setUndoing(null);
    }
  }

  function otDraftValue(emp: OutletEmp) {
    return otDrafts[emp.id] ?? String(emp.overtime_rate ?? "0");
  }

  function currentOt(emp: OutletEmp) {
    return Number(emp.overtime_rate ?? 0);
  }

  async function saveAllOtRates() {
    if (!otOutletId || !otEmployees?.length) return;
    setOtError("");
    setOtMessage("");

    const rates: Array<{ employee_id: string; overtime_rate: number }> = [];
    for (const emp of otEmployees) {
      const rate = Number(otDraftValue(emp));
      if (!Number.isFinite(rate) || rate < 0) {
        setOtError(`Invalid rate for ${emp.name}`);
        return;
      }
      rates.push({ employee_id: emp.id, overtime_rate: rate });
    }

    const changed = rates.some((r) => {
      const emp = otEmployees.find((e) => e.id === r.employee_id);
      return emp && currentOt(emp) !== r.overtime_rate;
    });
    if (!changed) {
      setOtError("Change at least one OT rate before saving.");
      return;
    }

    setOtSaving(true);
    try {
      const res = await fetch("/api/settings/overtime-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outlet_id: otOutletId,
          rates,
          apply_current_month: applyCurrentMonth,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setOtError(body.error || "Failed to save OT rates");
        return;
      }
      setOtDrafts({});
      setApplyCurrentMonth(false);
      void mutateOtEmployees();
      void mutateOtAdj();
      void invalidatePayrollCaches(otOutletId);
      const lines = Array.isArray(body.changes)
        ? body.changes.map((c: { name: string; from: number; to: number }) =>
            `${c.name} ${c.from} → ${c.to}`
          )
        : [];
      setOtMessage(
        applyCurrentMonth
          ? `Saved · applied to ${currentMonthLabel}\n${lines.join("\n")}`
          : `Saved standing OT rates\n${lines.join("\n")}`
      );
    } finally {
      setOtSaving(false);
    }
  }

  async function handleOtUndo(id: string) {
    if (!confirm("Restore previous OT rates from this change?")) return;
    setOtUndoing(id);
    try {
      const res = await fetch(`/api/settings/overtime-rates/${id}/undo`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        alert(body.error || "Undo failed");
        return;
      }
      void mutateOtAdj();
      void mutateOtEmployees();
      void invalidatePayrollCaches(otOutletId);
      setOtMessage("OT rates restored from last change.");
    } finally {
      setOtUndoing(null);
    }
  }

  return (
    <div className="page-content animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Employee OT rates and salary adjustments</p>
        </div>
      </div>

      <div className="card mb-6">
        <h2 className="text-lg font-bold mb-1">Overtime rate</h2>
        <p className="text-secondary text-sm mb-4">
          {selectedOutlet
            ? `Per employee · ${selectedOutlet.name}`
            : "Select an outlet in the header"}
        </p>

        {otError && <div className="alert alert-danger mb-4">{otError}</div>}
        {otMessage && (
          <div className="alert alert-success mb-4" style={{ whiteSpace: "pre-line" }}>
            {otMessage}
          </div>
        )}

        {!otOutletId ? (
          <p className="text-muted text-sm">Select an outlet from the top bar.</p>
        ) : !otEmployees?.length ? (
          <p className="text-muted text-sm">No employees in this outlet.</p>
        ) : (
          <>
            <div
              className="mb-5"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.65rem",
                maxWidth: 360,
              }}
            >
              {otEmployees.map((emp) => (
                <div
                  key={emp.id}
                  className="flex items-center gap-3"
                  style={{ minHeight: 44 }}
                >
                  <span
                    className="font-bold truncate"
                    style={{ flex: "1 1 auto", minWidth: 0 }}
                    title={emp.name}
                  >
                    {emp.name}
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={50}
                    className="form-input"
                    value={otDraftValue(emp)}
                    onChange={(e) =>
                      setOtDrafts((d) => ({ ...d, [emp.id]: e.target.value }))
                    }
                    aria-label={`OT rate for ${emp.name}`}
                    style={{
                      width: 110,
                      minHeight: 40,
                      fontVariantNumeric: "tabular-nums",
                      fontWeight: 700,
                      textAlign: "right",
                    }}
                  />
                </div>
              ))}
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.85rem",
                maxWidth: 360,
              }}
            >
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={otSaving}
                onClick={() => void saveAllOtRates()}
                style={{ alignSelf: "flex-start" }}
              >
                {otSaving ? (
                  <>
                    <span className="spinner" />
                    Saving…
                  </>
                ) : (
                  "Save"
                )}
              </button>

              <label
                className="flex items-center gap-2 font-semibold text-sm"
                style={{ cursor: "pointer" }}
              >
                <input
                  type="checkbox"
                  checked={applyCurrentMonth}
                  onChange={(e) => setApplyCurrentMonth(e.target.checked)}
                />
                Apply new OT rates for the current month
              </label>
            </div>
          </>
        )}

        {lastOtChange && !lastOtChange.undone_at && (
          <div className="mt-6 flex items-center gap-3 flex-wrap" style={{ maxWidth: 360 }}>
            <span className="text-sm text-secondary">
              Last change{" "}
              {new Date(lastOtChange.created_at).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
              })}
              {lastOtChange.creator?.username
                ? ` · ${lastOtChange.creator.username}`
                : ""}
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={otUndoing === lastOtChange.id}
              onClick={() => void handleOtUndo(lastOtChange.id)}
            >
              {otUndoing === lastOtChange.id ? "Undoing…" : "Undo"}
            </button>
          </div>
        )}
      </div>

      <div className="card mb-6">
        <h2 className="text-lg font-bold mb-4">Salary adjustment</h2>
        <form onSubmit={handleApply} style={{ display: "flex", flexDirection: "column", gap: "1.25rem", maxWidth: 520 }}>
          {error && <div className="alert alert-danger">{error}</div>}
          {message && <div className="alert alert-success">{message}</div>}

          <div className="form-group">
            <label className="form-label">Target</label>
            <div className="segmented" role="group">
              <button type="button" className={`segmented__btn ${scope === "all" ? "active" : ""}`} onClick={() => setScope("all")}>
                All employees
              </button>
              <button type="button" className={`segmented__btn ${scope === "employee" ? "active" : ""}`} onClick={() => setScope("employee")}>
                One employee
              </button>
            </div>
          </div>

          {scope === "employee" && (
            <>
              <Dropdown
                value={outletId}
                onChange={(v) => { setOutletId(v); setEmployeeId(""); }}
                options={outletOptions}
                label="Outlet"
                placeholder="Select outlet"
              />
              <Dropdown
                value={employeeId}
                onChange={setEmployeeId}
                options={empOptions}
                label="Employee"
                placeholder="Select employee"
              />
            </>
          )}

          <div className="form-group">
            <label className="form-label">Mode</label>
            <div className="segmented" role="group">
              <button type="button" className={`segmented__btn ${mode === "percent" ? "active" : ""}`} onClick={() => setMode("percent")}>
                Percent %
              </button>
              <button type="button" className={`segmented__btn ${mode === "amount" ? "active" : ""}`} onClick={() => setMode("amount")}>
                Fixed ₹
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="adj-value">
              {mode === "percent" ? "Percent change (e.g. 10 or -5)" : "Amount change (e.g. 500 or -200)"}
            </label>
            <input
              id="adj-value"
              type="number"
              className="form-input"
              step={mode === "percent" ? 0.1 : 1}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={saving} style={{ alignSelf: "flex-start" }}>
            {saving ? <><span className="spinner" />Applying…</> : "Apply adjustment"}
          </button>
        </form>
      </div>

      <h2 className="text-lg font-bold mb-4">Salary adjustment history</h2>
      {!adjustments?.length ? (
        <div className="card text-center text-muted" style={{ padding: "2rem" }}>
          No salary adjustments yet.
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Scope</th>
                <th>Change</th>
                <th>By</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {adjustments.map((a) => (
                <tr key={a.id}>
                  <td className="text-secondary text-sm">
                    {new Date(a.created_at).toLocaleString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td>{a.scope === "all" ? "All employees" : "One employee"}</td>
                  <td className="font-semibold">
                    {a.mode === "percent"
                      ? `${Number(a.value)}%`
                      : formatINR(Number(a.value))}
                  </td>
                  <td className="text-muted text-sm">{a.creator?.username ?? "—"}</td>
                  <td>
                    {a.undone_at ? (
                      <span className="badge badge-neutral">Undone</span>
                    ) : (
                      <span className="badge badge-success">Active</span>
                    )}
                  </td>
                  <td>
                    {!a.undone_at && (
                      <button
                        className="btn btn-secondary btn-sm"
                        disabled={undoing === a.id}
                        onClick={() => handleUndo(a.id)}
                      >
                        {undoing === a.id ? "Undoing…" : "Undo"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
