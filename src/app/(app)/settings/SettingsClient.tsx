"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import Dropdown from "@/components/Dropdown";
import { formatINR } from "@/lib/payroll";
import { swrKeys } from "@/lib/swr-config";

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

interface OutletEmp {
  id: string;
  name: string;
  monthly_salary: string;
}

interface Outlet {
  id: string;
  name: string;
}

export default function SettingsClient() {
  const { data: adjustments, mutate } = useSWR<Adjustment[]>(swrKeys.salaryAdjustments());
  const { data: outlets } = useSWR<Outlet[]>(swrKeys.outlets());
  const [outletId, setOutletId] = useState("");
  const { data: employees } = useSWR<OutletEmp[]>(
    outletId ? swrKeys.employees(outletId) : null
  );

  const [scope, setScope] = useState<"all" | "employee">("all");
  const [employeeId, setEmployeeId] = useState("");
  const [mode, setMode] = useState<"percent" | "amount">("percent");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [undoing, setUndoing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

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

  return (
    <div className="page-content animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Adjust employee salaries by percent or amount, with undo</p>
        </div>
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

      <h2 className="text-lg font-bold mb-4">Adjustment history</h2>
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
