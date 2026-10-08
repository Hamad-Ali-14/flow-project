import React, { useState, useMemo } from 'react';
import {
  X,
  FileEdit,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  UserCheck,
  History,
  Lock,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { formatKarachiDate, formatKarachiDateTime } from '../../dateUtils';
import { payrollApi } from '../../services/payrollService';

export default function AttendanceCorrectionModal({
  record,
  employee,
  auditHistory = [],
  currentUserName = 'Station Staff',
  onClose,
  onSaveCorrection,
}) {
  const { t } = useLanguage();
  const [newStatus, setNewStatus] = useState(record?.status || 'Present');
  const [reason, setReason] = useState('');
  const [checkIn, setCheckIn] = useState(record?.checkInTime || '07:00');
  const [checkOut, setCheckOut] = useState(record?.checkOutTime || '19:00');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const empName = record?.employeeName || employee?.name || 'Staff Member';
  const designation = record?.designation || employee?.designation || 'Staff';
  const dateStr = record?.date || '';
  const previousStatus = record?.status || 'Unmarked';
  const empId = record?.employeeId || employee?.id;

  // Module 11: Check if period has a locked & finalized payroll
  const isLockedPeriod = useMemo(() => {
    if (!dateStr) return false;
    const [y, m] = dateStr.split('-').map(Number);
    return payrollApi.isPeriodLocked ? payrollApi.isPeriodLocked(m, y, empId) : false;
  }, [dateStr, empId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason || reason.trim().length < 3) {
      setError('Please provide a valid correction reason (at least 3 characters).');
      return;
    }
    if (newStatus === previousStatus && checkIn === record?.checkInTime && checkOut === record?.checkOutTime) {
      setError('Please change the status or timing to make a correction.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      await onSaveCorrection({
        attendanceId: record?.id,
        employeeId: empId,
        date: dateStr,
        previousStatus,
        newStatus,
        reason: reason.trim(),
        newCheckIn: newStatus === 'Present' ? checkIn : null,
        newCheckOut: newStatus === 'Present' ? checkOut : null,
        changedByName: currentUserName,
        recalculatePayroll: isLockedPeriod,
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to record correction.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-layer" onMouseDown={onClose} id="attendance-correction-modal-overlay">
      <div
        className="modal att-correction-modal"
        onMouseDown={(e) => e.stopPropagation()}
        style={{ maxWidth: 580, width: '95%' }}
      >
        <div className="modal-top">
          <div className="modal-mark">
            <FileEdit size={19} />
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close dialog">
            <X size={19} />
          </button>
        </div>

        <div style={{ marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Attendance Correction</h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: 13 }}>
            Edit attendance record with mandatory audit trail log
          </p>
        </div>

        {/* Record Overview Card */}
        <div className="att-corr-info-card">
          <div>
            <strong style={{ fontSize: 14 }}>{empName}</strong>
            <small style={{ display: 'block', color: 'var(--muted)' }}>{designation}</small>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>
              {dateStr ? formatKarachiDate(new Date(`${dateStr}T12:00:00+05:00`)) : ''}
            </span>
            <div style={{ marginTop: 2 }}>
              <span className="att-status-pill neutral">
                Current: <b>{previousStatus}</b>
              </span>
            </div>
          </div>
        </div>

        {/* Module 11: Locked Payroll Notice */}
        {isLockedPeriod && (
          <div className="att-rule-banner" style={{ marginTop: 12, borderLeft: '4px solid #d97706', background: 'rgba(217, 119, 6, 0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#d97706', fontWeight: 700, fontSize: 13 }}>
              <Lock size={15} /> Finalized & Locked Payroll Period
            </div>
            <p style={{ margin: '3px 0 0 0', fontSize: 12, color: 'var(--ink)' }}>
              Payroll for this month is finalized and locked. Saving this correction will automatically recalculate wages and record an approved manager override in the audit log.
            </p>
          </div>
        )}

        {error && (
          <div className="att-error-banner" role="alert">
            <AlertTriangle size={15} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ marginTop: 16 }}>
          {/* New Status Selector */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontWeight: 600, fontSize: 12.5, marginBottom: 8, color: 'var(--ink)' }}>
              Corrected Status *
            </label>
            <div className="att-status-buttons" style={{ display: 'flex', width: '100%' }}>
              <button
                type="button"
                className={`att-status-btn present ${newStatus === 'Present' ? 'active' : ''}`}
                style={{ flex: 1, justifyContent: 'center', padding: '9px 12px' }}
                onClick={() => setNewStatus('Present')}
              >
                <CheckCircle2 size={15} /> Present
              </button>
              <button
                type="button"
                className={`att-status-btn absent ${newStatus === 'Absent' ? 'active' : ''}`}
                style={{ flex: 1, justifyContent: 'center', padding: '9px 12px' }}
                onClick={() => setNewStatus('Absent')}
              >
                <XCircle size={15} /> Absent
              </button>
              <button
                type="button"
                className={`att-status-btn leave ${newStatus === 'Leave' ? 'active' : ''}`}
                style={{ flex: 1, justifyContent: 'center', padding: '9px 12px' }}
                onClick={() => setNewStatus('Leave')}
              >
                <Clock size={15} /> Leave
              </button>
            </div>
          </div>

          {/* Timings (if present) */}
          {newStatus === 'Present' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', fontWeight: 600, fontSize: 12, marginBottom: 4 }}>
                  Check-in Time
                </label>
                <input
                  type="time"
                  className="att-select"
                  style={{ width: '100%' }}
                  value={checkIn}
                  onChange={(e) => setCheckIn(e.target.value)}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600, fontSize: 12, marginBottom: 4 }}>
                  Check-out Time
                </label>
                <input
                  type="time"
                  className="att-select"
                  style={{ width: '100%' }}
                  value={checkOut}
                  onChange={(e) => setCheckOut(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Mandatory Reason for Correction */}
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="correction-reason-input" style={{ display: 'block', fontWeight: 600, fontSize: 12.5, marginBottom: 6 }}>
              Reason for Correction * <span style={{ color: 'var(--red)', fontWeight: 400 }}>(Required for audit)</span>
            </label>
            <textarea
              id="correction-reason-input"
              rows={3}
              className="att-select"
              style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
              placeholder="e.g. Sickness certificate submitted, manager verified attendance, mistaken absent..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
            <small style={{ color: 'var(--muted)', fontSize: 11 }}>
              Logged by: <b>{currentUserName}</b> • Recorded in audit trail
            </small>
          </div>

          {/* Previous Audit History on this record */}
          {auditHistory.length > 0 && (
            <div className="att-prev-audit-wrap">
              <strong style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <History size={13} /> Previous Corrections ({auditHistory.length}):
              </strong>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                {auditHistory.map((a) => (
                  <div key={a.id} className="att-audit-mini-item">
                    <div>
                      <span className="att-audit-arrow">
                        {a.previousStatus} ➔ {a.newStatus}
                      </span>{' '}
                      • <small style={{ color: 'var(--muted)' }}>"{a.reason}"</small>
                    </div>
                    <small style={{ color: 'var(--muted)' }}>
                      by {a.changedByName} • {formatKarachiDateTime(new Date(a.createdAt))}
                    </small>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="modal-actions" style={{ marginTop: 20 }}>
            <button type="button" className="button secondary" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button
              type="submit"
              className="button primary"
              id="confirm-correction-btn"
              disabled={busy || !reason.trim()}
            >
              <FileEdit size={16} /> Save Correction
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
