import React, { useState, useMemo } from 'react';
import { TrendingUp, Calendar, ChevronDown, Sparkles } from 'lucide-react';
import { buildChart, getChartSubtitle, formatCompact } from '../../utils/salesMetrics';
import { formatPKR, formatLiters } from '../../utils/formatters';
import { formatKarachiDate } from '../../dateUtils';

/**
 * SalesOverviewGraph
 * High-fidelity Sales & Volume Trend Graph strictly enforcing:
 * - Daily: 24h interval (12:00 AM to 11:59 PM) - Subtitle: "Revenue performance across the station - Today"
 * - Weekly: Strictly last 7 days - Subtitle: "Fuel sales revenue (PKR) across the station - Last 7 days"
 * - Monthly: Strictly last 30 days - Subtitle: "Fuel sales revenue (PKR) across the station - Last 30 days"
 * - Smooth Spline curve (tension 0.4)
 * - Dynamic Dual-Color Area: Amber/Yellow (#EAB308) up to fuel volume, Blue (#3B82F6) completing Total Revenue
 * - Dynamic Y-Axis auto-scaled in k or M with 15% top padding buffer
 */
export default function SalesOverviewGraph({
  sales,
  income = [],
  initialPeriod = 'daily',
  canSeeSales = true,
  className = '',
}) {
  const [selectedPeriod, setSelectedPeriod] = useState(initialPeriod);
  const [hoveredIndex, setHoveredIndex] = useState(null);

  // Compute dataset for selected period
  const chartData = useMemo(() => {
    if (!sales) return { series: [], subtitle: '', period: selectedPeriod };

    if (selectedPeriod === 'daily') {
      // 24-hour interval (12:00 AM to 11:59 PM)
      const hourly = sales?.daily?.hourly || Array.from({ length: 24 }, (_, h) => {
        const hour12 = `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? 'AM' : 'PM'}`;
        return {
          time: hour12,
          date: hour12,
          revenue: 0,
          litres: 0,
          otherIncome: 0,
        };
      });

      // Distribute other income into today's timeline if present
      const todayIncomeTotal = (income || []).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
      const incomePerHour = hourly.length > 0 ? todayIncomeTotal / hourly.length : 0;

      const dailySeries = hourly.map((item) => ({
        ...item,
        otherIncome: Math.round(incomePerHour),
      }));

      return {
        series: dailySeries,
        days: 1,
        subtitle: 'Revenue performance across the station - Today',
      };
    }

    if (selectedPeriod === 'weekly') {
      // Strictly last 7 days
      const rawSeries = sales.series || [];
      const slice7 = rawSeries.slice(-7);
      return {
        series: slice7,
        days: 7,
        subtitle: 'Fuel sales revenue (PKR) across the station - Last 7 days',
      };
    }

    // Monthly: Strictly last 30 days
    const rawSeries = sales.series || [];
    const slice30 = rawSeries.slice(-30);
    return {
      series: slice30,
      days: 30,
      subtitle: 'Fuel sales revenue (PKR) across the station - Last 30 days',
    };
  }, [sales, income, selectedPeriod]);

  const chart = useMemo(() => {
    return buildChart(chartData.series, chartData.days, { period: selectedPeriod });
  }, [chartData, selectedPeriod]);

  if (!canSeeSales) {
    return (
      <section className={`card chart-card ${className}`}>
        <div className="card-head">
          <div>
            <h2>Sales Overview</h2>
            <p>Sales revenue and volumetric trends are visible to owner / admin only</p>
          </div>
        </div>
      </section>
    );
  }

  const activeHover = hoveredIndex !== null && chart.rows && chart.rows[hoveredIndex]
    ? chart.rows[hoveredIndex]
    : null;

  return (
    <section className={`card chart-card sales-overview-graph-card ${className}`}>
      <div className="card-head sales-graph-head">
        <div>
          <div className="sales-graph-title-row">
            <TrendingUp size={18} className="text-blue" />
            <h2>Sales Overview</h2>
            <span className="live-pill-tag">
              <span className="dot-pulse blue" /> Spline Interpolated
            </span>
          </div>
          <p className="sales-graph-subtitle">{chartData.subtitle}</p>
        </div>

        <div className="sales-graph-controls">
          <div className="chart-period-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={selectedPeriod === 'daily'}
              className={`period-tab-btn ${selectedPeriod === 'daily' ? 'active' : ''}`}
              onClick={() => setSelectedPeriod('daily')}
            >
              Daily
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={selectedPeriod === 'weekly'}
              className={`period-tab-btn ${selectedPeriod === 'weekly' ? 'active' : ''}`}
              onClick={() => setSelectedPeriod('weekly')}
            >
              Weekly
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={selectedPeriod === 'monthly'}
              className={`period-tab-btn ${selectedPeriod === 'monthly' ? 'active' : ''}`}
              onClick={() => setSelectedPeriod('monthly')}
            >
              Monthly
            </button>
          </div>

          <div className="chart-legend">
            <span>
              <i className="dot blue" /> Total Revenue
            </span>
            <span>
              <i className="dot amber" /> Fuel Volume
            </span>
          </div>
        </div>
      </div>

      <div className="chart-body-wrapper">
        <div className="chart">
          {/* Dynamic Y-Axis Labels with 15% top buffer */}
          <div className="y-labels" aria-hidden="true">
            {chart.ticks.map((tick, i) => (
              <span key={i} className="y-tick-label">
                {tick}
              </span>
            ))}
          </div>

          <div className="chart-area">
            <div className="gridlines" aria-hidden="true" />

            <svg
              viewBox="0 0 700 230"
              preserveAspectRatio="none"
              className="sales-spline-svg"
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <defs>
                {/* Blue gradient for Total Revenue layer */}
                <linearGradient id="blueRevenueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.45" />
                  <stop offset="60%" stopColor="#3B82F6" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.04" />
                </linearGradient>

                {/* Amber/Yellow gradient for Fuel Volume contribution layer */}
                <linearGradient id="amberFuelGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#EAB308" stopOpacity="0.55" />
                  <stop offset="70%" stopColor="#EAB308" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#EAB308" stopOpacity="0.06" />
                </linearGradient>
              </defs>

              {/* 1. Base Layer: Blue Total Revenue area */}
              {chart.revenueArea && (
                <path
                  d={chart.revenueArea}
                  fill="url(#blueRevenueGradient)"
                  className="chart-fill-revenue"
                />
              )}

              {/* 2. Stacked Fuel Layer: Amber/Yellow area up to fuel contribution */}
              {chart.fuelArea && (
                <path
                  d={chart.fuelArea}
                  fill="url(#amberFuelGradient)"
                  className="chart-fill-fuel"
                />
              )}

              {/* 3. Blue Spline Stroke (Total Revenue) */}
              {chart.revenuePath && (
                <path
                  d={chart.revenuePath}
                  fill="none"
                  stroke="#3B82F6"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="chart-stroke-revenue"
                />
              )}

              {/* 4. Amber Spline Stroke (Fuel Volume / Contribution) */}
              {chart.litresPath && (
                <path
                  d={chart.litresPath}
                  fill="none"
                  stroke="#EAB308"
                  strokeWidth="2.2"
                  strokeDasharray="4 2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="chart-stroke-fuel"
                />
              )}

              {/* 5. Interactive Hover Nodes */}
              {chart.pointsRev && chart.pointsRev.map((pt, i) => (
                <g key={i} className="hover-hitbox-group">
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={hoveredIndex === i ? 6 : 3.5}
                    fill={hoveredIndex === i ? '#ffffff' : '#3B82F6'}
                    stroke="#3B82F6"
                    strokeWidth={hoveredIndex === i ? 2.5 : 1.5}
                    style={{ transition: 'all 0.15s ease' }}
                  />
                  <rect
                    x={pt.x - 12}
                    y={0}
                    width={24}
                    height={230}
                    fill="transparent"
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={() => setHoveredIndex(i)}
                  />
                </g>
              ))}
            </svg>

            {/* X-Axis Labels */}
            <div className="x-labels" aria-hidden="true">
              {chart.xLabels.map((lbl, idx) => (
                <span key={idx} className="x-tick-label">
                  {lbl.includes(':')
                    ? lbl
                    : formatKarachiDate(new Date(`${lbl}T12:00:00+05:00`), { year: undefined })}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Hover Tooltip Overlay */}
        {activeHover && (
          <div className="chart-tooltip-floating">
            <div className="tooltip-head">
              <strong>{activeHover.time || activeHover.date}</strong>
            </div>
            <div className="tooltip-row">
              <span className="dot blue" />
              <span>Total Revenue:</span>
              <b>{formatPKR((Number(activeHover.revenue) || 0) + (Number(activeHover.otherIncome) || 0))}</b>
            </div>
            <div className="tooltip-row">
              <span className="dot amber" />
              <span>Fuel Volume:</span>
              <b>{formatLiters(Number(activeHover.litres) || 0)}</b>
            </div>
            {Number(activeHover.otherIncome) > 0 && (
              <div className="tooltip-row sub">
                <span>Other Income:</span>
                <span>{formatPKR(activeHover.otherIncome)}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
