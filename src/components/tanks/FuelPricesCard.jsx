import React, { useState } from 'react';
import { CalendarClock, Tag, X } from 'lucide-react';
import { formatPrice } from '../../utils/formatters';
import { formatKarachiDateTime } from '../../dateUtils';
import { useLanguage } from '../../context/LanguageContext';
import FuelPriceModal from './FuelPriceModal';

// Owner/admin/manager: TanksPage renders this when permissions.manage_prices is true.
export default function FuelPricesCard({ prices, api, onChanged, notify }) {
  const { t } = useLanguage();
  const [editing, setEditing] = useState(null);
  const [cancelling, setCancelling] = useState('');
  if (!prices) return null;

  const cancel = async fuel => {
    setCancelling(fuel.pending.id);
    try { onChanged(await api.cancelScheduledPrice(fuel.pending.id)); notify(`Scheduled ${fuel.name} price change cancelled`); }
    catch (e) { notify(e.message); }
    setCancelling('');
  };

  return (
    <section className="card table-card price-card">
      <div className="card-head">
        <div><h2>{t('fuel_prices') || 'Fuel prices'}</h2><p>Active price per litre. Sales are valued at the price active when a shift is closed. Shared by owner, admin and managers: a change made by any of them updates for everyone.</p></div>
        <span className="calibration-chip"><CalendarClock size={15} /> {t('scheduled_changes_note') || 'Scheduled changes apply at 12:00 AM PKT'}</span>
      </div>

      <div className="price-grid">
        {prices.fuels.map(f => (
          <div className="price-tile" key={f.id}>
            <div className="price-tile-top"><span className="tank-badge"><Tag size={16} /></span><strong>{f.name}</strong></div>
            <div className="price-now">{f.price > 0 ? formatPrice(f.price) : (t('no_price_set') || 'Not set')}<small> / litre</small></div>
            <div className="price-since">{f.effectiveFrom ? `${t('active_since') || 'Active since'} ${formatKarachiDateTime(f.effectiveFrom)}` : (t('no_price_set') || 'No price has been set yet')}</div>
            {f.pending && (
              <div className="price-pending">
                <span><b>{formatPrice(f.pending.price)}</b> from {formatKarachiDateTime(f.pending.effectiveAt)}</span>
                <button type="button" className="link-btn tiny" onClick={() => cancel(f)} disabled={cancelling === f.pending.id}><X size={12} /> {cancelling === f.pending.id ? 'Cancelling...' : (t('cancel') || 'Cancel')}</button>
              </div>
            )}
            <button type="button" className="button secondary small" onClick={() => setEditing(f.id)}>{t('change_price') || 'Change price'}</button>
          </div>
        ))}
        {!prices.fuels.length && <p className="snapshot-note">No fuel products are configured.</p>}
      </div>

      {prices.history.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr>{['Took effect (PKT)', 'Fuel', 'Price', 'Previous', 'How', 'Set by'].map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {prices.history.slice(0, 6).map(h => (
                <tr key={h.id}>
                  <td>{formatKarachiDateTime(h.effectiveFrom)}</td><td>{h.fuelName}</td>
                  <td><strong className="row-title">{formatPrice(h.price)}</strong></td>
                  <td>{h.previousPrice != null ? formatPrice(h.previousPrice) : '-'}</td>
                  <td>{{ INITIAL: 'Initial', INSTANT: 'Instant', SCHEDULED: 'Scheduled' }[h.source] || h.source}</td>
                  <td>{h.userName || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && prices.fuels.find(f => f.id === editing) && (
        <FuelPriceModal fuel={prices.fuels.find(f => f.id === editing)} api={api} onClose={() => setEditing(null)}
          onDone={(next, message) => { onChanged(next); notify(message); setEditing(null); }} />
      )}
    </section>
  );
}
