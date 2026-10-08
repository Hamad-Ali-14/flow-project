import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  ShieldCheck,
  Search,
  Filter,
  Lock,
  RotateCcw,
  CheckCircle2,
  XCircle,
  CreditCard,
  Clock,
  ArrowRight,
  FileSpreadsheet,
  Download,
} from 'lucide-react';
import { payrollApi } from '../../services/payrollService';
import { fmtDateTime } from '../../utils/payrollUiHelpers';
import { monthLabel } from '../../utils/payrollCalculations';
import { formatPKR } from '../../utils/formatters';

const ACTION_CONFIG = {
  FINALIZED: {
    label: 'Payroll Finalized & Locked',
    badgeClass: 'draft',
    icon: Lock,
    color: '#8b5cf6',
  },
  RECALCULATE_ATTENDANCE_CORRECTION: {
    label: 'Auto-Recalculate (Attendance Correction)',
    badgeClass: 'approved',
    icon: RotateCcw,
    color: '#f59e0b',
  },
  REVIEWED_APPROVED: {
    label: 'Manager Approved',
    badgeClass: 'approved',
    icon: CheckCircle2,
    color: '#10b981',
  },
  REVIEWED_REJECTED: {
    label: 'Manager Rejected',
    badgeClass: 'rejected',
    icon: XCircle,
    color: '#ef4444',
  },
  PAYMENT_RECORDED: {
    label: 'Disbursement Recorded',
    badgeClass: 'approved',
    icon: CreditCard,
    color: '#3b82f6',
  },
};

