import React, { useCallback, useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { ModalShell, Alert } from './ModalShell';
import { formatLiters, formatSignedLiters, formatMm, formatPKR, formatPrice } from '../../utils/formatters';
import { formatKarachiDate } from '../../dateUtils';
import { useLanguage } from '../../context/LanguageContext';

const PAGE_SIZE = 25;
const TYPES = {
  OPENING_STOCK: { label: 'Opening stock', tone: 'info' },
  FUEL_RECEIVED: { label: 'Fuel received', tone: 'success' },
  NOZZLE_SALE: { label: 'Nozzle sale', tone: '' },
  STOCK_ADJUSTMENT: { label: 'Stock adjustment', tone: 'warning' },
};
const short = iso => formatKarachiDate(new Date(iso), { year: undefined, hour: '2-digit', minute: '2-digit', hour12: false });
const full = iso => formatKarachiDate(new Date(iso), { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

const emptyFilters = { dateFrom: '', dateTo: '', type: '', nozzleId: '', shiftNumber: '' };

export default function TankHistoryModal({ tank, api, onClose }) {
  const { t } = useLanguage();
  const [tab, setTab] = useState('stock');
  const [filters, setFilters] = useState(emptyFilters);
  const [debouncedShift, setDebouncedShift] = useState('');
  const [page, setPage] = useState(0);
  const [state, setState] = useState({ loading: true, rows: [], total: 0, error: '' });
  const [dips, setDips] = useState({ loading: true, rows: [], error: '' });

  useEffect(() => {
    const id = setTimeout(() => setDebouncedShift(filters.shiftNumber), 350);
    return () => clearTimeout(id);
  }, [filters.shiftNumber]);

  const load = useCallback(() => {
    let alive = true;
    setState(s => ({ ...s, loading: true, error: '' }));
    api.listTransactions({
      tankId: tank.id, dateFrom: filters.dateFrom, dateTo: filters.dateTo, type: filters.type,
      nozzleId: filters.nozzleId, shiftNumber: debouncedShift, limit: PAGE_SIZE, offset: page * PAGE_SIZE,
    })
      .then(({ rows, total }) => { if (alive) setState({ loading: false, rows, total, error: '' }); })
      .catch(error => { if (alive) setState({ loading: false, rows: [], total: 0, error: error.message }); });
    return () => { alive = false; };
  }, [api, tank.id, filters.dateFrom, filters.dateTo, filters.type, filters.nozzleId, debouncedShift, page]);

  useEffect(() => load(), [load]);

  useEffect(() => {
    if (tab !== 'dip') return undefined;
    let alive = true;
    setDips(d => ({ ...d, loading: true, error: '' }));
    api.listDips(tank.id, 50)
      .then(rows => { if (alive) setDips({ loading: false, rows, error: '' }); })
      .catch(error => { if (alive) setDips({ loading: false, rows: [], error: error.message }); });
    return () => { alive = false; };
  }, [api, tank.id, tab]);

  const change = key => event => { setPage(0); setFilters(f => ({ ...f, [key]: event.target.value })); };
  const filtered = Object.values(filters).some(Boolean);
  const pages = Math.max(1, Math.ceil(state.total / PAGE_SIZE));

  return (
    <ModalShell icon={History} wide title={`${tank.name} history`} subtitle={`${tank.fuelName} - every stock movement, newest first. History is permanent and cannot be edited.`} onClose={onClose}>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'stock'} className={tab === 'stock' ? 'active' : ''} onClick={() => setTab('stock')}>Stock movements</button>
        <button role="tab" aria-selected={tab === 'dip'} className={tab === 'dip' ? 'active' : ''} onClick={() => setTab('dip')}>Dip readings</button>
      </div>

      {tab === 'stock' && <>
        <div className="history-filters">
          <label>From<input type="date" value={filters.dateFrom} onChange={change('dateFrom')} /></label>
          <label>To<input type="date" value={filters.dateTo} onChange={change('dateTo')} /></label>
          <label>Transaction
            <select value={filters.type} onChange={change('type')}>
              <option value="">All types</option>
              {Object.entries(TYPES).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
            </select>
          </label>
          <label>Nozzle
            <select value={filters.nozzleId} onChange={change('nozzleId')}>
              <option value="">All nozzles</option>
              {tank.nozzles.map(n => <option key={n.id} value={n.id}>Nozzle {n.nozzleNumber}</option>)}
            </select>
          </label>
          <label>Shift #<input inputMode="numeric" value={filters.shiftNumber} placeholder="Any" onChange={change('shiftNumber')} /></label>
          {filtered && <button type="button" className="link-btn" onClick={() => { setFilters(emptyFilters); setPage(0); }}>Clear filters</button>}
        </div>

        {state.error && <Alert>{state.error} <button type="button" className="link-btn" onClick={load}>Retry</button></Alert>}

        <div className="table-wrap history-table">
          <table>
            <thead><tr>{['Date / time', 'Transaction', 'Nozzle', 'Quantity', 'Before stock', 'After stock', 'User', 'Reference'].map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {state.loading && Array.from({ length: 5 }, (_, i) => <tr key={i}>{Array.from({ length: 8 }, (_, j) => <td key={j}><div className="skeleton line" /></td>)}</tr>)}
              {!state.loading && state.rows.map(r => {
                const meta = TYPES[r.type] || { label: r.type, tone: '' };
                return (
                  <tr key={r.id}>
                    <td title={full(r.createdAt)}>{short(r.createdAt)}</td>
                    <td><span className={'status ' + meta.tone}>{meta.label}</span>{r.reason && <div className="cell-note" title={r.approvalNote || ''}>{r.reason}</div>}</td>
                    <td>{r.nozzleNumber ? `N${r.nozzleNumber}` : '-'}{r.shiftNumber ? <div className="cell-note">Shift #{r.shiftNumber}</div> : null}</td>
                    <td className={r.quantity < 0 ? 'qty neg' : 'qty pos'}>{formatSignedLiters(r.quantity)}{r.unitPrice != null && r.saleAmount != null && <div className="cell-note" title="Unit price in force when this sale was recorded">@ {formatPrice(r.unitPrice)} = {formatPKR(r.saleAmount)}</div>}</td>
                    <td>{formatLiters(r.stockBefore)}</td>
                    <td><strong className="row-title">{formatLiters(r.stockAfter)}</strong></td>
                    <td>{r.userName || '-'}</td>
                    <td title={r.remarks || ''}>{r.reference || '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!state.loading && !state.error && !state.rows.length && <p className="empty-state">{filtered ? 'No transactions match these filters.' : 'No transactions recorded for this tank yet.'}</p>}

        <div className="history-pager">
          <span>{state.total ? `Showing ${page * PAGE_SIZE + 1}-${Math.min(state.total, (page + 1) * PAGE_SIZE)} of ${state.total}` : ''}</span>
          <div>
            <button className="button secondary small" disabled={page === 0 || state.loading} onClick={() => setPage(p => p - 1)}>Previous</button>
            <button className="button secondary small" disabled={page + 1 >= pages || state.loading} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        </div>
      </>}

      {tab === 'dip' && <>
        {dips.error && <Alert>{dips.error}</Alert>}
        <div className="table-wrap history-table">
          <table>
            <thead><tr>{['Date / time', 'Dip reading', 'User', 'Remarks'].map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {dips.loading && Array.from({ length: 4 }, (_, i) => <tr key={i}>{Array.from({ length: 4 }, (_, j) => <td key={j}><div className="skeleton line" /></td>)}</tr>)}
              {!dips.loading && dips.rows.map(d => (
                <tr key={d.id}><td title={full(d.recordedAt)}>{short(d.recordedAt)}</td><td><strong className="row-title">{formatMm(d.dipMm)}</strong></td><td>{d.userName || '-'}</td><td>{d.remarks || '-'}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        {!dips.loading && !dips.error && !dips.rows.length && <p className="empty-state">No dip readings recorded yet.</p>}
      </>}

      <div className="modal-actions"><button className="button primary" onClick={onClose}>{t('done') || 'Done'}</button></div>
    </ModalShell>
  );
}
