import React, { useState } from 'react';
import {
  X,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  User,
  Banknote,
  Calendar,
  Award,
} from 'lucide-react';
import { formatPKR } from '../../utils/formatters';
import { monthLabel } from '../../utils/payrollCalculations';

export default function PayrollReviewModal({ record, onClose, onReview }) {
  const [decision, setDecision] = useState('APPROVED');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!record) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (decision === 'REJECTED' && (!note || note.trim().length < 3)) {
      setError('Please provide a reason when rejecting payroll (at least 3 characters).');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onReview(record.id, decision, note.trim());
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to submit review');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-layer" onMouseDown={onClose} id="payroll-review-modal-overlay">
      <div
        className="modal att-history-modal"
        onMouseDown={(e) => e.stopPropagation()}
        style={{ maxWidth: 580, width: '95%' }}
      >
        <div className="modal-top">
          <div className="modal-mark">
            <CheckCircle2 size={20} />
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close dialog">
            <X size={19} />
          </button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Review Employee Payroll</h2>
          </div>
          <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: 13 }}>
            Review attendance calculations and approve or reject payroll for {monthLabel(record.month, record.year)}
          </p>
        </div>

        {/* Employee Summary Card */}
        <div className="att-corr-info-card" style={{ marginBottom: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <User size={15} color="var(--blue)" />
              <strong style={{ fontSize: 14 }}>{record.employeeName}</strong>
            </div>
            <small style={{ color: 'var(--muted)', display: 'block', marginTop: 2 }}>
              {record.designation} • {record.shiftName}
            </small>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700 }}>
              Final Net Payable
            </span>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--ink)' }}>
              {formatPKR(record.finalSalary)}
            </div>
          </div>
        </div>

        {/* Calculation Breakdown Details */}
        <div className="att-prev-audit-wrap" style={{ marginTop: 0, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, fontSize: 12.5 }}>
            <div>
              <span style={{ color: 'var(--muted)' }}>Base Monthly Salary:</span>{' '}
              <b>{formatPKR(record.monthlySalary)}</b>
            </div>
            <div>
              <span style={{ color: 'var(--muted)' }}>Daily Wage Rate (÷30):</span>{' '}
              <b>{formatPKR(record.dailySalary)}</b>
            </div>
            <div>
              <span style={{ color: 'var(--muted)' }}>Attendance Record:</span>{' '}
              <b>{record.presentDays}P / {record.leaveDays}L / {record.absentDays}A</b>
            </div>
            <div>
              <span style={{ color: 'var(--muted)' }}>Rule Applied:</span>{' '}
              {record.bonus > 0 ? (
                <b style={{ color: 'var(--green)' }}>+{formatPKR(record.bonus)} (⭐ Bonus)</b>
              ) : record.deduction > 0 ? (
                <b style={{ color: '#dc2626' }}>-{formatPKR(record.deduction)} (Deduction)</b>
              ) : (
                <b>Standard Wage</b>
              )}
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Decision Pill Selector */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
              Review Decision
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button
                type="button"
                className={`button ${decision === 'APPROVED' ? 'primary' : 'secondary'}`}
                onClick={() => setDecision('APPROVED')}
                style={{
                  justifyContent: 'center',
                  background: decision === 'APPROVED' ? 'var(--green)' : undefined,
                  borderColor: decision === 'APPROVED' ? 'var(--green)' : undefined,
                }}
              >
                <CheckCircle2 size={16} />
                <span>Approve Payroll</span>
              </button>
              <button
                type="button"
                className={`button ${decision === 'REJECTED' ? 'primary' : 'secondary'}`}
                onClick={() => setDecision('REJECTED')}
                style={{
                  justifyContent: 'center',
                  background: decision === 'REJECTED' ? '#dc2626' : undefined,
                  borderColor: decision === 'REJECTED' ? '#dc2626' : undefined,
                }}
              >
                <XCircle size={16} />
                <span>Reject & Request Review</span>
              </button>
            </div>
          </div>

          {/* Note Input */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
              Review Note / Reason {decision === 'REJECTED' && <span style={{ color: '#dc2626' }}>*</span>}
            </label>
            <textarea
              className="att-notes-input"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={decision === 'APPROVED' ? 'Optional approval note (e.g., Verified shift logs)...' : 'Mandatory reason for rejection (e.g., Attendance requires correction)...'}
              style={{ width: '100%', height: 75, padding: '8px 10px' }}
            />
          </div>

          {error && (
            <div className="att-error-banner" style={{ marginBottom: 14 }}>
              <AlertTriangle size={15} />
              <span>{error}</span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="button secondary" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button
              type="submit"
              className="button primary"
              disabled={busy}
              style={{ background: decision === 'APPROVED' ? 'var(--green)' : '#dc2626' }}
            >
              {busy ? 'Saving...' : decision === 'APPROVED' ? 'Confirm Approval' : 'Confirm Rejection'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