export default function PayrollAuditTrailModal({ onClose }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await payrollApi.getAuditSummary(100);
        if (mounted) setLogs(data || []);
      } catch (err) {
        console.warn('Failed to load audit logs:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (actionFilter !== 'ALL' && log.action !== actionFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const emp = (log.employeeName || '').toLowerCase();
        const actor = (log.actorName || '').toLowerCase();
        const note = (log.note || '').toLowerCase();
        if (!emp.includes(q) && !actor.includes(q) && !note.includes(q)) return false;
      }
      return true;
    });
  }, [logs, actionFilter, search]);

  const handleExportCsv = () => {
    const headers = ['Timestamp', 'Action', 'Employee', 'Period', 'Actor', 'Reason/Note', 'Old Values', 'New Values'];
    const rows = filteredLogs.map((l) => [
      l.at ? fmtDateTime(l.at) : '',
      l.action,
      `"${l.employeeName || 'Station Wide'}"`,
      l.month && l.year ? `"${monthLabel(l.month, l.year)}"` : '',
      `"${l.actorName || ''}"`,
      `"${(l.note || '').replace(/"/g, '""')}"`,
      `"${JSON.stringify(l.oldValues || {}).replace(/"/g, '""')}"`,
      `"${JSON.stringify(l.newValues || {}).replace(/"/g, '""')}"`,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `FLOW_Payroll_Audit_Log_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="modal-layer" onMouseDown={onClose} id="payroll-audit-modal-overlay">
      <div
        className="modal att-history-modal"
        onMouseDown={(e) => e.stopPropagation()}
        style={{ maxWidth: 840, width: '95%' }}
      >
        <div className="modal-top">
          <div className="modal-mark">
            <ShieldCheck size={20} />
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close dialog">
            <X size={19} />
          </button>
        </div>

        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 16,
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Payroll Lock & Audit Trail</h2>
            <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: 13 }}>
              Immutable record of finalization locks, manager decisions & attendance recalculations
            </p>
          </div>
          <button
            type="button"
            className="button secondary tiny"
            onClick={handleExportCsv}
            disabled={filteredLogs.length === 0}
            title="Download CSV audit ledger"
          >
            <Download size={13} />
            <span>Export CSV</span>
          </button>
        </div>

        {/* Filter and Search Bar */}
        <div
          style={{
            display: 'flex',
            gap: 10,
            marginBottom: 14,
            flexWrap: 'wrap',
          }}
        >
          <div className="search-box" style={{ flex: '1 1 240px', minWidth: 200 }}>
            <Search size={15} />
            <input
              type="text"
              placeholder="Search staff, actor, reason..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`button tiny ${actionFilter === 'ALL' ? 'primary' : 'secondary'}`}
              onClick={() => setActionFilter('ALL')}
            >
              All ({logs.length})
            </button>
            <button
              type="button"
              className={`button tiny ${actionFilter === 'FINALIZED' ? 'primary' : 'secondary'}`}
              onClick={() => setActionFilter('FINALIZED')}
              title="Locked periods"
            >
              🔒 Locks
            </button>
            <button
              type="button"
              className={`button tiny ${actionFilter === 'RECALCULATE_ATTENDANCE_CORRECTION' ? 'primary' : 'secondary'}`}
              onClick={() => setActionFilter('RECALCULATE_ATTENDANCE_CORRECTION')}
              title="Attendance recalculations"
            >
              🔄 Recalculations
            </button>
            <button
              type="button"
              className={`button tiny ${actionFilter === 'PAYMENT_RECORDED' ? 'primary' : 'secondary'}`}
              onClick={() => setActionFilter('PAYMENT_RECORDED')}
            >
              💳 Payments
            </button>
          </div>
        </div>

        {/* Audit Log Timeline */}
        <div
          style={{
            maxHeight: '60vh',
            overflowY: 'auto',
            paddingRight: 4,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {loading ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
              Loading audit entries...
            </div>
          ) : filteredLogs.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
              No audit records match the current filter.
            </div>
          ) : (
            filteredLogs.map((log) => {
              const cfg = ACTION_CONFIG[log.action] || {
                label: log.action,
                badgeClass: 'neutral',
                icon: ShieldCheck,
                color: 'var(--ink)',
              };
              const Icon = cfg.icon;

              const hasDiff = log.oldValues && log.newValues;

              return (
                <div
                  key={log.id}
                  style={{
                    background: 'var(--card)',
                    border: '1px solid var(--line)',
                    borderRadius: 10,
                    padding: '12px 14px',
                    position: 'relative',
                  }}
                >
                  {/* Top line: Action, Target Staff & Time */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      flexWrap: 'wrap',
                      gap: 8,
                      marginBottom: 6,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          fontSize: 11.5,
                          fontWeight: 600,
                          color: cfg.color,
                          background: `${cfg.color}15`,
                          padding: '3px 8px',
                          borderRadius: 6,
                        }}
                      >
                        <Icon size={13} />
                        {cfg.label}
                      </span>
                      {log.employeeName && (
                        <strong style={{ fontSize: 13.5 }}>{log.employeeName}</strong>
                      )}
                      {log.month && log.year && (
                        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                          ({monthLabel(log.month, log.year)})
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted)' }}>
                      <Clock size={12} />
                      <span>{log.at ? fmtDateTime(log.at) : 'Recent'}</span>
                    </div>
                  </div>

                  {/* Actor and note */}
                  <div style={{ fontSize: 12, marginBottom: hasDiff ? 8 : 2 }}>
                    <span style={{ color: 'var(--muted)' }}>Executed by: </span>
                    <strong style={{ color: 'var(--ink)' }}>{log.actorName || 'System'}</strong>
                    {log.note && (
                      <span style={{ marginLeft: 8, color: 'var(--ink)' }}>
                        — <em>"{log.note}"</em>
                      </span>
                    )}
                  </div>

                  {/* Old vs New Values Diff Section */}
                  {hasDiff && (
                    <div
                      style={{
                        background: 'rgba(11, 40, 80, 0.03)',
                        borderRadius: 6,
                        padding: '8px 10px',
                        border: '1px solid var(--line)',
                        fontSize: 11.5,
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: 8,
                      }}
                    >
                      {log.oldValues.final_salary !== undefined && log.newValues.final_salary !== undefined && (
                        <div>
                          <span style={{ color: 'var(--muted)', display: 'block' }}>Net Take-Home Salary:</span>
                          <span style={{ color: '#ef4444', textDecoration: 'line-through' }}>
                            {formatPKR(log.oldValues.final_salary)}
                          </span>{' '}
                          <ArrowRight size={11} style={{ verticalAlign: 'middle', margin: '0 4px' }} />{' '}
                          <strong style={{ color: '#10b981' }}>{formatPKR(log.newValues.final_salary)}</strong>
                        </div>
                      )}

                      {log.oldValues.balance !== undefined && log.newValues.balance !== undefined && (
                        <div>
                          <span style={{ color: 'var(--muted)', display: 'block' }}>Balance Due:</span>
                          <span>{formatPKR(log.oldValues.balance)}</span>{' '}
                          <ArrowRight size={11} style={{ verticalAlign: 'middle', margin: '0 4px' }} />{' '}
                          <strong style={{ color: 'var(--blue)' }}>{formatPKR(log.newValues.balance)}</strong>
                        </div>
                      )}

                      {log.oldValues.deduction !== undefined && log.newValues.deduction !== undefined && (
                        <div>
                          <span style={{ color: 'var(--muted)', display: 'block' }}>Leave Deductions:</span>
                          <span>{formatPKR(log.oldValues.deduction)}</span>{' '}
                          <ArrowRight size={11} style={{ verticalAlign: 'middle', margin: '0 4px' }} />{' '}
                          <strong>{formatPKR(log.newValues.deduction)}</strong>
                        </div>
                      )}

                      {log.oldValues.bonus !== undefined && log.newValues.bonus !== undefined && (
                        <div>
                          <span style={{ color: 'var(--muted)', display: 'block' }}>Attendance Bonus:</span>
                          <span>{formatPKR(log.oldValues.bonus)}</span>{' '}
                          <ArrowRight size={11} style={{ verticalAlign: 'middle', margin: '0 4px' }} />{' '}
                          <strong style={{ color: '#10b981' }}>{formatPKR(log.newValues.bonus)}</strong>
                        </div>
                      )}

                      {log.oldValues.present_days !== undefined && log.newValues.present_days !== undefined && (
                        <div>
                          <span style={{ color: 'var(--muted)', display: 'block' }}>Attendance Counts:</span>
                          <span>
                            {log.oldValues.present_days}P / {log.oldValues.leave_days || 0}L / {log.oldValues.absent_days || 0}A
                          </span>{' '}
                          <ArrowRight size={11} style={{ verticalAlign: 'middle', margin: '0 4px' }} />{' '}
                          <strong>
                            {log.newValues.present_days}P / {log.newValues.leave_days || 0}L / {log.newValues.absent_days || 0}A
                          </strong>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
