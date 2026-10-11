import React, { useEffect, useMemo, useRef, useState } from 'react';
import Dropdown from '../common/Dropdown';
import { buildChart, buildPeriodSeries, buildCustomSeries, buildPointDetails } from '../../utils/salesMetrics';
import { formatPKR } from '../../utils/formatters';
import { formatKarachiDate } from '../../dateUtils';

// Overview "Sales overview" graph: one smooth line with a dot on every data point.
// Click (or press Enter on) a dot and a card opens with that point's Fuel sale and Net profit.
// Colours are the Flow logo's: blue line + yellow highlight (theme tokens --blue / --amber).
const PERIOD_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'custom', label: 'Custom' },
];

const VB_W = 700;
const VB_H = 230;
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d);
const day = (iso) => (isDate(iso) ? formatKarachiDate(new Date(`${iso}T12:00:00+05:00`), { year: undefined }) : iso);

// "11 Oct"  |  "5 Oct - 11 Oct"
const spanLabel = (d, period) => {
  const range = d.from === d.to ? day(d.from) : `${day(d.from)} - ${day(d.to)}`;
  return period === 'monthly' ? `${range} (running total)` : range;
};

export default function SalesOverviewChart({
  sales,
  income = [],
  expenses = [],
  canSeeSales = true,
  period,
  setPeriod,
  onCustomRangeChange,
}) {
  // "Custom" is chosen here, but the picked dates are reported up through onCustomRangeChange so the KPI cards
  // above show the same date range (it reports null again as soon as another period is chosen).
  const [custom, setCustom] = useState(false);
  const [range, setRange] = useState({ start: '', end: '' });
  const mode = custom ? 'custom' : period;

  // The per-day series the database sends (last 31 days) limits what a custom range can cover.
  const series = (sales && sales.series) || [];
  const minDate = series.length ? series[0].date : '';
  const maxDate = (sales && sales.businessDate) || (series.length ? series[series.length - 1].date : '');

  const chooseMode = (value) => {
    if (value === 'custom') {
      if (!range.start || !range.end) {
        // Start from the last 7 days that exist.
        const last = new Date(`${maxDate}T00:00:00Z`);
        last.setUTCDate(last.getUTCDate() - 6);
        const wanted = last.toISOString().slice(0, 10);
        setRange({ start: wanted < minDate ? minDate : wanted, end: maxDate });
      }
      setCustom(true);
    } else {
      setCustom(false);
      setPeriod(value);
    }
  };
  const changeStart = (v) => setRange((r) => ({ start: v, end: r.end && v > r.end ? v : r.end }));
  const changeEnd = (v) => setRange((r) => ({ start: r.start && v < r.start ? v : r.start, end: v }));

  useEffect(() => {
    if (!onCustomRangeChange) return;
    onCustomRangeChange(custom && range.start && range.end ? { start: range.start, end: range.end } : null);
  }, [custom, range.start, range.end]); // eslint-disable-line react-hooks/exhaustive-deps

  // The picked dot is remembered together with the view it belongs to (period / date range / number of dots),
  // so changing any of them closes the card by itself, while a silent data refresh of the same dots keeps it.
  const [selection, setSelection] = useState(null); // { key, index } | null
  const rootRef = useRef(null);

  const win = useMemo(() => {
    if (!canSeeSales || !sales) return { rows: [], label: '' };
    return custom ? buildCustomSeries(sales, range) : buildPeriodSeries(sales, period);
  }, [canSeeSales, sales, period, custom, range]);
  const chart = useMemo(
    () => buildChart(win.rows, Math.max(win.rows.length, 1), { period: 'custom' }),
    [win],
  );
  const details = useMemo(
    () => buildPointDetails(win.rows, income, expenses),
    [win, income, expenses],
  );

  const selectionKey = `${mode}:${range.start}:${range.end}:${win.rows.length}`;
  const selected = selection && selection.key === selectionKey ? selection.index : null;
  const setSelected = (index) => setSelection(index === null ? null : { key: selectionKey, index });

  // Click outside the plot or press Escape: close the card.
  useEffect(() => {
    if (selected === null) return undefined;
    const onDown = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setSelected(null); };
    const onKey = (e) => { if (e.key === 'Escape') setSelected(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [selected]);

  if (!canSeeSales) {
    return (
      <section className="card chart-card so-card">
        <div className="card-head">
          <div>
            <h2>Sales overview</h2>
            <p>Sales revenue is visible to owner / admin only</p>
          </div>
        </div>
      </section>
    );
  }

  // Custom range: show the dates the way the axis does ("5 Oct to 11 Oct"), not as raw ISO dates.
  const firstRow = win.rows[0];
  const lastRow = win.rows[win.rows.length - 1];
  const winLabel = custom && firstRow
    ? (firstRow.date === lastRow.date ? `${day(firstRow.date)}, single day` : `${day(firstRow.date)} to ${day(lastRow.date)}, per day`)
    : win.label;
  const points = chart.pointsRev || [];
  const dense = points.length > 14;
  const pick = selected !== null && !chart.empty ? details[selected] : null;
  const pt = pick ? points[selected] : null;
  const leftPct = pt ? (pt.x / VB_W) * 100 : 0;
  const topPct = pt ? (pt.y / VB_H) * 100 : 0;
  // Keep the card inside the plot: flip to the side near the edges, below the dot near the top.
  const alignClass = leftPct < 22 ? 'is-left' : leftPct > 78 ? 'is-right' : 'is-center';
  const belowClass = topPct < 42 ? 'is-below' : 'is-above';

  return (
    <section className="card chart-card so-card" ref={rootRef}>
      <div className="card-head">
        <div>
          <h2>Sales overview</h2>
          <p>
            {chart.empty
              ? (custom ? 'No fuel sales in the selected dates' : 'No fuel sales recorded yet — revenue appears after the first shift closing')
              : `Fuel sales revenue (PKR) across the station — ${winLabel}`}
          </p>
        </div>
        <Dropdown value={mode} onChange={chooseMode} options={PERIOD_OPTIONS} ariaLabel="Sales overview period" />
      </div>

      {custom && (
        <div className="so-range">
          <label>
            <span>Start date</span>
            <input type="date" value={range.start} min={minDate} max={range.end || maxDate} onChange={(e) => e.target.value && changeStart(e.target.value)} aria-label="Start date" />
          </label>
          <label>
            <span>End date</span>
            <input type="date" value={range.end} min={range.start || minDate} max={maxDate} onChange={(e) => e.target.value && changeEnd(e.target.value)} aria-label="End date" />
          </label>
          <small>Sales data is available for the last {series.length || 31} days</small>
        </div>
      )}

      <div className="so-legend">
        <span><i className="so-key so-key-blue" />Fuel sale</span>
        {!chart.empty && <span className="so-hint">Click a dot to see fuel sale and net profit</span>}
      </div>

      <div className="so-body">
        <div className="so-yaxis" aria-hidden="true">
          {chart.ticks.map((tick, i) => <span key={i} style={{ top: `${i * 25}%` }}>{tick}</span>)}
        </div>

        <div className="so-main">
          <div className="so-plot">
            <div className="so-grid" aria-hidden="true" />
            <svg viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id="so-area-gradient" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="var(--blue)" stopOpacity=".34" />
                  <stop offset=".7" stopColor="var(--amber)" stopOpacity=".16" />
                  <stop offset="1" stopColor="var(--amber)" stopOpacity=".02" />
                </linearGradient>
              </defs>
              {chart.revenueArea && <path className="so-area" d={chart.revenueArea} />}
              {chart.revenuePath && <path className="so-line" d={chart.revenuePath} />}
            </svg>

            {!chart.empty && pt && (
              <span className="so-guide" style={{ left: `${leftPct}%` }} aria-hidden="true" />
            )}

            {!chart.empty && points.map((p, i) => (
              <button
                key={`${details[i]?.date}-${i}`}
                type="button"
                className={`so-dot${dense ? ' is-dense' : ''}${selected === i ? ' is-active' : ''}`}
                style={{ left: `${(p.x / VB_W) * 100}%`, top: `${(p.y / VB_H) * 100}%` }}
                aria-label={`${spanLabel(details[i], mode)}: fuel sale ${formatPKR(details[i].fuelSale)}, net profit ${formatPKR(details[i].netProfit)}`}
                aria-pressed={selected === i}
                onClick={() => setSelected(selected === i ? null : i)}
              >
                <span />
              </button>
            ))}

            {pick && (
              <div
                className={`so-card-pop ${alignClass} ${belowClass}`}
                style={{ left: `${leftPct}%`, top: `${topPct}%` }}
                role="status"
              >
                <strong className="so-pop-title">{spanLabel(pick, mode)}</strong>
                <div className="so-pop-row">
                  <span><i className="so-key so-key-blue" />Fuel sale</span>
                  <b>{formatPKR(pick.fuelSale)}</b>
                </div>
                <div className="so-pop-row">
                  <span><i className="so-key so-key-amber" />Net profit</span>
                  <b className={pick.netProfit < 0 ? 'is-neg' : 'is-pos'}>{formatPKR(pick.netProfit)}</b>
                </div>
                <small>Fuel sale + other income − expenses</small>
              </div>
            )}
          </div>

          <div className="so-xaxis" aria-hidden="true">
            {chart.xLabels.map((d, i) => {
              const pos = chart.xLabelPos[i];
              return (
                <span
                  key={`${d}-${i}`}
                  style={{
                    left: `${pos * 100}%`,
                    transform: `translateX(${pos <= 0 ? '0' : pos >= 1 ? '-100%' : '-50%'})`,
                  }}
                >
                  {day(d)}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
