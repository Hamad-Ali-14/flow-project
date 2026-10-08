import React, { useState, useMemo } from 'react';
import {
  X,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  Award,
  Search,
  User,
  ArrowRight,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { formatKarachiDate } from '../../dateUtils';

export default function EmployeeHistoryModal({ employee, records = [], onClose }) {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const empName = employee?.name || employee?.full_name || employee?.[0] || 'Employee';
  const designation = employee?.designation || employee?.[1] || 'Staff Member';
  const shift = employee?.shiftName || employee?.shift || employee?.[2] || 'Shift 1 - Day';
  const empId = String(employee?.id || employee?.employeeId || employee?.[0] || '');

  // Filter records specifically for this employee
  const employeeRecords = useMemo(() => {
    return records
      .filter((r) => {
        const idMatch = String(r.employeeId || r.employee_id) === empId;
        const nameMatch = (r.employeeName || r.employee_name) === empName;
        return idMatch || nameMatch;
      })
      .sort((a, b) => (b.date > a.date ? 1 : -1));
  }, [records, empId, empName]);

  const stats = useMemo(() => {
    let present = 0;
    let absent = 0;
    let leave = 0;
    for (const r of employeeRecords) {
      if (r.status === 'Present') present++;
      else if (r.status === 'Absent') absent++;
      else if (r.status === 'Leave') leave++;
    }
    const total = employeeRecords.length;
    const rate = total > 0 ? Math.round((present / total) * 100) : 0;
    const isPerfect = leave === 0 && absent === 0 && present > 0;
    return { total, present, absent, leave, rate, isPerfect };
  }, [employeeRecords]);

  const filteredRecords = useMemo(() => {
    return employeeRecords.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const dateStr = (r.date || '').toLowerCase();
        const notesStr = (r.notes || '').toLowerCase();
        if (!dateStr.includes(q) && !notesStr.includes(q)) return false;
      }
      return true;
    });
  }, [employeeRecords, statusFilter, search]);

  const getStatusBadge = (status) => {
    if (status === 'Present') {
      return (
        <span className="att-status-pill present">
          <CheckCircle2 size={13} />
          {t('present', 'Present')}
        </span>
      );
    }
    if (status === 'Absent') {
      return (
        <span className="att-status-pill absent">
          <XCircle size={13} />
          {t('absent', 'Absent')}
        </span>
      );
    }
    return (
      <span className="att-status-pill leave">
        <Clock size={13} />
        {t('leave', 'Leave')}
      </span>
    );
  };

  return (
    <div className="modal-layer" onMouseDown={onClose} id="employee-history-modal-overlay">
      <div
        className="modal att-history-modal"
        onMouseDown={(e) => e.stopPropagation()}
        style={{ maxWidth: 760, width: '95%' }}
      >
        <div className="modal-top">
          <div className="modal-mark">
            <User size={20} />
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close dialog">
            <X size={19} />
          </button>
        </div>

        <div className="att-modal-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0 }}>{empName}</h2>
              {stats.isPerfect && (
                <span className="perfect-star-badge" title="Perfect Attendance (0 Leaves, 0 Absents)">
                  <Award size={13} /> Perfect Attendance
                </span>
              )}
            </div>
            <p style={{ margin: '4px 0 0 0', color: 'var(--muted)' }}>
              {designation} • <span className="att-shift-tag">{shift}</span>
            </p>
          </div>
        </div>

        {/* Aggregate Stats Strip */}
        <div className="att-modal-stats-grid">
          <div className="att-stat-mini">
            <span>{t('records', 'Total Days')}</span>
            <strong>{stats.total}</strong>
          </div>
          <div className="att-stat-mini present">
            <span>{t('present', 'Present')}</span>
            <strong style={{ color: 'var(--green)' }}>{stats.present}</strong>
          </div>
          <div className="att-stat-mini leave">
            <span>{t('leave', 'Leave')}</span>
            <strong style={{ color: '#d97706' }}>{stats.leave}</strong>
          </div>
          <div className="att-stat-mini absent">
            <span>{t('absent', 'Absent')}</span>
            <strong style={{ color: 'var(--red)' }}>{stats.absent}</strong>
          </div>
          <div className="att-stat-mini">
            <span>{t('attendance_rate', 'Rate')}</span>
            <strong style={{ color: 'var(--blue)' }}>{stats.rate}%</strong>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="att-modal-toolbar">
          <div className="table-search search" style={{ flex: 1, minWidth: 180 }}>
            <Search size={14} />
            <input
              placeholder="Search date, notes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="att-filter-group">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="att-select"
            >
              <option value="all">All Statuses</option>
              <option value="Present">Present Only</option>
              <option value="Leave">Leave Only</option>
              <option value="Absent">Absent Only</option>
            </select>
          </div>
        </div>

        {/* Records Table */}
        <div className="att-modal-table-wrap">
          {filteredRecords.length > 0 ? (
            <table className="att-history-table">
              <thead>
                <tr>
                  <th>{t('col_date', 'Date')}</th>
                  <th>{t('col_shift', 'Shift')}</th>
                  <th>{t('col_status', 'Status')}</th>
                  <th>Timing</th>
                  <th>Source</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((r, idx) => (
                  <tr key={r.id || `${r.date}-${idx}`}>
                    <td>
                      <strong>
                        {formatKarachiDate(new Date(`${r.date}T12:00:00+05:00`))}
                      </strong>
                      <small style={{ display: 'block', color: 'var(--muted)', fontSize: 11 }}>
                        {r.date}
                      </small>
                    </td>
                    <td>
                      <span className="att-shift-sub">{r.shiftName || shift}</span>
                    </td>
                    <td>{getStatusBadge(r.status)}</td>
                    <td>
                      {r.checkInTime || r.checkOutTime ? (
                        <small style={{ fontFamily: 'monospace', color: 'var(--ink)' }}>
                          {r.checkInTime || '--:--'} - {r.checkOutTime || '--:--'}
                        </small>
                      ) : (
                        <span style={{ color: 'var(--muted)' }}>—</span>
                      )}
                    </td>
                    <td>
                      <span className="att-source-badge">{r.attendanceSource || 'Manual'}</span>
                    </td>
                    <td>
                      <span className="att-notes-text">{r.notes || '—'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="att-empty-state">
              <Calendar size={32} style={{ opacity: 0.4, marginBottom: 8 }} />
              <p>No attendance records match the selected filter.</p>
            </div>
          )}
        </div>

        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button className="button primary" onClick={onClose} id="close-emp-history-btn">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
