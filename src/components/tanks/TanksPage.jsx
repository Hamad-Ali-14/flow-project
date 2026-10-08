import React, { useCallback, useEffect, useState } from 'react';
import { CircleAlert, Fuel, Plus, Ruler } from 'lucide-react';
import { useTanks } from '../../hooks/useTanks';
import { formatLiters, formatMm } from '../../utils/formatters';
import { formatKarachiDate, getKarachiShift } from '../../dateUtils';
import TankCard from './TankCard';
import ReceiveFuelModal from './ReceiveFuelModal';
import StockAdjustmentModal from './StockAdjustmentModal';
import TankHistoryModal from './TankHistoryModal';
import DipReadingModal from './DipReadingModal';
import FuelPricesCard from './FuelPricesCard';
import DispensingMachinesSection from './DispensingMachinesSection';
import { useLanguage } from '../../context/LanguageContext';

function TankSkeletons() {
  return (
    <div className="tank-grid">
      {[0, 1, 2].map(i => (
        <div className="tank-card" key={i} aria-hidden="true">
          <div className="skeleton line short" /><div className="skeleton line title" /><div className="skeleton line" />
          <div className="skeleton block" /><div className="skeleton line" /><div className="skeleton line" />
        </div>
      ))}
    </div>
  );
}

export default function TanksPage({ notify, setModal }) {
  const { t } = useLanguage();
  const { api, demo, session, overview, tanks, loading, error, reload, applyPersistedTank, prices, applyPrices, refreshAll } = useTanks();
  const [dialog, setDialog] = useState(null);
  const [openingShift, setOpeningShift] = useState(false);
  // The 12-hour shift running right now (Pakistan time); re-checked every 30 s so it flips at 7 AM / 7 PM.
  const [shift, setShift] = useState(() => getKarachiShift());
  const [today, setToday] = useState(() => formatKarachiDate());
  useEffect(() => {
    const timer = window.setInterval(() => {
      setShift(prev => { const next = getKarachiShift(); return next.id === prev.id ? prev : next; });
      setToday(formatKarachiDate());
    }, 30000);
    return () => window.clearInterval(timer);
  }, []);

  const perms = overview ? overview.permissions : {};
  const close = useCallback(() => setDialog(null), []);
  
  const finish = useCallback(async (message, persisted) => {
    if (persisted && persisted.tank) applyPersistedTank(persisted.tank);
    notify(message);
    await refreshAll(); // tanks + sales revenue (Overview) + prices, all re-read from the database
    setDialog(null);
  }, [notify, refreshAll, applyPersistedTank]);

  const selected = dialog && dialog.tankId ? tanks.find(tank => tank.id === dialog.tankId) : null;
  const open = (type, tank) => setDialog({ type, tankId: tank ? tank.id : null });

  const openShift = async () => {
    setOpeningShift(true);
    try { await api.openShift(); notify('A new shift is now open'); await reload({ silent: true }); }
    catch (e) { notify(e.message); }
    setOpeningShift(false);
  };

  const heading = (
    <div className="page-heading">
      <div>
        <div className="eyebrow"><Fuel size={15} /> {t('station_management', 'STATION MANAGEMENT')}</div>
        <h1>{t('tanks_title', 'Tanks & nozzles')}</h1>
        <p>{t('tanks_page_desc', 'Monitor calibrated tanks, dip readings and nozzle activity')}</p>
      </div>
      <button className="button primary" onClick={() => setModal('tank')}><Plus size={18} />{t('add_tank', 'Add tank')}</button>
    </div>
  );

  const checking = session === undefined || (loading && !overview);

  return (
    <>
      {heading}

      {overview && (
        <div className="inv-bar">
          <span className={'inv-pill ' + (demo ? 'demo' : 'live')}><i />{demo ? 'DEMO MODE - not saved to a database, resets on refresh' : <>{shift.name} <span className="inv-pill-hours">({shift.hours})</span></>}</span>
          <span className="inv-bar-item">{today}</span>
          {!overview.openShift && perms.close_shift && <button className="link-btn" onClick={openShift} disabled={openingShift}>{openingShift ? t('opening_shift', 'Opening...') : t('open_shift', 'Open shift')}</button>}
          <span className="inv-bar-spacer" />
        </div>
      )}

      {perms.manage_prices && prices && (
        <FuelPricesCard prices={prices} api={api} notify={notify}
          onChanged={next => { applyPrices(next); refreshAll(); }} />
      )}

      <div className="section-intro">
        <div><h2>{t('fuel_storage', 'Fuel storage')}</h2><p>{t('fuel_storage_desc', 'Stock is calculated from recorded deliveries, nozzle meter readings and authorised adjustments.')}</p></div>
        <span className="calibration-chip"><Ruler size={15} /> {t('dip_calibration_tracked', 'Dip and calibration tracked')}</span>
      </div>

      {error && !overview && (
        <div className="card inv-error">
          <CircleAlert size={20} />
          <div><strong>{error.code === 'NOT_CONFIGURED' ? 'Supabase is not connected' : 'Could not load tank data'}</strong><p>{error.message}</p></div>
          {error.code !== 'NOT_CONFIGURED' && <button className="button secondary" onClick={() => reload()}>{t('try_again', 'Try again')}</button>}
        </div>
      )}

      {checking && !error && <TankSkeletons />}

      {overview && !tanks.length && <div className="card empty-state-card"><h3>{t('no_tanks_configured', 'No tanks configured')}</h3><p>Run the seed script in database/inserts.sql or add tanks to see them here.</p></div>}

      {overview && tanks.length > 0 && (
        <div className="tank-grid">
          {tanks.map(tank => (
            <TankCard key={tank.id} tank={tank} perms={perms} demo={demo}
              onReceive={targetTank => open('receive', targetTank)} onHistory={targetTank => open('history', targetTank)}
              onDip={targetTank => open('dip', targetTank)} onAdjust={targetTank => open('adjust', targetTank)} />
          ))}
        </div>
      )}

      {overview && (
        <DispensingMachinesSection
          machines={overview.machines || []}
          tanks={tanks}
          api={api}
          notify={notify}
          refreshAll={refreshAll}
        />
      )}

      {overview && tanks.length > 0 && (
        <div className="card table-card">
          <div className="card-head"><div><h2>{t('tank_register', 'Tank register')}</h2><p>{tanks.length} {t('tanks_configured', 'tanks configured for this station')}</p></div></div>
          
          {/* Desktop Table View */}
          <div className="table-wrap desktop-table-only">
            <table>
              <thead><tr>{[t('col_tank', 'Tank'), t('col_product', 'Product'), t('capacity', 'Capacity'), t('current_stock', 'Current stock'), t('dip_calibration', 'Dip / calibration'), t('col_status', 'Status')].map(h => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {tanks.map(tank => {
                  return (
                    <tr key={tank.id}>
                      <td><strong className="row-title">{tank.name}</strong></td><td>{tank.fuelName}</td><td>{formatLiters(tank.capacity)}</td><td>{formatLiters(tank.currentStock)}</td>
                      <td>{tank.dip ? formatMm(tank.dip.mm) : '-'} - {tank.calibration ? `1 mm = ${tank.calibration} L` : '-'}</td>
                      <td><span className={'status ' + tank.statusTone}>{tank.statusLabel}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Responsive Cards */}
          <div className="mobile-cards-only">
            {tanks.map(tank => (
              <div key={tank.id} className="mobile-record-card">
                <div className="mobile-record-header">
                  <strong className="row-title">{tank.name}</strong>
                  <span className={'status ' + tank.statusTone}>{tank.statusLabel}</span>
                </div>
                <div className="mobile-record-body">
                  <div className="mobile-record-field">
                    <span>{t('col_product', 'Product')}</span>
                    <b>{tank.fuelName}</b>
                  </div>
                  <div className="mobile-record-field">
                    <span>{t('capacity', 'Capacity')}</span>
                    <b>{formatLiters(tank.capacity)}</b>
                  </div>
                  <div className="mobile-record-field">
                    <span>{t('current_stock', 'Current stock')}</span>
                    <b style={{ color: 'var(--amber, #0284c7)' }}>{formatLiters(tank.currentStock)}</b>
                  </div>
                  <div className="mobile-record-field">
                    <span>{t('dip_calibration', 'Dip / calibration')}</span>
                    <small>{tank.dip ? formatMm(tank.dip.mm) : '-'} ({tank.calibration ? `1mm=${tank.calibration}L` : '-'})</small>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {dialog && dialog.type === 'receive' && selected && <ReceiveFuelModal tank={selected} api={api} onClose={close} onDone={finish} />}
      {dialog && dialog.type === 'dip' && selected && <DipReadingModal tank={selected} api={api} onClose={close} onDone={finish} />}
      {dialog && dialog.type === 'adjust' && selected && <StockAdjustmentModal tank={selected} api={api} onClose={close} onDone={finish} />}
      {dialog && dialog.type === 'history' && selected && <TankHistoryModal tank={selected} api={api} onClose={close} />}
    </>
  );
}