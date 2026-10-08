import React, { useMemo, useState } from 'react';
import { CircleCheck, Tag } from 'lucide-react';
import { ModalShell, Alert, FieldError, SummaryRow } from './ModalShell';
import { parseDecimalInput } from '../../utils/inventoryCalculations';
import { formatPrice } from '../../utils/formatters';
import { addDaysISO, formatKarachiDateTime, getKarachiTodayISO, karachiToInstant } from '../../dateUtils';
import { useLanguage } from '../../context/LanguageContext';

// Owner/admin only (the page does not render this for anyone else, and the database refuses the
// call for other roles). Two ways to change a price:
//   Scheduled - switches automatically at the chosen Pakistan time (default: next 12:00 AM PKT)
//   Instant   - applies immediately
export default function FuelPriceModal({ fuel, api, onClose, onDone }) {
  const { t } = useLanguage();
  const [priceText, setPriceText] = useState('');
  const [mode, setMode] = useState('scheduled');
  const [date, setDate] = useState(() => addDaysISO(getKarachiTodayISO(), 1));
  const [time, setTime] = useState('00:00');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState('');

  const parsed = parseDecimalInput(priceText);
  const priceError = parsed.error || (parsed.value <= 0 ? 'Price must be greater than zero.' : parsed.value > 100000 ? 'That price looks too high.' : '');
  const when = useMemo(() => (mode === 'scheduled' ? karachiToInstant(date, time) : null), [mode, date, time]);
  const whenError = mode === 'scheduled' ? (!when ? 'Choose a date and time.' : when.getTime() <= Date.now() ? 'The scheduled time must be in the future.' : '') : '';
  const valid = !priceError && !whenError;
  const showPriceError = (touched || priceText !== '') && priceError;

  const submit = async event => {
    event.preventDefault();
    setTouched(true);
    setServerError('');
    if (!valid || busy) return;
    setBusy(true);
    try {
      const next = await api.setFuelPrice({ fuelTypeId: fuel.id, price: parsed.value, mode, effectiveAt: when ? when.toISOString() : null });
      onDone(next, mode === 'instant'
        ? `${fuel.name} price is now ${formatPrice(parsed.value)} per litre.`
        : `${fuel.name} will change to ${formatPrice(parsed.value)} on ${formatKarachiDateTime(when)}.`);
    } catch (error) {
      setServerError(error.message);
      setBusy(false);
    }
  };

  return (
    <ModalShell icon={Tag} title={`${t('change_price') || 'Change price'} - ${fuel.name}`} subtitle="Prices are per litre in PKR. Pakistan time (Asia/Karachi) is used for every schedule." onClose={onClose} busy={busy}>
      <form onSubmit={submit} noValidate>
        <div className="form-grid">
          <div><label>Current price</label><input value={fuel.price > 0 ? formatPrice(fuel.price) : (t('no_price_set') || 'Not set')} readOnly /></div>
          <div><label htmlFor="price-new">New price (PKR / litre) *</label>
            <input id="price-new" autoFocus inputMode="decimal" value={priceText} placeholder="e.g. 268.75" className={showPriceError ? 'invalid' : ''}
              aria-invalid={Boolean(showPriceError)} onChange={e => setPriceText(e.target.value)} disabled={busy} /></div>
        </div>
        <FieldError>{showPriceError ? priceError : ''}</FieldError>

        <label>When should it apply?</label>
        <div className="price-mode" role="radiogroup" aria-label="When the price applies">
          <button type="button" role="radio" aria-checked={mode === 'scheduled'} className={mode === 'scheduled' ? 'on' : ''} onClick={() => setMode('scheduled')} disabled={busy}>
            <strong>Scheduled</strong><span>At a set Pakistan time (default 12:00 AM PKT)</span>
          </button>
          <button type="button" role="radio" aria-checked={mode === 'instant'} className={mode === 'instant' ? 'on' : ''} onClick={() => setMode('instant')} disabled={busy}>
            <strong>Instant update</strong><span>Apply right now</span>
          </button>
        </div>

        {mode === 'scheduled' && (
          <div className="form-grid">
            <div><label htmlFor="price-date">Date (PKT)</label><input id="price-date" type="date" min={getKarachiTodayISO()} value={date} onChange={e => setDate(e.target.value)} disabled={busy} /></div>
            <div><label htmlFor="price-time">Time (PKT)</label><input id="price-time" type="time" value={time} onChange={e => setTime(e.target.value)} disabled={busy} /></div>
          </div>
        )}
        <FieldError>{whenError}</FieldError>

        {valid && (
          <div className="inv-summary">
            <SummaryRow label="Price" value={`${fuel.price > 0 ? formatPrice(fuel.price) : (t('no_price_set') || 'Not set')}  ->  ${formatPrice(parsed.value)}`} />
            <SummaryRow label="Takes effect" value={mode === 'instant' ? 'Immediately' : formatKarachiDateTime(when)} />
          </div>
        )}
        {mode === 'instant' && <Alert tone="info">Sales are valued when a shift is closed, so an instant change also applies to any shift that is still open.</Alert>}
        {mode === 'scheduled' && fuel.pending && <Alert tone="info">This replaces the change already scheduled for {formatKarachiDateTime(fuel.pending.effectiveAt)}.</Alert>}
        <Alert>{serverError}</Alert>

        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose} disabled={busy}>{t('cancel') || 'Cancel'}</button>
          <button type="submit" className="button primary" disabled={busy || (touched && !valid)}><CircleCheck size={17} /> {busy ? (t('saving') || 'Saving...') : mode === 'instant' ? (t('save') || 'Apply now') : (t('save') || 'Schedule price')}</button>
        </div>
      </form>
    </ModalShell>
  );
}
