"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getDaysInMonth } from "date-fns";
import { formatINR } from "@/lib/payroll";

interface Employee {
  id: string;
  name: string;
  monthly_salary: string;
  paid_leave_days: number;
  outlet: { name: string; overtime_rate: string; overtime_unit: string };
  created_at: string;
}

interface Payment {
  id: string;
  month: number;
  year: number;
  amount: string;
  paid_at: string;
  created_by_profile?: { username: string };
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

interface AttendanceItem {
  id: string;
  date: string;
  status: "present" | "absent";
  overtime_units: number | null;
}

const MONTHS = ["January","February","March","April","May","June",
  "July","August","September","October","November","December"];

export default function EmployeeDetailClient({ employeeId }: { employeeId: string }) {
  const now = new Date();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [payroll, setPayroll] = useState<PayrollData | null>(null);
  const [view, setView] = useState<"summary" | "full">("summary");
  const [attendance, setAttendance] = useState<AttendanceItem[]>([]);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [loading, setLoading] = useState(true);

  const fetchEmployee = useCallback(() => {
    fetch(`/api/employees/${employeeId}`)
      .then((r) => r.json())
      .then((data) => setEmployee(data))
      .catch(console.error);
  }, [employeeId]);

  const fetchPayments = useCallback(() => {
    fetch(`/api/employees/${employeeId}/payments`)
      .then((r) => r.json())
      .then((data) => setPayments(Array.isArray(data) ? data : []))
      .catch(console.error);
  }, [employeeId]);

  const fetchPayroll = useCallback(() => {
    fetch(`/api/employees/${employeeId}/payroll?month=${month}&year=${year}`)
      .then((r) => r.json())
      .then((data) => setPayroll(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [employeeId, month, year]);

  useEffect(() => {
    fetchEmployee();
    fetchPayments();
  }, [fetchEmployee, fetchPayments]);

  useEffect(() => {
    fetchPayroll();
  }, [fetchPayroll]);

  useEffect(() => {
    if (view !== "full") return;
    fetch(`/api/employees/${employeeId}/attendance?month=${month}&year=${year}`)
      .then((r) => r.json())
      .then((data) => setAttendance(Array.isArray(data) ? data : []))
      .catch(console.error);
  }, [employeeId, month, year, view]);

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  }

  if (loading && !employee) {
    return (
      <div className="flex items-center justify-center" style={{ padding: "6rem" }}>
        <span className="spinner spinner-lg" />
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="page-content">
        <div className="empty-state">
          <p className="empty-state__title">Employee not found</p>
        </div>
      </div>
    );
  }

  const daysInMonth = getDaysInMonth(new Date(year, month - 1));
  const recordsByDay: Record<number, AttendanceItem> = {};
  attendance.forEach((r) => {
    recordsByDay[new Date(r.date).getUTCDate()] = r;
  });
  const fullPresent = attendance.filter((r) => r.status === "present").length;
  const fullAbsent = attendance.filter((r) => r.status === "absent").length;

  return (
    <div className="page-content animate-fade-in">
      <div className="mb-4">
        <a href="/employees" className="btn btn-framed btn-sm">
          ← Back to Employees
        </a>
      </div>

      {/* Profile Header Card */}
      <div className="card mb-6" style={{ padding: "1.75rem" }}>
        <div className="flex items-center gap-4 flex-wrap">
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              background: "var(--color-primary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              color: "#fff",
              fontSize: "1.5rem",
              flexShrink: 0,
            }}
          >
            {employee.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="page-title">{employee.name}</h1>
            <p className="text-secondary text-sm">
              Outlet: <strong>{employee.outlet.name}</strong> · Joined:{" "}
              {new Date(employee.created_at).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
            </p>
          </div>
        </div>

        <div className="grid-3 mt-6 pt-4 border-t">
          <div>
            <div className="text-muted text-xs uppercase font-semibold">Monthly Salary</div>
            <div className="text-xl font-bold mt-1">{formatINR(Number(employee.monthly_salary))}</div>
          </div>
          <div>
            <div className="text-muted text-xs uppercase font-semibold">Paid Leave Allowance</div>
            <div className="text-xl font-bold mt-1">{employee.paid_leave_days} days</div>
          </div>
          <div>
            <div className="text-muted text-xs uppercase font-semibold">Outlet OT Rate</div>
            <div className="text-xl font-bold mt-1">
              {formatINR(Number(employee.outlet.overtime_rate))} / {employee.outlet.overtime_unit}
            </div>
          </div>
        </div>
      </div>

      {/* Month Payroll Section */}
      <div className="flex justify-between items-start mb-4 flex-wrap gap-3">
        <h2 className="text-lg font-bold">Monthly Overview</h2>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="segmented" role="group" aria-label="View mode">
            <button
              type="button"
              className={`segmented__btn ${view === "summary" ? "active" : ""}`}
              onClick={() => setView("summary")}
              aria-pressed={view === "summary"}
            >
              Summary
            </button>
            <button
              type="button"
              className={`segmented__btn ${view === "full" ? "active" : ""}`}
              onClick={() => setView("full")}
              aria-pressed={view === "full"}
            >
              Full Month View
            </button>
          </div>
          <div className="month-nav">
            <button className="btn btn-ghost btn-icon" onClick={prevMonth} aria-label="Previous month">
              <ChevronLeft size={18} strokeWidth={2} />
            </button>
            <span className="month-nav__label font-semibold">{MONTHS[month-1]} {year}</span>
            <button className="btn btn-ghost btn-icon" onClick={nextMonth} aria-label="Next month">
              <ChevronRight size={18} strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>

      {view === "full" ? (
        <div className="mb-6 flex flex-col" style={{ gap: "1.5rem" }}>
          {/* Daily attendance — every day of the month with date */}
          <div className="card">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
              <div className="text-sm font-extrabold uppercase tracking-wide text-secondary">
                Daily Attendance
              </div>
              <div className="flex gap-2">
                <span className="badge badge-success">{fullPresent} Present</span>
                <span className="badge badge-danger">{fullAbsent} Absent</span>
                <span className="badge badge-neutral">{daysInMonth - fullPresent - fullAbsent} Unmarked</span>
              </div>
            </div>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Day</th>
                    <th>Present / Absent</th>
                    <th>Overtime</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                    const dateObj = new Date(year, month - 1, day);
                    const rec = recordsByDay[day];
                    return (
                      <tr key={day}>
                        <td className="font-bold">
                          {dateObj.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                        </td>
                        <td className="text-secondary">
                          {dateObj.toLocaleDateString("en-IN", { weekday: "long" })}
                        </td>
                        <td>
                          {rec ? (
                            <span className={`badge ${rec.status === "present" ? "badge-success" : "badge-danger"}`}>
                              {rec.status === "present" ? "Present" : "Absent"}
                            </span>
                          ) : (
                            <span className="badge badge-neutral">Unmarked</span>
                          )}
                        </td>
                        <td className={rec?.overtime_units != null ? "amount-positive font-semibold" : "text-muted"}>
                          {rec?.overtime_units != null
                            ? `${rec.overtime_units} unit${rec.overtime_units === 1 ? "" : "s"}`
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Final Settlement — the payoff at the end */}
          <div className="card-flat-emerald">
            <div className="text-xs font-extrabold uppercase tracking-wide text-emerald mb-3">
              Final Settlement · {MONTHS[month - 1]} {year}
            </div>
            {payroll ? (
              <div className="grid-2">
                <div>
                  <div className="payroll-line"><span className="text-secondary">Days Present</span><span className="font-bold">{payroll.days_present}</span></div>
                  <div className="payroll-line"><span className="text-secondary">Days Absent</span><span className="font-bold">{payroll.days_absent}</span></div>
                  <div className="payroll-line"><span className="text-secondary">Paid Leave</span><span className="font-bold">{payroll.paid_leave_days}d</span></div>
                  <div className="payroll-line"><span className="text-secondary">Base Pay</span><span className="payroll-line__amount">{formatINR(payroll.base_pay)}</span></div>
                  <div className="payroll-line"><span className="text-secondary">Overtime Pay</span><span className="payroll-line__amount">{formatINR(payroll.overtime_pay)}</span></div>
                  <div className="payroll-line total divider"><span>Total Pay</span><span className="payroll-line__amount amount-positive">{formatINR(payroll.total_pay)}</span></div>
                </div>
                <div>
                  <div className="payroll-line"><span className="text-secondary">Salary Given</span><span className="payroll-line__amount">{formatINR(payroll.salary_given)}</span></div>
                  <div className="payroll-line"><span className="text-secondary">Previous Balance</span><span className={`payroll-line__amount ${payroll.previous_balance < 0 ? "amount-negative" : ""}`}>{formatINR(payroll.previous_balance)}</span></div>
                  <div className="payroll-line total divider"><span>Closing Balance</span><span className={`payroll-line__amount ${payroll.closing_balance >= 0 ? "amount-positive" : "amount-negative"}`}>{formatINR(payroll.closing_balance)}</span></div>
                  <div className="mt-4">
                    {payroll.closing_balance > 0 && (
                      <span className="badge badge-warning">₹{Math.abs(payroll.closing_balance).toLocaleString("en-IN")} owed to employee</span>
                    )}
                    {payroll.closing_balance < 0 && (
                      <span className="badge badge-danger">₹{Math.abs(payroll.closing_balance).toLocaleString("en-IN")} advance paid</span>
                    )}
                    {payroll.closing_balance === 0 && (
                      <span className="badge badge-success">Fully settled</span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-secondary text-sm">No attendance data for this month. Mark attendance first.</div>
            )}
          </div>
        </div>
      ) : (
        payroll && (
        <div className="card mb-6">
          <div className="grid-2" style={{ gap: "2rem" }}>
            <div>
              <div className="text-muted text-xs font-semibold uppercase mb-3">Calculation Breakdown</div>
              <div className="payroll-line"><span className="text-secondary">Days Present</span><span className="font-semibold">{payroll.days_present}</span></div>
              <div className="payroll-line"><span className="text-secondary">Days Absent</span><span className="font-semibold">{payroll.days_absent}</span></div>
              <div className="payroll-line"><span className="text-secondary">Paid Leave Days</span><span className="font-semibold">{payroll.paid_leave_days}</span></div>
              <div className="payroll-line"><span className="text-secondary">Base Pay</span><span className="payroll-line__amount">{formatINR(payroll.base_pay)}</span></div>
              <div className="payroll-line"><span className="text-secondary">Overtime Pay</span><span className="payroll-line__amount">{formatINR(payroll.overtime_pay)}</span></div>
              <div className="payroll-line total divider"><span>Total Pay</span><span className="payroll-line__amount amount-positive">{formatINR(payroll.total_pay)}</span></div>
            </div>

            <div>
              <div className="text-muted text-xs font-semibold uppercase mb-3">Balance & Payments</div>
              <div className="payroll-line"><span className="text-secondary">Previous Balance</span><span className="payroll-line__amount">{formatINR(payroll.previous_balance)}</span></div>
              <div className="payroll-line"><span className="text-secondary">Current Month Total Pay</span><span className="payroll-line__amount">{formatINR(payroll.total_pay)}</span></div>
              <div className="payroll-line"><span className="text-secondary">Salary Given</span><span className="payroll-line__amount">{formatINR(payroll.salary_given)}</span></div>
              <div className="payroll-line total divider"><span>Closing Balance</span><span className={`payroll-line__amount ${payroll.closing_balance >= 0 ? "amount-positive" : "amount-negative"}`}>{formatINR(payroll.closing_balance)}</span></div>

              <div className="mt-4">
                <a href={`/attendance?employee=${employee.id}`} className="btn btn-framed btn-sm">
                  View / Edit Attendance Calendar →
                </a>
              </div>
            </div>
          </div>
        </div>
      )
      )}

      {/* Payments History Table */}
      <h2 className="text-lg font-bold mb-4">Payment History</h2>
      {payments.length === 0 ? (
        <div className="card text-center text-muted" style={{ padding: "2rem" }}>
          No payments recorded yet for this employee.
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>For Month</th>
                <th>Amount</th>
                <th>Recorded By</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td className="text-secondary text-sm">
                    {new Date(p.paid_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </td>
                  <td>{MONTHS[p.month - 1]} {p.year}</td>
                  <td className="font-semibold amount-positive">{formatINR(Number(p.amount))}</td>
                  <td className="text-muted text-sm">{p.created_by_profile?.username ?? "Admin"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
