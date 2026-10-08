import React from 'react';
import {
  Droplets,
  Clock,
  Truck,
  ArrowRight,
} from 'lucide-react';
import { predict_stock_runout } from '../../utils/flowAiTools';
import { formatLiters } from '../../utils/formatters';

export default function FuelForecast({
  tanks = [],
  sales,
  onPrepareOrder,
}) {
  const activeTanks = (tanks || []).filter(
    (t) => t.active !== false && t.is_active !== false && !t.is_disabled
  );
  const predictions = predict_stock_runout({ tanks: activeTanks, sales });

  return (
    <section className="card fuel-forecast-card">
      <div className="card-head">
        <div>
          <div className="card-title-row">
            <Droplets size={17} className="text-amber" />
            <h2>Fuel Forecast</h2>
          </div>
          <p>Estimated stock runout & replenishment alerts</p>
        </div>
      </div>

      <div className="forecast-tank-list">
        {predictions.length === 0 ? (
          <div className="forecast-empty">No active fuel tanks found</div>
        ) : (
          predictions.map((tank) => {
            const isCritical = tank.percentage < 15;
            const isWarning = tank.percentage < 32;
            const barColorClass = isCritical
              ? 'bar-critical'
              : isWarning
              ? 'bar-warning'
              : 'bar-healthy';
            const badgeClass = isCritical
              ? 'badge-critical'
              : isWarning
              ? 'badge-warning'
              : 'badge-healthy';
            const statusLabel = isCritical
              ? 'Critical'
              : isWarning
              ? 'Low Stock'
              : 'Healthy';

            return (
              <div key={tank.tankId} className="forecast-item">
                <div className="forecast-item-header">
                  <div className="forecast-title-group">
                    <span className="tank-title">
                      {tank.tankName}
                      <span className="fuel-pill">{tank.fuelCode || tank.fuelName}</span>
                    </span>
                    <span className="tank-volume-meta">
                      {formatLiters(tank.currentStock)} / {formatLiters(tank.capacity)}
                    </span>
                  </div>
                  <div className="forecast-header-right">
                    <span className={`forecast-status-badge ${badgeClass}`}>
                      {statusLabel}
                    </span>
                    <span className="percentage-bold">{tank.percentage}%</span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="forecast-track">
                  <div
                    className={`forecast-fill ${barColorClass}`}
                    style={{ width: `${Math.min(100, Math.max(0, tank.percentage))}%` }}
                  />
                </div>

                {/* Details / action row */}
                <div className="forecast-details-row">
                  <div className="burn-time">
                    <Clock size={12} />
                    <span>{tank.estimatedTimeText.replace(/Approximately /i, '~')}</span>
                  </div>
                  {tank.isReorderNeeded && onPrepareOrder ? (
                    <button
                      type="button"
                      className="forecast-reorder-chip"
                      onClick={() => onPrepareOrder(tank)}
                      title={`Supplier: ${tank.supplier}`}
                    >
                      <Truck size={12} />
                      <span>Order {formatLiters(tank.recommendedQty)}</span>
                      <ArrowRight size={11} />
                    </button>
                  ) : (
                    <div className="burn-rate">
                      <span className="forecast-safe-tag">
                        Reserve: {formatLiters(Math.round(tank.capacity * 0.2))}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
