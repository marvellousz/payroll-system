"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import Dropdown from "@/components/Dropdown";
import { useOutlets } from "@/lib/outlet-context";
import { formatINR } from "@/lib/payroll";
import { createClient } from "@/lib/supabase/client";
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
  details?: string;
  changes?: Array<{ id: string; name: string; from: number; to: number; label: string }>;
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

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatPlainSalary(n: number) {
  return Number.isInteger(n) ? String(n) : String(n);
}

function ChangePasswordCard() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("Fill in all password fields.");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("New password must be different from the current password.");
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user?.email) {
        setError("Could not load your account. Sign in again and retry.");
        return;
      }

      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: userData.user.email,
        password: currentPassword,
      });
      if (verifyError) {
        setError("Current password is incorrect.");
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) {
        setError(updateError.message || "Failed to update password.");
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("Password updated successfully.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card mb-6">
      <h2 className="text-lg font-bold mb-1">Change password</h2>
      <p className="text-secondary text-sm mb-4">
        Update the password for your own login.
      </p>
      <form
        onSubmit={(e) => void handleSubmit(e)}
        style={{ display: "flex", flexDirection: "column", gap: "1.25rem", maxWidth: 420 }}
      >
        {error && <div className="alert alert-danger">{error}</div>}
        {message && <div className="alert alert-success">{message}</div>}
        <div className="form-group">
          <label className="form-label" htmlFor="current-password">Current password</label>
          <input
            id="current-password"
            type="password"
            className="form-input"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="new-password">New password</label>
          <input
            id="new-password"
            type="password"
            className="form-input"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="confirm-password">Confirm new password</label>
          <input
            id="confirm-password"
            type="password"
            className="form-input"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={saving} style={{ alignSelf: "flex-start" }}>
          {saving ? <><span className="spinner" />Updating…</> : "Update password"}
        </button>
      </form>
    </div>
  );
}

