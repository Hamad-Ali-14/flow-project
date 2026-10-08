import React, { useState } from 'react';
import { CircleCheck, Droplets } from 'lucide-react';
import { ModalShell, Alert, FieldError, SummaryRow } from './ModalShell';
import { parseDecimalInput, validateReceiveQuantity, calculateStockPercentage } from '../../utils/inventoryCalculations';
import { formatLiters } from '../../utils/formatters';
import { useLanguage } from '../../context/LanguageContext';

export default function ReceiveFuelModal({ tank, api, onClose, onDone }) {
  const { t } = useLanguage();
  const [quantityText, setQuantityText] = useState('');
  const [reference, setReference] = useState('');
  const [remarks, setRemarks] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState('');

  const parsed = parseDecimalInput(quantityText);
  const check = parsed.error
    ? { valid: false, message: parsed.error }
    : validateReceiveQuantity({ quantity: parsed.value, currentStock: tank.currentStock, capacity: tank.capacity });
  const showError = (touched || quantityText !== '') && !check.valid;

  const submit = async event => {
    event.preventDefault();
    setTouched(true);
    setServerError('');
    if (!check.valid || busy) return;
    setBusy(true);
    try {
      // Resolves only if the database committed the receipt; it returns the persisted record.
      const result = await api.receiveFuel({ tankId: tank.id, quantity: parsed.value, reference: reference.trim(), remarks: remarks.trim() });
      await onDone(`${formatLiters(parsed.value)} received into ${tank.name}. Stock is now ${formatLiters(result.tank.currentStock)}.`, result);
    } catch (error) {
      setServerError(error.message);
      setBusy(false);
    }
  };

  return (
    <ModalShell icon={Droplets} title={t('receive_fuel') || "Receive fuel"} subtitle="Record a delivery. Stock is updated and a history entry is created." onClose={onClose} busy={busy}>
      <form onSubmit={submit} noValidate>
        <div className="form-grid">
          <div><label>{t('col_tank') || 'Tank'}</label><input value={tank.name} readOnly /></div>
          <div><label>{t('col_product') || 'Fuel type'}</label><input value={tank.fuelName} readOnly /></div>
          <div><label>{t('current_stock') || 'Current stock'}</label><input value={formatLiters(tank.currentStock)} readOnly /></div>
          <div><label>{t('capacity') || 'Tank capacity'}</label><input value={formatLiters(tank.capacity)} readOnly /></div>
        </div>

        <label htmlFor="recv-qty">Quantity received (litres) *</label>
        <input
          id="recv-qty" autoFocus inputMode="decimal" value={quantityText} placeholder="e.g. 10,000"
          className={showError ? 'invalid' : ''} aria-invalid={showError}
          onChange={e => setQuantityText(e.target.value)} disabled={busy}
        />
        <FieldError>{showError ? check.message : ''}</FieldError>

        {check.valid && (
          <div className="inv-summary">
            <SummaryRow label="Stock after delivery" value={`${formatLiters(check.projectedStock)} (${Math.round(calculateStockPercentage(check.projectedStock, tank.capacity))}%)`} />
            <SummaryRow label="Space remaining" value={formatLiters(tank.capacity - check.projectedStock)} />
          </div>
        )}

        <label htmlFor="recv-ref">Delivery reference / invoice number</label>
        <input id="recv-ref" value={reference} maxLength={120} placeholder="e.g. INV-2026-00125" onChange={e => setReference(e.target.value)} disabled={busy} />

        <label htmlFor="recv-remarks">{t('col_remarks') || 'Remarks'}</label>
        <textarea id="recv-remarks" rows={2} value={remarks} maxLength={500} placeholder="e.g. Morning tanker delivery" onChange={e => setRemarks(e.target.value)} disabled={busy} />

        <Alert>{serverError}</Alert>
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose} disabled={busy}>{t('cancel') || 'Cancel'}</button>
          <button type="submit" className="button primary" disabled={busy || (touched && !check.valid)}>
            <CircleCheck size={17} /> {busy ? (t('saving') || 'Saving...') : (t('confirm_receipt') || 'Confirm receipt')}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
