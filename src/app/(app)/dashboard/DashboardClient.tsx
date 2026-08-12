"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, Building2, Users } from "lucide-react";
import { useOutlets } from "@/lib/outlet-context";
import { formatINR } from "@/lib/payroll";

interface Employee {
  id: string;
  name: string;
  monthly_salary: string;
  paid_leave_days: number;
}

interface PayrollData {
  days_present: number;
  days_absent: number;
  paid_leave_days: number;
  base_pay: number;
  overtime_pay: number;
  total_pay: number;
  salary_given: number;
  previous_balance: number;
  monthly_balance: number;
  closing_balance: number;
}

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

export default function DashboardClient() {
  const { outlets, selectedOutletId, loading } = useOutlets();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [payrollMap, setPayrollMap] = useState<Record<string, PayrollData>>({});
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [loadingPayroll, setLoadingPayroll] = useState(false);

  useEffect(() => {
    if (!selectedOutletId) return;
    setLoadingEmployees(true);
    fetch(`/api/outlets/${selectedOutletId}/employees`)
      .then((r) => r.json())
      .then((data) => setEmployees(data))
      .catch(console.error)
      .finally(() => setLoadingEmployees(false));
  }, [selectedOutletId]);

  const fetchPayroll = useCallback(async () => {
    if (!employees.length) { setPayrollMap({}); return; }
    setLoadingPayroll(true);
    const results: Record<string, PayrollData> = {};
    await Promise.all(
      employees.map(async (emp) => {
        try {
          const res = await fetch(
            `/api/employees/${emp.id}/payroll?month=${month}&year=${year}`
          );
          if (res.ok) results[emp.id] = await res.json();
        } catch { /* ignore */ }
      })
    );
    setPayrollMap(results);
    setLoadingPayroll(false);
  }, [employees, month, year]);

  useEffect(() => { fetchPayroll(); }, [fetchPayroll]);

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  }

  const totalPayroll = Object.values(payrollMap).reduce((s, p) => s + p.total_pay, 0);
  const totalGiven   = Object.values(payrollMap).reduce((s, p) => s + p.salary_given, 0);
  const totalBalance = Object.values(payrollMap).reduce((s, p) => s + p.closing_balance, 0);

  return (
    <div className="page-content">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Monthly payroll overview & balance summary</p>
        </div>

        {/* Month Selector */}
        <div className="month-nav">
          <button className="btn btn-ghost btn-icon" onClick={prevMonth} aria-label="Previous month">
            <ChevronLeft size={18} strokeWidth={2.5} />
          </button>
          <span className="month-nav__label">
            {MONTHS[month - 1]} {year}
          </span>
          <button className="btn btn-ghost btn-icon" onClick={nextMonth} aria-label="Next month">
            <ChevronRight size={18} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {!loading && outlets.length === 0 && (
        <div className="empty-state">
          <div className="empty-state__icon">
            <Building2 size={32} strokeWidth={2} />
          </div>
          <p className="empty-state__title">No outlets configured</p>
          <p className="empty-state__desc">Create an outlet to start managing employees and payroll.</p>
          <a href="/outlets" className="btn btn-primary mt-4">Add Outlet</a>
        </div>
      )}

      {/* Summary Color-Block Stat Cards */}
      {selectedOutletId && employees.length > 0 && (
        <>
          <div className="grid-3 mb-6">
            <div className="card-flat-blue">
              <div className="stat-card__label text-blue">Total Payroll</div>
              <div className="stat-card__value text-blue">{formatINR(totalPayroll)}</div>
              <div className="stat-card__sub">{MONTHS[month-1]} {year}</div>
            </div>

            <div className="card-flat-emerald">
              <div className="stat-card__label text-emerald">Total Given</div>
              <div className="stat-card__value text-emerald">{formatINR(totalGiven)}</div>
              <div className="stat-card__sub">Salary disbursed</div>
            </div>

            <div className="card-flat-amber">
              <div className="stat-card__label text-amber">Net Balance</div>
              <div className="stat-card__value text-amber">{formatINR(totalBalance)}</div>
              <div className="stat-card__sub">
                {totalBalance >= 0 ? "Owed to employees" : "Advance paid"}
              </div>
            </div>
          </div>

          {/* Employee Breakdown List */}
          {loadingEmployees || loadingPayroll ? (
            <div className="flex items-center justify-center" style={{ padding: "4rem" }}>
              <span className="spinner spinner-lg" />
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {employees.map((emp) => {
                const p = payrollMap[emp.id];
                return (
                  <div key={emp.id} className="card">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-4 pb-4 border-b">
                      <div className="flex items-center gap-3">
                        <div
                          style={{
                            width: "44px", height: "44px", borderRadius: "50%",
                            background: "#3B82F6", color: "#FFFFFF",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontWeight: 800, fontSize: "1.125rem", flexShrink: 0,
                          }}
                        >
                          {emp.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-bold text-lg">{emp.name}</div>
                          <div className="text-secondary text-sm font-medium">
                            Monthly: {formatINR(Number(emp.monthly_salary))} · Paid Leave: {emp.paid_leave_days}d
                          </div>
                        </div>
                      </div>
                      <a href={`/employees/${emp.id}`} className="btn btn-secondary btn-sm">
                        View Details →
                      </a>
                    </div>

                    {p ? (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
                        {/* Pay Breakdown */}
                        <div>
                          <div className="text-muted text-xs font-bold uppercase mb-2">
                            Pay Breakdown
                          </div>
                          <div className="payroll-line">
                            <span className="text-secondary">Days Present</span>
                            <span className="font-bold">{p.days_present}</span>
                          </div>
                          <div className="payroll-line">
                            <span className="text-secondary">Days Absent</span>
                            <span className="font-bold">{p.days_absent}</span>
                          </div>
                          <div className="payroll-line">
                            <span className="text-secondary">Paid Leave</span>
                            <span className="font-bold">{p.paid_leave_days}d</span>
                          </div>
                          <div className="payroll-line">
                            <span className="text-secondary">Base Pay</span>
                            <span className="payroll-line__amount">{formatINR(p.base_pay)}</span>
                          </div>
                          <div className="payroll-line">
                            <span className="text-secondary">Overtime Pay</span>
                            <span className="payroll-line__amount">{formatINR(p.overtime_pay)}</span>
                          </div>
                          <div className="payroll-line total divider">
                            <span>Total Pay</span>
                            <span className="payroll-line__amount amount-positive">{formatINR(p.total_pay)}</span>
                          </div>
                        </div>

                        {/* Balance */}
                        <div>
                          <div className="text-muted text-xs font-bold uppercase mb-2">
                            Balance Summary
                          </div>
                          <div className="payroll-line">
                            <span className="text-secondary">Salary Given</span>
                            <span className="payroll-line__amount">{formatINR(p.salary_given)}</span>
                          </div>
                          <div className="payroll-line">
                            <span className="text-secondary">Previous Balance</span>
                            <span className={`payroll-line__amount ${p.previous_balance >= 0 ? "" : "amount-negative"}`}>
                              {formatINR(p.previous_balance)}
                            </span>
                          </div>
                          <div className="payroll-line total divider">
                            <span>Current Balance</span>
                            <span className={`payroll-line__amount ${p.closing_balance >= 0 ? "amount-positive" : "amount-negative"}`}>
                              {formatINR(p.closing_balance)}
                            </span>
                          </div>
                          <div style={{ marginTop: "1rem" }}>
                            {p.closing_balance > 0 && (
                              <span className="badge badge-warning">₹{Math.abs(p.closing_balance).toLocaleString("en-IN")} Owed</span>
                            )}
                            {p.closing_balance < 0 && (
                              <span className="badge badge-danger">₹{Math.abs(p.closing_balance).toLocaleString("en-IN")} Advance</span>
                            )}
                            {p.closing_balance === 0 && (
                              <span className="badge badge-success">Fully Settled</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-secondary text-sm font-medium">No attendance data for this month.</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {selectedOutletId && employees.length === 0 && !loadingEmployees && (
        <div className="empty-state">
          <div className="empty-state__icon">
            <Users size={32} strokeWidth={2} />
          </div>
          <p className="empty-state__title">No employees in this outlet</p>
          <p className="empty-state__desc">Add employees to start tracking attendance and calculating payroll.</p>
          <a href="/employees" className="btn btn-primary mt-4">Add Employee</a>
        </div>
      )}
    </div>
  );
}
