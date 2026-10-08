import React, { useState } from 'react';
import {
  X,
  CreditCard,
  Banknote,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Receipt,
  User,
} from 'lucide-react';
import { formatPKR } from '../../utils/formatters';
import { METHOD_LABEL, karachiToday } from '../../utils/payrollUiHelpers';
import { monthLabel } from '../../utils/payrollCalculations';

// Balances can carry paisa (e.g. 56,833.33 final salary - 56,833 paid = 0.33). formatPKR rounds to whole
// rupees and would show "PKR 0" for a balance that is still payable, so show decimals when there are any.
const roundPaisa = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const formatBalance = (n) => {
  const v = roundPaisa(n);
  return Number.isInteger(v) ? formatPKR(v) : `PKR ${v.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export default function RecordPaymentModal({ record, onClose, onRecordPayment }) {
  const [amount, setAmount] = useState(roundPaisa(record?.balance || 0));
  const [paymentDate, setPaymentDate] = useState(() => karachiToday());
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!record) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const numAmount = roundPaisa(amount);
    if (!numAmount || numAmount <= 0) {
      setError('Please enter a valid payment amount greater than zero.');
      return;
    }
    if (numAmount > roundPaisa(record.balance)) {
      setError(`Amount exceeds unpaid balance of ${formatBalance(record.balance)}.`);
      return;
    }
    if (method !== 'cash' && (!reference || !reference.trim())) {
      setError(`A payment reference/transaction ID is required for ${METHOD_LABEL[method]}.`);
      return;
    }

    setBusy(true);
    setError('');
    try {
      await onRecordPayment(record.id, {
        amount: numAmount,
        paymentDate,
        method,
        reference: reference.trim() || null,
        note: note.trim() || null,
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to record payment');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-layer" onMouseDown={onClose} id="record-payment-modal-overlay">
      <div
        className="modal att-history-modal"
        onMouseDown={(e) => e.stopPropagation()}
        style={{ maxWidth: 580, width: '95%' }}
      >
        <div className="modal-top">
          <div className="modal-mark">
            <Banknote size={20} />
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close dialog">
            <X size={19} />
          </button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Record Salary Payment</h2>
          </div>
          <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: 13 }}>
            Post a salary disbursement to the immutable payment ledger for {record.employeeName}
          </p>
        </div>

        {/* Balance Card */}
        <div className="att-corr-info-card" style={{ marginBottom: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <User size={15} color="var(--blue)" />
              <strong style={{ fontSize: 14 }}>{record.employeeName}</strong>
            </div>
            <small style={{ color: 'var(--muted)', display: 'block', marginTop: 2 }}>
              {record.designation} • {monthLabel(record.month, record.year)}
            </small>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700 }}>
              Unpaid Balance
            </span>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: record.balance > 0 ? '#dc2626' : 'var(--green)' }}>
              {formatBalance(record.balance)}
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            {/* Amount */}
            <div>
              <label style={{ display: 'block', fontWeight: 600, fontSize: 12.5, marginBottom: 5 }}>
                Payment Amount (PKR) <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={roundPaisa(record.balance)}
                className="att-notes-input"
                style={{ width: '100%', fontWeight: 700 }}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
              <div style={{ marginTop: 4, display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="button secondary tiny"
                  onClick={() => setAmount(roundPaisa(record.balance))}
                >
                  Full ({formatBalance(record.balance)})
                </button>
                {record.balance > 5000 && (
                  <button
                    type="button"
                    className="button secondary tiny"
                    onClick={() => setAmount(roundPaisa(record.balance / 2))}
                  >
                    50% ({formatBalance(record.balance / 2)})
                  </button>
                )}
              </div>
            </div>

            {/* Date */}
            <div>
              <label style={{ display: 'block', fontWeight: 600, fontSize: 12.5, marginBottom: 5 }}>
                Payment Date <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <input
                type="date"
                max={karachiToday()}
                className="att-notes-input"
                style={{ width: '100%' }}
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            {/* Payment Method */}
            <div>
              <label style={{ display: 'block', fontWeight: 600, fontSize: 12.5, marginBottom: 5 }}>
                Payment Method <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <select
                className="att-select"
                style={{ width: '100%' }}
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                <option value="cash">Cash in Hand</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="cheque">Cheque</option>
                <option value="mobile_wallet">Mobile Wallet (JazzCash / EasyPaisa)</option>
              </select>
            </div>

            {/* Reference */}
            <div>
              <label style={{ display: 'block', fontWeight: 600, fontSize: 12.5, marginBottom: 5 }}>
                Ref / Cheque / Tx ID {method !== 'cash' && <span style={{ color: '#dc2626' }}>*</span>}
              </label>
              <input
                type="text"
                className="att-notes-input"
                style={{ width: '100%' }}
                placeholder={method === 'cash' ? 'Optional voucher #' : 'e.g., TXN-998812'}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                required={method !== 'cash'}
              />
            </div>
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontWeight: 600, fontSize: 12.5, marginBottom: 5 }}>
              Payment Note / Disbursement Remarks
            </label>
            <input
              type="text"
              className="att-notes-input"
              style={{ width: '100%' }}
              placeholder="e.g., Paid by manager on duty after shift change"
              value={note}
              onChange={(e) => setNote(e.target.value)}
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
            <button type="submit" className="button primary" disabled={busy}>
              {busy ? 'Saving...' : 'Record Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
