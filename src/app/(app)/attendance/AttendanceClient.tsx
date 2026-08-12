"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getDaysInMonth, startOfMonth, getDay } from "date-fns";
import Dropdown from "@/components/Dropdown";
import { useOutlets } from "@/lib/outlet-context";

interface Employee { id: string; name: string; outlet_id: string; }
interface AttendanceRecord {
  id: string;
  date: string;
  status: "present" | "absent";
  overtime_units: number | null;
}

const MONTHS = ["January","February","March","April","May","June",
  "July","August","September","October","November","December"];
const DAY_LABELS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

export default function AttendanceClient() {
  const searchParams = useSearchParams();
  const { selectedOutletId } = useOutlets();
  const now = new Date();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState(searchParams.get("employee") ?? "");
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [records, setRecords] = useState<Record<string, AttendanceRecord>>({});
  const [savingDate, setSavingDate] = useState<string | null>(null);
  const [loadingRecords, setLoadingRecords] = useState(false);

  useEffect(() => {
    if (!selectedOutletId) return;
    fetch(`/api/outlets/${selectedOutletId}/employees`)
      .then((r) => r.json())
      .then((data: Employee[]) => {
        setEmployees(Array.isArray(data) ? data : []);
        if (data.length > 0 && !data.find((e) => e.id === selectedEmployee)) {
          setSelectedEmployee(data[0].id);
        }
      });
  }, [selectedOutletId]);

  const fetchRecords = useCallback(() => {
    if (!selectedEmployee) return;
    setLoadingRecords(true);
    fetch(`/api/employees/${selectedEmployee}/attendance?month=${month}&year=${year}`)
      .then((r) => r.json())
      .then((data: AttendanceRecord[]) => {
        const map: Record<string, AttendanceRecord> = {};
        if (Array.isArray(data)) {
          data.forEach((rec) => {
            const day = new Date(rec.date).getUTCDate();
            map[day] = rec;
          });
        }
        setRecords(map);
      })
      .finally(() => setLoadingRecords(false));
  }, [selectedEmployee, month, year]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  async function saveAttendance(day: number, status: "present" | "absent", overtime_units?: number | null) {
    if (!selectedEmployee) return;
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    setSavingDate(dateStr);

    const res = await fetch(`/api/employees/${selectedEmployee}/attendance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: dateStr,
        status,
        overtime_units: status === "absent" ? null : (overtime_units ?? null),
      }),
    });

    if (res.ok) {
      const rec = await res.json();
      const dayNum = new Date(rec.date).getUTCDate();
      setRecords((prev) => ({ ...prev, [dayNum]: rec }));
    }
    setSavingDate(null);
  }

  async function updateOvertime(day: number, value: string) {
    const rec = records[day];
    if (!rec || rec.status !== "present") return;
    const ot = value === "" ? null : Number(value);
    await saveAttendance(day, "present", ot);
  }

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  }

  const daysInMonth = getDaysInMonth(new Date(year, month - 1));
  const firstDayOfWeek = getDay(startOfMonth(new Date(year, month - 1)));
  const startOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

  const presentCount = Object.values(records).filter((r) => r.status === "present").length;
  const absentCount  = Object.values(records).filter((r) => r.status === "absent").length;

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;

  return (
    <div className="page-content">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Attendance Calendar</h1>
          <p className="page-subtitle">Track daily presence, absence, and overtime hours</p>
        </div>
        <div className="month-nav">
          <button className="btn btn-ghost btn-icon" onClick={prevMonth} aria-label="Previous month">
            <ChevronLeft size={18} strokeWidth={2.5} />
          </button>
          <span className="month-nav__label">{MONTHS[month-1]} {year}</span>
          <button className="btn btn-ghost btn-icon" onClick={nextMonth} aria-label="Next month">
            <ChevronRight size={18} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* Selector Controls */}
      <div className="flex gap-4 flex-wrap mb-6 items-end">
        <div className="form-group" style={{ flex: "1 1 220px", minWidth: "0", maxWidth: "360px", width: "100%" }}>
          <Dropdown
            value={selectedEmployee}
            onChange={setSelectedEmployee}
            options={employees.map((e) => ({ value: e.id, label: e.name }))}
            label="Select Employee"
            placeholder="Select employee"
          />
        </div>
      </div>

      {/* Stats Cards */}
      {selectedEmployee && (
        <div className="grid-3 mb-6">
          <div className="card-flat-emerald">
            <div className="stat-card__label text-emerald">Present</div>
            <div className="stat-card__value text-emerald">{presentCount}</div>
            <div className="stat-card__sub font-bold">days this month</div>
          </div>
          <div className="card-flat-muted" style={{ background: "#FEF2F2" }}>
            <div className="stat-card__label text-danger">Absent</div>
            <div className="stat-card__value text-danger">{absentCount}</div>
            <div className="stat-card__sub font-bold">days this month</div>
          </div>
          <div className="card-flat-muted">
            <div className="stat-card__label">Unmarked</div>
            <div className="stat-card__value">{daysInMonth - presentCount - absentCount}</div>
            <div className="stat-card__sub font-bold">days remaining</div>
          </div>
        </div>
      )}

      {/* Calendar Grid */}
      {selectedEmployee ? (
        loadingRecords ? (
          <div className="flex items-center justify-center" style={{ padding: "4rem" }}>
            <span className="spinner spinner-lg" />
          </div>
        ) : (
          <div className="card" style={{ padding: "1.25rem" }}>
            <div className="attendance-scroll">
              <div className="attendance-scroll__inner">
            {/* Headers */}
            <div className="attendance-grid" style={{ marginBottom: "0.75rem" }}>
              {DAY_LABELS.map((d) => (
                <div key={d} className="text-center text-xs font-extrabold" style={{ padding: "0.25rem", color: "#111827", textTransform: "uppercase" }}>
                  {d}
                </div>
              ))}
            </div>

            {/* Cells */}
            <div className="attendance-grid">
              {Array.from({ length: startOffset }).map((_, i) => (
                <div key={`offset-${i}`} />
              ))}

              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                const rec = records[day];
                const dateStr = `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
                const isSaving = savingDate === dateStr;
                const isFuture = isCurrentMonth && day > today.getDate();
                const isToday = isCurrentMonth && day === today.getDate();

                let dayClass = "attendance-day";
                if (isFuture) dayClass += " future";
                else if (rec?.status === "present") dayClass += " present";
                else if (rec?.status === "absent") dayClass += " absent";
                if (isToday) dayClass += " today";

                return (
                  <div key={day} className={dayClass} style={{ position: "relative" }}>
                    {isSaving && (
                      <div style={{ position: "absolute", top: "6px", right: "6px" }}>
                        <span className="spinner" style={{ width: "12px", height: "12px" }} />
                      </div>
                    )}

                    <div className="attendance-day__date">{day}</div>

                    <div className="toggle-group" style={{ marginTop: "auto" }}>
                      <button
                        className={`toggle-btn ${rec?.status === "present" ? "active-present" : ""}`}
                        onClick={() => {
                          if (!isFuture) {
                            if (rec?.status === "present") saveAttendance(day, "absent", null);
                            else saveAttendance(day, "present", rec?.overtime_units ?? null);
                          }
                        }}
                        disabled={isFuture || isSaving}
                        title="Mark Present"
                      >P</button>
                      <button
                        className={`toggle-btn ${rec?.status === "absent" ? "active-absent" : ""}`}
                        onClick={() => {
                          if (!isFuture) saveAttendance(day, "absent", null);
                        }}
                        disabled={isFuture || isSaving}
                        title="Mark Absent"
                      >A</button>
                    </div>

                    {rec?.status === "present" && (
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        placeholder="OT"
                        value={rec.overtime_units ?? ""}
                        onChange={(e) => {
                          setRecords((prev) => ({
                            ...prev,
                            [day]: { ...rec, overtime_units: e.target.value === "" ? null : Number(e.target.value) },
                          }));
                        }}
                        onBlur={(e) => updateOvertime(day, e.target.value)}
                        style={{
                          marginTop: "0.375rem",
                          width: "100%",
                          background: "#FFFFFF",
                          border: "2px solid #111827",
                          borderRadius: "4px",
                          padding: "2px 4px",
                          color: "#111827",
                          fontSize: "0.75rem",
                          fontWeight: "800",
                          textAlign: "center",
                          minHeight: "36px",
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
              </div>
            </div>

            {/* Legend */}
            <div className="flex gap-4 mt-6 pt-4 border-t justify-end flex-wrap">
              <span className="flex items-center gap-2 text-xs font-bold">
                <span style={{ width: "12px", height: "12px", borderRadius: "3px", background: "var(--color-secondary)", display: "inline-block", flexShrink: 0 }}/>
                Present (P)
              </span>
              <span className="flex items-center gap-2 text-xs font-bold">
                <span style={{ width: "12px", height: "12px", borderRadius: "3px", background: "var(--color-danger)", display: "inline-block", flexShrink: 0 }}/>
                Absent (A)
              </span>
              <span className="text-xs text-secondary font-medium">OT = Overtime Units</span>
            </div>
          </div>
        )
      ) : (
        <div className="empty-state">
          <p className="empty-state__desc">Select an employee above to view their attendance calendar.</p>
        </div>
      )}
    </div>
  );
}
