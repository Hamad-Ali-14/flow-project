// Pure helpers for the Overview sales metrics and chart. No React, no Supabase.

// % change of `current` vs `previous`; null when there is nothing to compare against.
export function pctChange(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export function formatPct(value) {
  if (value === null || value === undefined) return 'no previous data';
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
}

// 1 / 2 / 5 x 10^n ceiling, so axis labels are round numbers.
export function niceCeil(value) {
  if (!(value > 0)) return 0;
  const exp = 10 ** Math.floor(Math.log10(value));
  const f = value / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp;
}

export function formatCompact(value) {
  if (value >= 1e6) return `${+(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${+(value / 1e3).toFixed(1)}k`;
  return String(Math.round(value));
}

export function getChartSubtitle(period = 'daily', days = 7) {
  if (period === 'daily' || days === 1) {
    return 'Revenue performance across the station - Today';
  }
  if (period === 'weekly' || days <= 7) {
    return 'Fuel sales revenue (PKR) across the station - Last 7 days';
  }
  return 'Fuel sales revenue (PKR) across the station - Last 30 days';
}

/**
 * Generate smooth spline path using Cubic Bezier with tension factor (default tension 0.4)
 */
export function buildSpline(points, tension = 0.4) {
  if (!points || !points.length) return '';
  if (points.length === 1) return `M${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  if (points.length === 2) {
    return `M${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)} L${points[1].x.toFixed(1)} ${points[1].y.toFixed(1)}`;
  }

  let d = `M${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  const k = (1 - tension) * 0.5;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = i > 0 ? points[i - 1] : points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = i + 2 < points.length ? points[i + 2] : p2;

    const cp1x = p1.x + (p2.x - p0.x) * k;
    const cp1y = p1.y + (p2.y - p0.y) * k;
    const cp2x = p2.x - (p3.x - p1.x) * k;
    const cp2y = p2.y - (p3.y - p1.y) * k;

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

/**
 * Build closed polygon area under spline curve down to the baseline
 */
export function buildSplineArea(points, bottom, tension = 0.4) {
  if (!points || !points.length) return '';
  const line = buildSpline(points, tension);
  const first = points[0];
  const last = points[points.length - 1];
  return `${line} L${last.x.toFixed(1)} ${bottom.toFixed(1)} L${first.x.toFixed(1)} ${bottom.toFixed(1)} Z`;
}

// Last `days` entries of the daily series -> SVG paths (viewBox 0 0 700 230)
// Dynamic Y-axis calculation with 15% top padding buffer so curves never touch the top border.
// Stacked dual-color area: Fuel volume layer in Amber/Yellow (#EAB308), top layer completing Total Revenue in Blue (#3B82F6).
const LIT_MAX_FRAC = 0.65; // litres curve tops out at 65% of chart height

export function buildChart(series, days = 7, options = {}) {
  const period = options.period || (days === 1 ? 'daily' : days <= 7 ? 'weekly' : 'monthly');
  // Handle strictly 7 days for weekly and strictly 30 days for monthly
  const sliceCount = period === 'weekly' ? 7 : period === 'monthly' ? 30 : days;
  const rows = (series || []).slice(-sliceCount);

  const W = 700;
  const TOP = 16;
  const BOTTOM = 224;
  const H = BOTTOM - TOP;

  const rawMaxRev = Math.max(0, ...rows.map(r => (Number(r.revenue) || 0) + (Number(r.otherIncome) || 0)));
  const maxLit = Math.max(0, ...rows.map(r => Number(r.litres) || 0));

  // Dynamic Y-Axis with 15% top padding buffer
  const bufferedMax = rawMaxRev > 0 ? rawMaxRev * 1.15 : 0;
  const maxRev = niceCeil(bufferedMax);

  const x = i => (rows.length <= 1 ? W / 2 : (i / (rows.length - 1)) * W);
  const yRev = v => (maxRev > 0 ? BOTTOM - (v / maxRev) * H : BOTTOM);
  const yLit = v => (maxLit > 0 ? BOTTOM - (v / maxLit) * H * LIT_MAX_FRAC : BOTTOM);

  const pointsRev = rows.map((r, i) => {
    const total = (Number(r.revenue) || 0) + (Number(r.otherIncome) || 0);
    return { x: x(i), y: yRev(total), raw: total };
  });

  const pointsLit = rows.map((r, i) => ({
    x: x(i),
    y: yLit(Number(r.litres) || 0),
    raw: Number(r.litres) || 0,
  }));

  // Smooth Spline curves (tension: 0.4)
  const lineRev = buildSpline(pointsRev, 0.4);
  const lineLit = buildSpline(pointsLit, 0.4);

  // Stacked areas
  const areaRev = buildSplineArea(pointsRev, BOTTOM, 0.4);
  const areaFuel = buildSplineArea(pointsLit, BOTTOM, 0.4);

  const empty = rows.length === 0 || rows.every(r => (Number(r.revenue) || 0) === 0 && (Number(r.litres) || 0) === 0);

  const pick = rows.length <= 3
    ? rows.map((_, i) => i)
    : [0, Math.floor((rows.length - 1) / 3), Math.floor(((rows.length - 1) * 2) / 3), rows.length - 1];

  const subtitle = getChartSubtitle(period, sliceCount);

  return {
    empty,
    revenuePath: rows.length ? lineRev : '',
    revenueArea: areaRev,
    litresPath: rows.length ? lineLit : '',
    fuelArea: areaFuel,
    ticks: [1, 0.75, 0.5, 0.25, 0].map(f => formatCompact(maxRev * f)),
    xLabels: pick.map(i => rows[i]?.date || rows[i]?.time || ''),
    maxLitLabel: maxLit > 0 ? `${formatCompact(maxLit)} L` : null,
    maxRev,
    subtitle,
    pointsRev,
    pointsLit,
    rows,
  };
}
