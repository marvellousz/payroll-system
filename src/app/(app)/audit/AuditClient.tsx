"use client";

import { useState, useEffect, useCallback } from "react";
import Dropdown from "@/components/Dropdown";
import DatePicker from "@/components/DatePicker";

interface AuditLogItem {
  id: string;
  entity_type: string;
  entity_id: string;
  field_changed: string | null;
  old_value: string | null;
  new_value: string | null;
  timestamp: string;
  user: {
    username: string;
    email: string;
  };
}

function formatAuditValue(value: string | null) {
  if (value == null || value === "") return "—";
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
      return value;
    }
  }
  return value;
}

export default function AuditClient() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);

  // Filters
  const [entityType, setEntityType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const fetchLogs = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "25");
    if (entityType) params.set("entity_type", entityType);
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);

    fetch(`/api/audit-logs?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        setLogs(data.logs ?? []);
        setTotal(data.total ?? 0);
        setPages(data.pages ?? 1);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page, entityType, dateFrom, dateTo]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return (
    <div className="page-content animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Audit Logs</h1>
          <p className="page-subtitle">Complete history of system mutations and changes ({total} total)</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="card mb-6" style={{ padding: "1rem 1.25rem" }}>
        <div className="flex gap-3 flex-wrap items-center">
          <div className="form-group" style={{ flex: "1 1 180px" }}>
            <Dropdown
              value={entityType}
              onChange={(v) => { setEntityType(v); setPage(1); }}
              options={[
                { value: "", label: "All Entities" },
                { value: "Employee", label: "Employee" },
                { value: "AttendanceRecord", label: "Attendance" },
                { value: "PayrollSummary", label: "Payroll" },
                { value: "SalaryPayment", label: "Salary Payment" },
                { value: "Outlet", label: "Outlet" },
                { value: "Profile", label: "User/Profile" },
              ]}
              label="Entity Type"
            />
          </div>

          <div className="form-group" style={{ flex: "1 1 160px" }}>
            <DatePicker
              label="From Date"
              value={dateFrom}
              onChange={(v) => { setDateFrom(v); setPage(1); }}
            />
          </div>

          <div className="form-group" style={{ flex: "1 1 160px" }}>
            <DatePicker
              label="To Date"
              value={dateTo}
              onChange={(v) => { setDateTo(v); setPage(1); }}
            />
          </div>

          {(entityType || dateFrom || dateTo) && (
            <div style={{ marginTop: "auto" }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => { setEntityType(""); setDateFrom(""); setDateTo(""); setPage(1); }}
              >
                Clear Filters
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Logs Table */}
      {loading ? (
        <div className="flex items-center justify-center" style={{ padding: "4rem" }}>
          <span className="spinner spinner-lg" />
        </div>
      ) : logs.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state__title">No audit records found</p>
          <p className="empty-state__desc">Try adjusting your filters.</p>
        </div>
      ) : (
        <>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>User</th>
                  <th>Entity</th>
                  <th>Field Changed</th>
                  <th>Old Value</th>
                  <th>New Value</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="text-muted text-xs white-space-nowrap">
                      {new Date(log.timestamp).toLocaleString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td>
                      <span className="font-medium text-sm">{log.user?.username ?? "System"}</span>
                    </td>
                    <td>
                      <span className="badge badge-accent">{log.entity_type}</span>
                    </td>
                    <td className="font-medium text-sm">
                      {log.field_changed ?? "—"}
                    </td>
                    <td className="text-secondary text-xs audit-value-cell">
                      {formatAuditValue(log.old_value)}
                    </td>
                    <td className="text-primary text-xs font-semibold audit-value-cell">
                      {formatAuditValue(log.new_value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-secondary">
                Page {page} of {pages}
              </div>
              <div className="flex gap-2">
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={page >= pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
