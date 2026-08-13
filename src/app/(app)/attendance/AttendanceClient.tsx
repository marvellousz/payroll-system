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
interface Me { role: string; }

const MONTHS = ["January","February","March","April","May","June",
  "July","August","September","October","November","December"];
const DAY_LABELS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

function recordsToMap(data: AttendanceRecord[] | undefined): Record<number, AttendanceRecord> {
  const map: Record<number, AttendanceRecord> = {};
  if (!Array.isArray(data)) return map;
  data.forEach((rec) => {
    map[new Date(rec.date).getUTCDate()] = rec;
  });
  return map;
}

function toYmd(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function localYmd(d = new Date()) {
  return toYmd(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function addDaysYmd(ymd: string, delta: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d + delta);
  return toYmd(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}

export default function AttendanceClient() {
  const searchParams = useSearchParams();
  const { selectedOutletId } = useOutlets();
  const now = new Date();
  const { data: me } = useSWR<Me>(swrKeys.me());
  const isStaff = me?.role === "staff";

  const [selectedEmployee, setSelectedEmployee] = useState(searchParams.get("employee") ?? "");
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [records, setRecords] = useState<Record<number, AttendanceRecord>>({});
  const [savingDate, setSavingDate] = useState<string | null>(null);
  const [editingDay, setEditingDay] = useState<number | null>(null);

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
    // Don't clobber in-flight optimistic edits
    if (savingDate) return;
    setRecords(recordsToMap(attendanceList));
  }, [attendanceList, savingDate]);

  useEffect(() => {
    setEditingDay(null);
  }, [selectedEmployee, month, year]);

  function dayMark(rec: AttendanceRecord | undefined): "P" | "A" | "Ot" | "H" | null {
    if (!rec) return null;
    if (rec.status === "absent") return "A";
    if (rec.status === "half") return "H";
    if (rec.status === "present") {
      if (rec.overtime_units != null && Number(rec.overtime_units) > 0) return "Ot";
      return "P";
    }
    return null;
  }

  async function saveAttendance(
    day: number,
    status: "present" | "absent" | "half",
    overtime_units?: number | null
  ) {
    if (!selectedEmployee) return;
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    setSavingDate(dateStr);

    const prevRec = records[day];
    const nextOt = status === "absent" ? null : (overtime_units ?? null);
    const optimistic: AttendanceRecord = {
      id: prevRec?.id ?? `temp-${dateStr}`,
      date: `${dateStr}T00:00:00.000Z`,
      status,
      overtime_units: nextOt,
    };
    setRecords((prev) => ({ ...prev, [day]: optimistic }));

    try {
      const res = await fetch(`/api/employees/${selectedEmployee}/attendance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: dateStr,
          status,
          overtime_units: nextOt,
        }),
        cache: "no-store",
      });

      if (res.ok) {
        const rec = (await res.json()) as AttendanceRecord;
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
        const err = await res.json().catch(() => ({}));
        console.error("[attendance] save failed", res.status, err);
        setRecords((prev) => {
          const next = { ...prev };
          if (prevRec) next[day] = prevRec;
          else delete next[day];
          return next;
        });
        alert(err.error || "Could not save attendance. Try again.");
      }
    } catch (e) {
      console.error("[attendance] save error", e);
      setRecords((prev) => {
        const next = { ...prev };
        if (prevRec) next[day] = prevRec;
        else delete next[day];
        return next;
      });
      alert("Could not save attendance. Check your connection.");
    } finally {
      setSavingDate(null);
    }
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
  const otCount = Object.values(records).filter(
    (r) =>
      r.status === "present" &&
      r.overtime_units != null &&
      Number(r.overtime_units) > 0
  ).length;

  const today = new Date();
  const loadingRecords = isLoading && !attendanceList;
  const todayStr = localYmd(today);
  const yesterdayStr = addDaysYmd(todayStr, -1);

  function isDayEditable(dateStr: string) {
    if (!isStaff) return true; // admin (and while role loads)
    return dateStr === todayStr || dateStr === yesterdayStr;
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Attendance Calendar</h1>
          <p className="page-subtitle">
            {isStaff
              ? "Staff can mark today and yesterday only"
              : "Track daily presence, absence, half-days, and overtime"}
          </p>
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
        <div className="attendance-stats mb-6">
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
          <div className="card-flat-muted" style={{ background: "var(--color-danger-light)" }}>
            <div className="stat-card__label text-danger">Absent</div>
            <div className="stat-card__value text-danger">{absentCount}</div>
            <div className="stat-card__sub font-bold">days this month</div>
          </div>
          <div className="card-flat-blue">
            <div className="stat-card__label text-blue">Overtime</div>
            <div className="stat-card__value text-blue">{otCount}</div>
            <div className="stat-card__sub font-bold">OT days this month</div>
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
                    const dateStr = toYmd(year, month, day);
                    const isSaving = savingDate === dateStr;
                    const editable = isDayEditable(dateStr);
                    const isFuture = isStaff && dateStr > todayStr;
                    const isLocked = !editable;
                    const isToday = dateStr === todayStr;
                    const mark = dayMark(rec);
                    const hasOt = mark === "Ot";
                    const isEditing = editable && (editingDay === day || !mark);

                    let dayClass = "attendance-day unmarked";
                    if (isFuture) dayClass = "attendance-day future";
                    else if (hasOt) dayClass = "attendance-day ot";
                    else if (rec?.status === "present") dayClass = "attendance-day present";
                    else if (rec?.status === "half") dayClass = "attendance-day half";
                    else if (rec?.status === "absent") dayClass = "attendance-day absent";
                    if (isToday) dayClass += " today";
                    if (isLocked && !isFuture) dayClass += " is-locked";
                    if (isEditing) dayClass += " is-editing";

                    async function pick(
                      action: () => void | Promise<void>
                    ) {
                      await action();
                      setEditingDay(null);
                    }

                    return (
                      <div key={day} className={`${dayClass}${isSaving ? " is-saving" : ""}`}>
                        <span className="attendance-day__date">{day}</span>

                        {mark && (!editable || !isEditing) ? (
                          <button
                            type="button"
                            className="attendance-day__mark"
                            disabled={isSaving || isLocked}
                            onClick={() => {
                              if (editable) setEditingDay(day);
                            }}
                            title={
                              isLocked
                                ? "Staff can only change today or yesterday"
                                : "Tap to change"
                            }
                          >
                            {mark}
                          </button>
                        ) : editable ? (
                          <div className="toggle-group attendance-day__toggles" role="group" aria-label="Attendance">
                            <button
                              type="button"
                              className={`toggle-btn ${rec?.status === "present" && !hasOt ? "active-present" : ""}`}
                              onClick={() => {
                                void pick(() =>
                                  saveAttendance(day, "present", null)
                                );
                              }}
                              disabled={isSaving}
                              title="Present"
                            >
                              P
                            </button>
                            <button
                              type="button"
                              className={`toggle-btn ${rec?.status === "absent" ? "active-absent" : ""}`}
                              onClick={() => {
                                void pick(() => saveAttendance(day, "absent", null));
                              }}
                              disabled={isSaving}
                              title="Absent"
                            >
                              A
                            </button>
                            <button
                              type="button"
                              className={`toggle-btn ${hasOt ? "active-ot" : ""}`}
                              onClick={() => {
                                void pick(async () => {
                                  await saveAttendance(day, "present", 1);
                                });
                              }}
                              disabled={isSaving}
                              title="Present + overtime"
                            >
                              Ot
                            </button>
                            <button
                              type="button"
                              className={`toggle-btn ${rec?.status === "half" ? "active-half" : ""}`}
                              onClick={() => {
                                void pick(() => saveAttendance(day, "half", null));
                              }}
                              disabled={isSaving}
                              title="Half day"
                            >
                              H
                            </button>
                          </div>
                        ) : null}
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
                P Present
              </span>
              <span className="flex items-center gap-2 text-xs font-bold">
                <span className="attendance-swatch attendance-swatch--absent" />
                A Absent
              </span>
              <span className="flex items-center gap-2 text-xs font-bold">
                <span className="attendance-swatch attendance-swatch--ot" />
                Ot = Present + overtime
              </span>
              <span className="flex items-center gap-2 text-xs font-bold">
                <span className="attendance-swatch attendance-swatch--half" />
                H Half
              </span>
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
