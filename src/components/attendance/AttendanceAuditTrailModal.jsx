import React, { useState, useMemo } from 'react';
import {
  X,
  History,
  Search,
  Calendar,
  User,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { formatKarachiDate, formatKarachiDateTime } from '../../dateUtils';

export default function AttendanceAuditTrailModal({ auditLogs = [], onClose }) {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');

  const filteredLogs = useMemo(() => {
    if (!search.trim()) return auditLogs;
    const q = search.toLowerCase();
    return auditLogs.filter((log) => {
      const name = (log.employeeName || '').toLowerCase();
      const reason = (log.reason || '').toLowerCase();
      const by = (log.changedByName || '').toLowerCase();
      const date = (log.date || '').toLowerCase();
      return name.includes(q) || reason.includes(q) || by.includes(q) || date.includes(q);
    });
  }, [auditLogs, search]);

  return (
    <div className="modal-layer" onMouseDown={onClose} id="attendance-audit-trail-modal-overlay">
      <div
        className="modal att-history-modal"
        onMouseDown={(e) => e.stopPropagation()}
        style={{ maxWidth: 840, width: '95%' }}
      >
        <div className="modal-top">
          <div className="modal-mark">
            <History size={20} />
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close dialog">
            <X size={19} />
          </button>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: '1.3rem' }}>Attendance Audit Trail</h2>
            <span className="perfect-star-badge" style={{ background: 'rgba(29, 101, 219, 0.1)', color: 'var(--blue)', borderColor: 'rgba(29, 101, 219, 0.2)' }}>
              <ShieldCheck size={13} /> Tamper-Evident Log
            </span>
          </div>
          <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: 13 }}>
            Full record of who changed attendance, reason for correction, previous status, and date/time of modification
          </p>
        </div>

        {/* Search Bar */}
        <div className="table-search search" style={{ marginBottom: 14, width: '100%', maxWidth: 360 }}>
          <Search size={15} />
          <input
            placeholder="Search by employee, reason, changed by..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Audit Log Table */}
        <div className="att-modal-table-wrap">
          {filteredLogs.length > 0 ? (
            <table className="att-history-log-table">
              <thead>
                <tr>
                  <th>Target Date</th>
                  <th>Employee</th>
                  <th>Status Change</th>
                  <th>Correction Reason</th>
                  <th>Changed By</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => (
                  <tr key={log.id}>
                    <td>
                      <strong>
                        {log.date ? formatKarachiDate(new Date(`${log.date}T12:00:00+05:00`)) : '—'}
                      </strong>
                      <small style={{ display: 'block', color: 'var(--muted)', fontSize: 11 }}>
                        {log.date}
                      </small>
                    </td>
                    <td>
                      <strong>{log.employeeName}</strong>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className={`att-status-pill ${log.previousStatus?.toLowerCase()}`}>
                          {log.previousStatus}
                        </span>
                        <ArrowRight size={13} style={{ color: 'var(--muted)' }} />
                        <span className={`att-status-pill ${log.newStatus?.toLowerCase()}`}>
                          {log.newStatus}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="att-notes-text">"{log.reason}"</span>
                    </td>
                    <td>
                      <strong style={{ fontSize: 12.5, color: 'var(--ink)' }}>{log.changedByName}</strong>
                    </td>
                    <td>
                      <small style={{ color: 'var(--muted)' }}>
                        {log.createdAt ? formatKarachiDateTime(new Date(log.createdAt)) : '—'}
                      </small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="att-empty-state">
              <History size={32} style={{ opacity: 0.35, marginBottom: 8 }} />
              <p>No attendance correction audit entries found.</p>
            </div>
          )}
        </div>

        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button className="button primary" onClick={onClose} id="close-audit-trail-btn">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
