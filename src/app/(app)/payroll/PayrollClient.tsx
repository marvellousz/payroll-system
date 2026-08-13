"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useOutlets } from "@/lib/outlet-context";
import { formatINR } from "@/lib/payroll";
import { invalidatePayrollCaches, swrKeys } from "@/lib/swr-config";
import { prefetchOutletData } from "@/lib/prefetch";

interface Employee { id: string; name: string; monthly_salary: string; paid_leave_days: number; }
interface PayrollData {
  days_present: number; days_absent: number; days_half: number; paid_leave_days: number;
  payable_days: number;
  base_pay: number; overtime_pay: number; overtime_total_units: number;
  overtime_rate_snapshot: number; total_pay: number; salary_given: number;
  previous_balance: number; monthly_balance: number; closing_balance: number;
}

const MONTHS = ["January","February","March","April","May","June",
  "July","August","September","October","November","December"];

function PaymentModal({ employee, month, year, onClose, onSuccess }: {
  employee: Employee; month: number; year: number;
  onClose: () => void; onSuccess: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<"salary" | "repayment">("salary");
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) { setError("Enter a valid amount."); return; }
    setSaving(true);
    const res = await fetch(`/api/employees/${employee.id}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        month,
        year,
        amount: Number(amount),
        type,
        paid_at: paidAt,
      }),
    });
    setSaving(false);
    if (res.ok) { onSuccess(); onClose(); }
    else { const d = await res.json(); setError(d.error); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Record Payment</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>
        <p className="text-secondary text-sm mb-4">
          For <strong>{employee.name}</strong> · {MONTHS[month-1]} {year}
        </p>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {error && <div className="alert alert-danger">{error}</div>}
          <div className="form-group">
            <label className="form-label">Type</label>
            <div className="segmented" role="group">
              <button type="button" className={`segmented__btn ${type === "salary" ? "active" : ""}`} onClick={() => setType("salary")}>
                Salary payment
              </button>
              <button type="button" className={`segmented__btn ${type === "repayment" ? "active" : ""}`} onClick={() => setType("repayment")}>
                Repayment received
              </button>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="payment-date">Date</label>
            <input id="payment-date" type="date" className="form-input" value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="payment-amount">Amount (₹)</label>
            <input id="payment-amount" type="number" className="form-input" min={1} step={100}
              value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus required />
          </div>
          <div className="modal-footer" style={{ border: "none", padding: 0, margin: 0 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <><span className="spinner"/>Recording…</> : type === "repayment" ? "Record Repayment" : "Record Payment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function PayrollClient() {
  const { selectedOutletId } = useOutlets();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [paymentFor, setPaymentFor] = useState<Employee | null>(null);

  const { data, isLoading, isValidating, mutate } = useSWR<{
    employees: Employee[];
    payroll: Record<string, PayrollData>;
  }>(
    selectedOutletId ? swrKeys.outletPayroll(selectedOutletId, month, year, "payroll") : null
  );

  const employees = data?.employees ?? [];
  const payrollMap = data?.payroll ?? {};
  const showSkeleton = isLoading && !data;

  useEffect(() => {
    if (!selectedOutletId) return;
    prefetchOutletData(selectedOutletId, month, year);
  }, [selectedOutletId, month, year]);

  async function refreshPayroll() {
    await mutate();
    if (selectedOutletId) await invalidatePayrollCaches(selectedOutletId);
  }

  async function finalizePayroll(emp: Employee) {
    await fetch(`/api/employees/${emp.id}/payroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month, year }),
    });
    await refreshPayroll();
  }

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  }

  return (
    <div className="page-content animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Payroll</h1>
          <p className="page-subtitle">Monthly salary breakdown and payments</p>
        </div>
        <div className="month-nav">
          <button className="btn btn-ghost btn-icon" onClick={prevMonth} aria-label="Previous month">
            <ChevronLeft size={18} strokeWidth={2.5} />
          </button>
          <span className="month-nav__label font-semibold">
            {MONTHS[month-1]} {year}
            {isValidating && data ? " …" : ""}
          </span>
          <button className="btn btn-ghost btn-icon" onClick={nextMonth} aria-label="Next month">
            <ChevronRight size={18} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {showSkeleton ? (
        <div className="flex items-center justify-center" style={{ padding: "4rem" }}>
          <span className="spinner spinner-lg" />
        </div>
      ) : employees.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state__title">No employees in this outlet</p>
          <p className="empty-state__desc">Add employees to view payroll.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {employees.map((emp) => {
            const p = payrollMap[emp.id];
            return (
              <div key={emp.id} className="card">
                {/* Employee header */}
                <div className="card-header-row" style={{ marginBottom: "1.25rem" }}>
                  <div className="flex items-center gap-3" style={{ minWidth: 0 }}>
                    <div style={{
                      width: "42px", height: "42px", borderRadius: "50%",
                      background: "var(--color-primary)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontWeight: 700, color: "#fff", fontSize: "1.0625rem", flexShrink: 0,
                    }}>
                      {emp.name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className="font-semibold truncate" style={{ fontSize: "1.0625rem" }}>{emp.name}</div>
                      <div className="text-muted text-sm">Monthly: {formatINR(Number(emp.monthly_salary))}</div>
                    </div>
                  </div>
                  <div className="card-header-row__actions">
                    <button className="btn btn-secondary btn-sm" onClick={() => setPaymentFor(emp)}>
                      + Record Payment / Repayment
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => finalizePayroll(emp)} title="Save/finalize payroll summary">
                      Save Summary
                    </button>
                  </div>
                </div>

                {p ? (
                  <div className="payroll-split">
                    {/* Pay Breakdown */}
                    <div>
                      <div className="text-muted text-xs font-semibold mb-3" style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        Pay Breakdown
                      </div>
                      <div className="payroll-line"><span className="text-secondary text-sm">Days Present</span><span>{p.days_present}</span></div>
                      <div className="payroll-line"><span className="text-secondary text-sm">Half Days</span><span>{p.days_half}</span></div>
                      <div className="payroll-line"><span className="text-secondary text-sm">Days Absent (incl. unmarked)</span><span>{p.days_absent}</span></div>
                      <div className="payroll-line"><span className="text-secondary text-sm">Paid Leave</span><span>{p.paid_leave_days} days</span></div>
                      <div className="payroll-line"><span className="text-secondary text-sm">Payable Days</span><span>{p.payable_days}</span></div>
                      <div className="payroll-line"><span className="text-secondary text-sm">Base Pay</span><span className="payroll-line__amount">{formatINR(p.base_pay)}</span></div>
                      <div className="payroll-line">
                        <span className="text-secondary text-sm">Overtime Pay
                          <span className="text-muted" style={{ fontSize: "0.75rem", display: "block" }}>
                            {p.overtime_total_units} units × {formatINR(p.overtime_rate_snapshot)}
                          </span>
                        </span>
                        <span className="payroll-line__amount">{formatINR(p.overtime_pay)}</span>
                      </div>
                      <div className="payroll-line total divider">
                        <span>Total Pay</span>
                        <span className="payroll-line__amount amount-positive">{formatINR(p.total_pay)}</span>
                      </div>
                    </div>

                    {/* Balance */}
                    <div>
                      <div className="text-muted text-xs font-semibold mb-3" style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        Balance
                      </div>
                      <div className="payroll-line">
                        <span className="text-secondary text-sm">Total Pay</span>
                        <span className="payroll-line__amount">{formatINR(p.total_pay)}</span>
                      </div>
                      <div className="payroll-line">
                        <span className="text-secondary text-sm">Salary Given</span>
                        <span className="payroll-line__amount">{formatINR(p.salary_given)}</span>
                      </div>
                      <div className="payroll-line">
                        <span className="text-secondary text-sm">Monthly Balance</span>
                        <span className={`payroll-line__amount ${p.monthly_balance >= 0 ? "amount-positive" : "amount-negative"}`}>
                          {formatINR(p.monthly_balance)}
                        </span>
                      </div>
                      <div className="payroll-line">
                        <span className="text-secondary text-sm">Previous Balance</span>
                        <span className={`payroll-line__amount ${p.previous_balance >= 0 ? "" : "amount-negative"}`}>
                          {formatINR(p.previous_balance)}
                        </span>
                      </div>
                      <div className="payroll-line total divider">
                        <span>Closing Balance</span>
                        <span className={`payroll-line__amount ${p.closing_balance >= 0 ? "amount-positive" : "amount-negative"}`}>
                          {formatINR(p.closing_balance)}
                        </span>
                      </div>
                      <div style={{ marginTop: "0.75rem" }}>
                        {p.closing_balance > 0 && <span className="badge badge-warning">₹{Math.abs(p.closing_balance).toLocaleString("en-IN")} owed to employee</span>}
                        {p.closing_balance < 0 && <span className="badge badge-danger">₹{Math.abs(p.closing_balance).toLocaleString("en-IN")} advance paid</span>}
                        {p.closing_balance === 0 && <span className="badge badge-success">Fully settled</span>}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-muted text-sm">No attendance data for this month. Mark attendance first.</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Payment modal */}
      {paymentFor && (
        <PaymentModal
          employee={paymentFor}
          month={month} year={year}
          onClose={() => setPaymentFor(null)}
          onSuccess={refreshPayroll}
        />
      )}
    </div>
  );
}
