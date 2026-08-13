"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getDaysInMonth, startOfMonth, getDay } from "date-fns";
import Dropdown from "@/components/Dropdown";
import { useOutlets } from "@/lib/outlet-context";
import { invalidatePayrollCaches, swrKeys } from "@/lib/swr-config";

interface Employee { id: string; name: string; outlet_id: string; }
interface AttendanceRecord {
  id: string;
  date: string;
  status: "present" | "absent" | "half";
  overtime_units: number | null;
}

const MONTHS = ["January","February","March","April","May","June",
  "July","August","September","October","November","December"];
const DAY_LABELS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const OT_OPTIONS = [
  { value: "none", label: "None" },
  { value: "0.5", label: "0.5" },
  { value: "1", label: "1" },
  { value: "1.5", label: "1.5" },
  { value: "2", label: "2" },
] as const;

function recordsToMap(data: AttendanceRecord[] | undefined): Record<number, AttendanceRecord> {
  const map: Record<number, AttendanceRecord> = {};
  if (!Array.isArray(data)) return map;
  data.forEach((rec) => {
    map[new Date(rec.date).getUTCDate()] = rec;
  });
  return map;
}

export default function AttendanceClient() {
  const searchParams = useSearchParams();
  const { selectedOutletId } = useOutlets();
  const now = new Date();

  const [selectedEmployee, setSelectedEmployee] = useState(searchParams.get("employee") ?? "");
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [records, setRecords] = useState<Record<number, AttendanceRecord>>({});
  const [savingDate, setSavingDate] = useState<string | null>(null);

  const { data: employees = [] } = useSWR<Employee[]>(
    selectedOutletId ? swrKeys.employees(selectedOutletId) : null
  );

  useEffect(() => {
    if (!employees.length) return;
    if (!employees.find((e) => e.id === selectedEmployee)) {
      setSelectedEmployee(employees[0].id);
    }
  }, [employees, selectedEmployee]);

  const { data: attendanceList, isLoading, mutate } = useSWR<AttendanceRecord[]>(
    selectedEmployee ? swrKeys.attendance(selectedEmployee, month, year) : null
  );

  useEffect(() => {
    setRecords(recordsToMap(attendanceList));
  }, [attendanceList]);

  async function saveAttendance(
    day: number,
    status: "present" | "absent" | "half",
    overtime_units?: number | null
  ) {
    if (!selectedEmployee) return;
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    setSavingDate(dateStr);

    const prevRec = records[day];
    const optimistic: AttendanceRecord = {
      id: prevRec?.id ?? `temp-${dateStr}`,
      date: dateStr,
      status,
      overtime_units: status === "absent" ? null : (overtime_units ?? null),
    };
    setRecords((prev) => ({ ...prev, [day]: optimistic }));

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
      await mutate(
        (current) => {
          const list = Array.isArray(current) ? [...current] : [];
          const idx = list.findIndex((r) => new Date(r.date).getUTCDate() === dayNum);
          if (idx >= 0) list[idx] = rec;
          else list.push(rec);
          return list;
        },
        { revalidate: false }
      );
      void invalidatePayrollCaches(selectedOutletId, selectedEmployee);
    } else {
      setRecords((prev) => {
        const next = { ...prev };
        if (prevRec) next[day] = prevRec;
        else delete next[day];
        return next;
      });
    }
    setSavingDate(null);
  }

  async function updateOvertime(day: number, value: string) {
    const rec = records[day];
    if (!rec || rec.status === "absent") return;
    const ot = value === "none" || value === "" ? null : Number(value);
    await saveAttendance(day, rec.status, ot);
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
  const halfCount = Object.values(records).filter((r) => r.status === "half").length;
  const absentCount = Object.values(records).filter((r) => r.status === "absent").length;

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
  const loadingRecords = isLoading && !attendanceList;

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Attendance Calendar</h1>
          <p className="page-subtitle">Track daily presence, absence, half-days, and overtime</p>
        </div>
        <div className="month-nav month-nav--emphasis">
          <button className="btn btn-ghost btn-icon" onClick={prevMonth} aria-label="Previous month">
            <ChevronLeft size={18} strokeWidth={2.5} />
          </button>
          <span className="month-nav__label">
            <span className="month-nav__month">{MONTHS[month - 1]}</span>{" "}
            <span className="month-nav__year">{year}</span>
          </span>
          <button className="btn btn-ghost btn-icon" onClick={nextMonth} aria-label="Next month">
            <ChevronRight size={18} strokeWidth={2.5} />
          </button>
        </div>
      </div>

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

      {selectedEmployee && (
        <div className="grid-4 mb-6">
          <div className="card-flat-emerald">
            <div className="stat-card__label text-emerald">Present</div>
            <div className="stat-card__value text-emerald">{presentCount}</div>
            <div className="stat-card__sub font-bold">days this month</div>
          </div>
          <div className="card-flat-amber">
            <div className="stat-card__label text-amber">Half Day</div>
            <div className="stat-card__value text-amber">{halfCount}</div>
            <div className="stat-card__sub font-bold">count as 0.5</div>
          </div>
          <div className="card-flat-muted" style={{ background: "#FEF2F2" }}>
            <div className="stat-card__label text-danger">Absent</div>
            <div className="stat-card__value text-danger">{absentCount}</div>
            <div className="stat-card__sub font-bold">days this month</div>
          </div>
          <div className="card-flat-muted">
            <div className="stat-card__label">Unmarked</div>
            <div className="stat-card__value">
              {daysInMonth - presentCount - halfCount - absentCount}
            </div>
            <div className="stat-card__sub font-bold">count as absent in pay</div>
          </div>
        </div>
      )}

      {selectedEmployee ? (
        loadingRecords ? (
          <div className="flex items-center justify-center" style={{ padding: "4rem" }}>
            <span className="spinner spinner-lg" />
          </div>
        ) : (
          <div className="attendance-board">
            <h2 className="attendance-board__title attendance-board__title--solo">
              {MONTHS[month - 1]} <span className="attendance-board__year">{year}</span>
            </h2>

            <div className="attendance-scroll">
              <div className="attendance-scroll__inner">
                <div className="attendance-weekbar">
                  {DAY_LABELS.map((d) => (
                    <div key={d} className="attendance-weekday">
                      {d}
                    </div>
                  ))}
                </div>

                <div className="attendance-grid">
                  {Array.from({ length: startOffset }).map((_, i) => (
                    <div key={`offset-${i}`} className="attendance-day attendance-day--empty" />
                  ))}

                  {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                    const rec = records[day];
                    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                    const isSaving = savingDate === dateStr;
                    const isFuture = isCurrentMonth && day > today.getDate();
                    const isToday = isCurrentMonth && day === today.getDate();

                    let dayClass = "attendance-day unmarked";
                    if (isFuture) dayClass = "attendance-day future";
                    else if (rec?.status === "present") dayClass = "attendance-day present";
                    else if (rec?.status === "half") dayClass = "attendance-day half";
                    else if (rec?.status === "absent") dayClass = "attendance-day absent";
                    if (isToday) dayClass += " today";

                    return (
                      <div key={day} className={dayClass}>
                        {isSaving && (
                          <div className="attendance-day__saving">
                            <span className="spinner" style={{ width: "12px", height: "12px" }} />
                          </div>
                        )}

                        <span className="attendance-day__date">{day}</span>

                        <div className="toggle-group attendance-day__toggles">
                          <button
                            type="button"
                            className={`toggle-btn ${rec?.status === "present" ? "active-present" : ""}`}
                            onClick={() => {
                              if (!isFuture) saveAttendance(day, "present", rec?.overtime_units ?? null);
                            }}
                            disabled={isFuture || isSaving}
                            title="Mark Present"
                          >
                            P
                          </button>
                          <button
                            type="button"
                            className={`toggle-btn ${rec?.status === "half" ? "active-half" : ""}`}
                            onClick={() => {
                              if (!isFuture) saveAttendance(day, "half", rec?.overtime_units ?? null);
                            }}
                            disabled={isFuture || isSaving}
                            title="Mark Half Day"
                          >
                            H
                          </button>
                          <button
                            type="button"
                            className={`toggle-btn ${rec?.status === "absent" ? "active-absent" : ""}`}
                            onClick={() => {
                              if (!isFuture) saveAttendance(day, "absent", null);
                            }}
                            disabled={isFuture || isSaving}
                            title="Mark Absent"
                          >
                            A
                          </button>
                        </div>

                        {(rec?.status === "present" || rec?.status === "half") && (
                          <div className="attendance-ot-dropdown">
                            <Dropdown
                              variant="form"
                              value={
                                rec.overtime_units != null
                                  ? String(rec.overtime_units)
                                  : "none"
                              }
                              onChange={(v) => {
                                if (!isSaving) void updateOvertime(day, v);
                              }}
                              options={OT_OPTIONS}
                              placeholder="OT"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="attendance-board__legend">
              <span className="flex items-center gap-2 text-xs font-bold">
                <span className="attendance-swatch attendance-swatch--unmarked" />
                Unmarked
              </span>
              <span className="flex items-center gap-2 text-xs font-bold">
                <span className="attendance-swatch attendance-swatch--present" />
                Present (P)
              </span>
              <span className="flex items-center gap-2 text-xs font-bold">
                <span className="attendance-swatch attendance-swatch--half" />
                Half (H)
              </span>
              <span className="flex items-center gap-2 text-xs font-bold">
                <span className="attendance-swatch attendance-swatch--absent" />
                Absent (A)
              </span>
              <span className="text-xs font-medium" style={{ color: "#6B5344" }}>OT = selectable units</span>
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
