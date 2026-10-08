import React, { useState } from 'react';
import { CircleCheck, Scale } from 'lucide-react';
import { ModalShell, Alert, FieldError, SummaryRow } from './ModalShell';
import { validateAdjustment } from '../../utils/inventoryCalculations';
import { formatLiters, formatSignedLiters } from '../../utils/formatters';
import { useLanguage } from '../../context/LanguageContext';

export default function StockAdjustmentModal({ tank, api, onClose, onDone }) {
  const { t } = useLanguage();
  const [direction, setDirection] = useState('decrease');
  const [amountText, setAmountText] = useState('');
  const [reason, setReason] = useState('');
  const [approval, setApproval] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState('');

  const check = validateAdjustment({ direction, amountText, currentStock: tank.currentStock, capacity: tank.capacity });
  const reasonOk = reason.trim().length >= 3;
  const showAmountError = (touched || amountText !== '') && !check.valid;

  const submit = async event => {
    event.preventDefault();
    setTouched(true);
    setServerError('');
    if (!check.valid || !reasonOk || busy) return;
    setBusy(true);
    try {
      const result = await api.adjustStock({ tankId: tank.id, adjustment: check.signedAmount, reason: reason.trim(), approvalNote: approval.trim() });
      await onDone(`Stock adjustment of ${formatSignedLiters(check.signedAmount)} posted to ${tank.name}. Stock is now ${formatLiters(result.tank.currentStock)}.`, result);
    } catch (error) {
      setServerError(error.message);
      setBusy(false);
    }
  };

  return (
    <ModalShell icon={Scale} title={t('stock_adjustment') || "Stock adjustment"} subtitle="For authorised reconciliation only. Normal fuel deduction happens automatically at shift closing." onClose={onClose} busy={busy}>
      <form onSubmit={submit} noValidate>
        <div className="form-grid">
          <div><label>{t('col_tank') || 'Tank'}</label><input value={`${tank.name} - ${tank.fuelName}`} readOnly /></div>
          <div><label>{t('current_stock') || 'System stock'}</label><input value={formatLiters(tank.currentStock)} readOnly /></div>
        </div>

        <label>{t('adjustment_type') || 'Adjustment type'}</label>
        <div className="segmented" role="group" aria-label="Adjustment type">
          <button type="button" className={direction === 'decrease' ? 'active' : ''} aria-pressed={direction === 'decrease'} onClick={() => setDirection('decrease')} disabled={busy}>{t('decrease') || 'Decrease'}</button>
          <button type="button" className={direction === 'increase' ? 'active' : ''} aria-pressed={direction === 'increase'} onClick={() => setDirection('increase')} disabled={busy}>{t('increase') || 'Increase'}</button>
        </div>

        <label htmlFor="adj-amount">Amount (litres) *</label>
        <input id="adj-amount" autoFocus inputMode="decimal" value={amountText} placeholder="e.g. 150" className={showAmountError ? 'invalid' : ''}
          onChange={e => setAmountText(e.target.value)} disabled={busy} />
        <FieldError>{showAmountError ? check.message : ''}</FieldError>
        {check.valid && (
          <div className="inv-summary">
            <SummaryRow label="Adjustment" value={formatSignedLiters(check.signedAmount)} />
            <SummaryRow label="Stock after adjustment" value={formatLiters(check.projectedStock)} />
          </div>
        )}

        <label htmlFor="adj-reason">Reason *</label>
        <input id="adj-reason" value={reason} maxLength={300} placeholder="e.g. Physical stock reconciliation"
          className={touched && !reasonOk ? 'invalid' : ''} onChange={e => setReason(e.target.value)} disabled={busy} />
        <FieldError>{touched && !reasonOk ? 'A reason is required.' : ''}</FieldError>

        <label htmlFor="adj-approval">Approval note (optional)</label>
        <input id="adj-approval" value={approval} maxLength={300} placeholder="e.g. Approved by owner" onChange={e => setApproval(e.target.value)} disabled={busy} />

        <Alert>{serverError}</Alert>
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose} disabled={busy}>{t('cancel') || 'Cancel'}</button>
          <button type="submit" className="button primary" disabled={busy}><CircleCheck size={17} /> {busy ? (t('saving') || 'Posting...') : (t('post_adjustment') || 'Post adjustment')}</button>
        </div>
      </form>
    </ModalShell>
  );
}
