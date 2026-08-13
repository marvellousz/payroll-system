"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import Dropdown from "@/components/Dropdown";
import DatePicker from "@/components/DatePicker";
import { formatAuditDisplay, shouldHighlightAudit } from "@/lib/audit-format";
import { swrKeys } from "@/lib/swr-config";

interface AuditLogItem {
  id: string;
  entity_type: string;
  entity_id: string;
  field_changed: string | null;
  old_value: string | null;
  new_value: string | null;
  highlighted?: boolean;
  timestamp: string;
  user: {
    username: string;
    email: string;
  };
}

interface Me {
  role: string;
}

export default function AuditClient() {
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [deleting, setDeleting] = useState(false);

  const { data: me } = useSWR<Me>(swrKeys.me());
  const isAdmin = me?.role === "admin";

  const params = useMemo(() => {
    const p = new URLSearchParams();
    p.set("page", String(page));
    p.set("limit", "25");
    if (entityType) p.set("entity_type", entityType);
    if (dateFrom) p.set("date_from", dateFrom);
    if (dateTo) p.set("date_to", dateTo);
    return p;
  }, [page, entityType, dateFrom, dateTo]);

  const { data, isLoading, mutate } = useSWR<{
    logs: AuditLogItem[];
    total: number;
    pages: number;
  }>(swrKeys.auditLogs(params));

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const pages = data?.pages ?? 1;

  async function handleDeleteOld() {
    if (
      !confirm(
        "Delete all audit logs older than 1 year? This cannot be undone. A summary entry will be kept."
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch("/api/audit-logs", { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) {
        alert(body.error || "Failed to delete logs");
        return;
      }
      alert(body.message || `Deleted ${body.deleted} logs`);
      void mutate();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="page-content animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Audit Logs</h1>
          <p className="page-subtitle">Readable history of system changes ({total} total)</p>
        </div>
        {isAdmin && (
          <button className="btn btn-danger" onClick={handleDeleteOld} disabled={deleting}>
            {deleting ? <><span className="spinner" />Deleting…</> : "Delete logs older than 1 year"}
          </button>
        )}
      </div>

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
                { value: "SalaryAdjustment", label: "Salary Adjustment" },
                { value: "Outlet", label: "Outlet" },
                { value: "Profile", label: "User/Profile" },
                { value: "AuditLog", label: "Audit meta" },
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

      {isLoading && !data ? (
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
                  <th>Summary</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const display = formatAuditDisplay(log);
                  const highlight = shouldHighlightAudit(log);
                  return (
                    <tr key={log.id} className={highlight ? "audit-row--highlight" : undefined}>
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
                        <span className="font-semibold text-sm">{display.summary}</span>
                        <div className="text-muted text-xs mt-1">{log.entity_type}</div>
                      </td>
                      <td className="text-sm">{display.detail}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

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
