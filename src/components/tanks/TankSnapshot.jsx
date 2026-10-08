import React, { useEffect } from 'react';
import { useTanks } from '../../hooks/useTanks';
import { formatLiters } from '../../utils/formatters';
import { useLanguage } from '../../context/LanguageContext';

// Overview "Current tank snapshot". It owns NO tank data: it renders the same shared records
// (and the same percentage/status calculation) as the Tanks & nozzles page.
export default function TankSnapshot() {
  const { tanks, overview, session, loading, error, reload, refreshIfStale, demo } = useTanks();
  const { t } = useLanguage();

  // Revalidate when the Overview opens (skipped if the data was just loaded).
  useEffect(() => { refreshIfStale(); }, [refreshIfStale]);

  let body;
  if (session === null && !demo) {
    body = <p className="snapshot-note">Sign in on the Tanks &amp; nozzles page to see current stock.</p>;
  } else if (error && !overview) {
    body = <p className="snapshot-note">{error.message} {error.code !== 'NOT_CONFIGURED' && <button type="button" className="link-btn" onClick={() => reload()}>Try again</button>}</p>;
  } else if (!overview || (loading && !tanks.length)) {
    body = [0, 1, 2].map(i => <div className="tank-mini" key={i} aria-hidden="true"><div><div className="skeleton line short" /><div className="skeleton line" /></div></div>);
  } else if (!tanks.length) {
    body = <p className="snapshot-note">No tanks have been configured yet.</p>;
  } else {
    const activeTanks = (tanks || []).filter(item => item.active !== false && item.is_active !== false && !item.is_disabled);
    if (!activeTanks.length) {
      body = <p className="snapshot-note">No active tanks configured.</p>;
    } else {
      body = activeTanks.map(item => (
        <div className="tank-mini" key={item.id}>
          <div>
            <strong>{item.name} - {item.fuelName}</strong>
            <small>{formatLiters(item.currentStock)} of {formatLiters(item.capacity)}</small>
          </div>
          <span className={'status ' + item.statusTone}>{item.statusLabel}</span>
          <b>{Math.round(item.percentage)}%</b>
        </div>
      ));
    }
  }

  return (
    <section className="card snapshot-card">
      <div className="card-head">
        <div>
          <h2>{t("tanks_snapshot", "Current tank snapshot")}</h2>
          <p>{demo ? 'Demo data - not saved to a database' : t("tanks_snapshot_desc", "Current stock across all tanks")}</p>
        </div>
      </div>
      {body}
    </section>
  );
}