export default function SettingsClient() {
  const { data: me } = useSWR<{ role: string }>(swrKeys.me());
  const isAdmin = me?.role === "admin";
  const { selectedOutletId, selectedOutlet } = useOutlets();
  const salaryOutletId = selectedOutletId;
  const otOutletId = selectedOutletId;

  const { data: adjustments, mutate } = useSWR<Adjustment[]>(
    isAdmin && salaryOutletId ? swrKeys.salaryAdjustments(salaryOutletId) : null
  );
  const { data: otAdjustments, mutate: mutateOtAdj } = useSWR<OtAdjustment[]>(
    isAdmin && otOutletId ? swrKeys.overtimeAdjustments(otOutletId) : null
  );

  const { data: employees } = useSWR<OutletEmp[]>(
    isAdmin && salaryOutletId ? swrKeys.employees(salaryOutletId) : null
  );
  const { data: otEmployees, mutate: mutateOtEmployees } = useSWR<OutletEmp[]>(
    isAdmin && otOutletId ? swrKeys.employees(otOutletId) : null
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
  const [otApplyingMonth, setOtApplyingMonth] = useState(false);
  const [otMessage, setOtMessage] = useState("");
  const [otError, setOtError] = useState("");

  const now = new Date();
  const currentMonthLabel = `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;

  useEffect(() => {
    setOtDrafts({});
    setOtMessage("");
    setOtError("");
  }, [otOutletId]);

  useEffect(() => {
    setEmployeeId("");
    setError("");
    setMessage("");
  }, [salaryOutletId]);

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
    if (!salaryOutletId) {
      setError("Select an outlet in the header.");
      return;
    }
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
          outlet_id: salaryOutletId,
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
    setOtApplyingMonth(false);
    try {
      const res = await fetch("/api/settings/overtime-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outlet_id: otOutletId,
          rates,
          apply_current_month: false,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setOtError(body.error || "Failed to save OT rates");
        return;
      }
      setOtDrafts({});
      void mutateOtEmployees();
      void mutateOtAdj();
      void invalidatePayrollCaches(otOutletId);
      const lines = Array.isArray(body.changes)
        ? body.changes.map((c: { name: string; from: number; to: number }) =>
            `${c.name} ${c.from} → ${c.to}`
          )
        : [];
      setOtMessage(
        `Saved standing OT rates (current month unchanged)\n${lines.join("\n")}\nYou can now apply these rates to ${currentMonthLabel}.`
      );
    } finally {
      setOtSaving(false);
    }
  }

  async function applyOtRatesToCurrentMonth() {
    if (!otOutletId || !otEmployees?.length) return;
    setOtError("");
    setOtMessage("");

    // If there are unsaved draft edits, save them first together with apply.
    const draftChanges = otEmployees.some(
      (emp) => Number(otDraftValue(emp)) !== currentOt(emp)
    );
    if (draftChanges) {
      setOtError("Save your OT rate changes first, then apply to the current month.");
      return;
    }

    setOtSaving(true);
    setOtApplyingMonth(true);
    try {
      const res = await fetch("/api/settings/overtime-rates/apply-month", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outlet_id: otOutletId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setOtError(body.error || "Failed to apply OT rates to current month");
        return;
      }
      void mutateOtAdj();
      void invalidatePayrollCaches(otOutletId);
      const lines = Array.isArray(body.lines) ? body.lines : [];
      setOtMessage(
        `Applied standing OT rates to ${currentMonthLabel}\n${lines.join("\n")}`
      );
    } finally {
      setOtSaving(false);
      setOtApplyingMonth(false);
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
          <p className="page-subtitle">
            Account password, employee OT rates, and salary adjustments
          </p>
        </div>
      </div>

      <ChangePasswordCard />

      {isAdmin && (
        <>
      <div className="card mb-6">
        <h2 className="text-lg font-bold mb-1">Overtime rate</h2>
        <p className="text-secondary text-sm mb-4">
          {selectedOutlet
            ? `Per employee · ${selectedOutlet.name}. Save the new standing rate first, then Apply if this month should use it.`
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
              className="mb-4"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
                width: "max-content",
                maxWidth: "100%",
              }}
            >
              {otEmployees.map((emp) => (
                <div
                  key={emp.id}
                  className="flex items-center gap-3"
                  style={{ minHeight: 36 }}
                >
                  <span
                    className="font-bold"
                    style={{ minWidth: "7rem", maxWidth: "10rem" }}
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
                      width: 88,
                      minHeight: 36,
                      padding: "0.35rem 0.5rem",
                      fontVariantNumeric: "tabular-nums",
                      fontWeight: 700,
                      textAlign: "right",
                    }}
                  />
                </div>
              ))}
            </div>

            <div
              className="flex items-center gap-2 flex-wrap"
              style={{ marginTop: "0.25rem" }}
            >
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={otSaving}
                onClick={() => void saveAllOtRates()}
                style={{
                  minHeight: 34,
                  padding: "0.35rem 0.9rem",
                  width: "auto",
                }}
              >
                {otSaving && !otApplyingMonth ? (
                  <>
                    <span className="spinner" style={{ width: 14, height: 14 }} />
                    Saving…
                  </>
                ) : (
                  "Save"
                )}
              </button>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={otSaving}
                onClick={() => void applyOtRatesToCurrentMonth()}
                style={{
                  minHeight: 34,
                  padding: "0.35rem 0.9rem",
                  width: "auto",
                }}
                title={`Recalculate OT pay for ${currentMonthLabel} using saved standing rates`}
              >
                {otSaving && otApplyingMonth ? (
                  <>
                    <span className="spinner" style={{ width: 14, height: 14 }} />
                    Applying…
                  </>
                ) : (
                  "Apply new OT rates for the current month"
                )}
              </button>
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
        <h2 className="text-lg font-bold mb-1">Salary adjustment</h2>
        <p className="text-secondary text-sm mb-4">
          {selectedOutlet
            ? `For ${selectedOutlet.name} only · switch outlet in the header to change another`
            : "Select an outlet in the header"}
        </p>
        <form onSubmit={handleApply} style={{ display: "flex", flexDirection: "column", gap: "1.25rem", maxWidth: 520 }}>
          {error && <div className="alert alert-danger">{error}</div>}
          {message && <div className="alert alert-success">{message}</div>}

          <div className="form-group">
            <label className="form-label">Target</label>
            <div className="segmented" role="group">
              <button type="button" className={`segmented__btn ${scope === "all" ? "active" : ""}`} onClick={() => setScope("all")}>
                All in this outlet
              </button>
              <button type="button" className={`segmented__btn ${scope === "employee" ? "active" : ""}`} onClick={() => setScope("employee")}>
                One employee
              </button>
            </div>
          </div>

          {scope === "employee" && (
            <Dropdown
              value={employeeId}
              onChange={setEmployeeId}
              options={empOptions}
              label="Employee"
              placeholder={salaryOutletId ? "Select employee" : "Select outlet first"}
            />
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

      <h2 className="text-lg font-bold mb-1">Salary adjustment history</h2>
      <p className="text-secondary text-sm mb-4">
        {selectedOutlet ? selectedOutlet.name : "Select an outlet"}
      </p>
      {!salaryOutletId ? (
        <div className="card text-center text-muted" style={{ padding: "2rem" }}>
          Select an outlet to view its salary adjustment history.
        </div>
      ) : !adjustments?.length ? (
        <div className="card text-center text-muted" style={{ padding: "2rem" }}>
          No salary adjustments yet for this outlet.
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Details</th>
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
                  <td className="font-semibold" style={{ whiteSpace: "pre-line" }}>
                    {a.changes?.length
                      ? a.changes
                          .map((c) => `${c.name} ${formatPlainSalary(c.from)} → ${formatPlainSalary(c.to)}`)
                          .join("\n")
                      : a.details ||
                        (a.mode === "percent"
                          ? `${Number(a.value)}%`
                          : formatINR(Number(a.value)))}
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
        </>
      )}
    </div>
  );
}
