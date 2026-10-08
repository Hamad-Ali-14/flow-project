import React from "react";
import { Fuel, History, Plus, Ruler, Scale } from "lucide-react";
import {
  formatLiters,
  formatMm,
  formatNozzleRange,
  formatPKR,
  formatPrice,
} from "../../utils/formatters";
import { useLanguage } from "../../context/LanguageContext";

// Same structure and classes as the original tank card; the "today" block and the
// action rows are additions. Percentage and status are derived (never stored) and arrive
// pre-computed on the tank record.
export default function TankCard({
  tank = {},
  perms = {},
  demo,
  onReceive,
  onHistory,
  onDip,
  onAdjust,
}) {
  const { t } = useLanguage();
  // percentage / status come from withStockMetrics() in the shared tank dataset (useTanks).
  const pct = Number(tank?.percentage || 0);
  const activeNozzles = (tank?.nozzles || []).filter((n) => n && n.active);
  const canAct = Boolean(tank?.active);
  const hasLinks = canAct && Boolean(perms?.update_dip || perms?.stock_adjustment);

  const statusLabelMap = {
    'Active': t('status_active', 'Active'),
    'Good': t('status_good', 'Good'),
    'Low': t('status_low', 'Low'),
    'Critical': t('status_critical', 'Critical'),
    'Inactive': t('inactive', 'Inactive'),
  };

  return (
    <div className="tank-card" data-status={tank.status}>
      <div className="tank-card-top">
        <div className="tank-badge">
          <Fuel size={18} />
        </div>
        <span className={"status " + tank.statusTone}>{statusLabelMap[tank.statusLabel] || tank.statusLabel}</span>
      </div>
      <h3>{tank.name}</h3>
      <p className="product-name">{tank.fuelName}</p>
      <div className="tank-level">
        <div>
          <strong>{formatLiters(tank.currentStock)}</strong>
          <span>{demo ? "current sample stock" : t('current_stock', 'Current stock')}</span>
        </div>
        <b>{Math.round(pct)}%</b>
      </div>
      <div
        className="level-track"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${tank.name} stock level`}
      >
        <i
          className={
            tank.status === "INACTIVE" ? "" : tank.status.toLowerCase()
          }
          style={{ width: pct + "%" }}
        />
      </div>
      <div className="tank-details">
        <span>
          {t('capacity', 'Capacity')}<strong>{formatLiters(tank.capacity)}</strong>
        </span>
        <span>
          {t('dip_reading', 'Dip reading')}<strong>{tank.dip ? formatMm(tank.dip.mm) : "-"}</strong>
        </span>
        <span>
          {t('dip_calibration', 'Calibration')}
          <strong>
            {tank.calibration ? `1 mm = ${tank.calibration} L` : "-"}
          </strong>
        </span>
        <span>
          {t('connected_nozzles', 'Nozzles')}
          <strong>
            {formatNozzleRange(activeNozzles.map((n) => n.nozzleNumber))}
          </strong>
        </span>
      </div>

      <div className="tank-today">
        <div className="tank-today-head">
          <span>{t('todays_dispensed', "Today's dispensed")}</span>
          <strong>{formatLiters(tank.todayDispensed)}</strong>
        </div>
        {tank.unitPrice != null && (
          <div className="tank-today-row revenue">
            <span>
              {t('todays_revenue', "Today's revenue @")}{" "}
              {tank.unitPrice > 0
                ? `${formatPrice(tank.unitPrice)}/L`
                : t('no_price_set', "no price set")}
            </span>
            <b>{formatPKR(tank.todayRevenue || 0)}</b>
          </div>
        )}
        {activeNozzles.map((n) => (
          <div className="tank-today-row" key={n.id}>
            <span>{t('nozzle_label', 'Nozzle')} {n.nozzleNumber}</span>
            <b>
              {formatLiters(n.todayDispensed)}
              {n.todayRevenue != null && (
                <i className="nozzle-rev"> / {formatPKR(n.todayRevenue)}</i>
              )}
            </b>
          </div>
        ))}
        {!activeNozzles.length && (
          <div className="tank-today-row">
            <span>{t('no_active_nozzles', 'No active nozzles assigned')}</span>
          </div>
        )}
      </div>

      {canAct && (perms.receive_fuel || perms.view_history) && (
        <div className="tank-actions">
          {perms.receive_fuel && (
            <button
              className="button primary small"
              onClick={() => onReceive(tank)}
            >
              <Plus size={15} /> {t('receive_fuel', 'Receive Fuel')}
            </button>
          )}
          {perms.view_history && (
            <button
              className="button secondary small"
              onClick={() => onHistory(tank)}
            >
              <History size={15} /> {t('view_history', 'View History')}
            </button>
          )}
        </div>
      )}
      {hasLinks && (
        <div className="tank-links">
          {perms.update_dip && (
            <button type="button" onClick={() => onDip(tank)}>
              <Ruler size={13} /> {t('update_dip', 'Update dip')}
            </button>
          )}
          {perms.stock_adjustment && (
            <button type="button" onClick={() => onAdjust(tank)}>
              <Scale size={13} /> {t('adjust_stock', 'Adjust stock')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
