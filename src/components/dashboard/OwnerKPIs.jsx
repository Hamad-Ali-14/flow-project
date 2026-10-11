import React from 'react';
import {
  TrendingUp,
  Droplets,
  Banknote,
  WalletCards,
  CircleDollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Gauge,
  Fuel,
  ReceiptText,
} from 'lucide-react';
import {
  get_today_sales,
  get_sales_by_period,
  get_fuel_volume,
  get_other_income,
  get_expenses,
  get_net_profit,
} from '../../utils/flowAiTools';
import { formatPKR, formatLiters } from '../../utils/formatters';
import { formatPct } from '../../utils/salesMetrics';

export default function OwnerKPIs({
  sales,
  tanks = [],
  income = [],
  expenses = [],
  period = 'daily',
  // Values for the Sales overview "Custom" date range (from buildCustomKpis); null for daily / weekly / monthly.
  customKpis = null,
  canSeeSales = true,
  t = (k, f) => f,
}) {
  // If not authorized to view station-wide owner financials (Manager role)
  // Display dedicated Shift Operational KPIs instead of masked financial metrics
  if (!canSeeSales) {
    const activeTanks = (tanks || []).filter(t => t.active !== false && t.is_active !== false && !t.is_disabled);
    const totalStock = activeTanks.reduce((sum, t) => sum + (Number(t.currentStock) || 0), 0);
    const shiftDispensed = activeTanks.reduce((sum, t) => sum + (Number(t.todayDispensed) || 0), 0);
    let activeNozCount = 0;
    let totalNozCount = 0;
    activeTanks.forEach(t => {
      (t.nozzles || []).forEach(n => {
        totalNozCount++;
        if (n.active !== false) activeNozCount++;
      });
    });

    const managerKPIs = [
      {
        id: 'shift_volume',
        name: t('shift_dispensed', 'Shift Dispensed'),
        value: formatLiters(shiftDispensed),
        delta: shiftDispensed > 0 ? '+ Active' : '0 L recorded',
        deltaType: 'up',
        sub: t('shift_dispensed_sub', 'Fuel pumped across active nozzles on duty'),
        icon: Droplets,
        color: '#2563eb',
      },
      {
        id: 'active_shift',
        name: t('active_duty', 'Active Shift Duty'),
        value: '12-Hour Cycle',
        delta: 'On Duty',
        deltaType: 'up',
        sub: t('shift_hours', 'Day (07:00-19:00) / Night (19:00-07:00)'),
        icon: ReceiptText,
        color: '#0891b2',
      },
      {
        id: 'tank_inventory',
        name: t('live_tank_stock', 'Tank Fuel Stock'),
        value: formatLiters(totalStock),
        delta: 'Physical Inventory',
        deltaType: 'neutral',
        sub: `${activeTanks.length} operational tanks monitored`,
        icon: Fuel,
        color: '#059669',
      },
      {
        id: 'nozzles_operating',
        name: t('operating_nozzles', 'Operating Nozzles'),
        value: `${activeNozCount} / ${totalNozCount || activeNozCount}`,
        delta: activeNozCount > 0 ? 'Operational' : 'Idle',
        deltaType: activeNozCount > 0 ? 'up' : 'neutral',
        sub: t('nozzle_status_sub', 'Dispenser meters active for meter entries'),
        icon: Gauge,
        color: '#d97706',
      },
      {
        id: 'shift_reconciliation',
        name: t('shift_reconciliation', 'Shift Reconciliation'),
        value: 'Meter Audit',
        delta: 'Audit Ready',
        deltaType: 'neutral',
        sub: t('reconciliation_sub', 'Opening vs closing meters balance required'),
        icon: TrendingUp,
        color: '#7c3aed',
      },
    ];

    return (
      <div className="metric-grid kpi-5-grid">
        {managerKPIs.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div className="metric" key={kpi.id}>
              <div className="metric-top">
                <span>{kpi.name}</span>
                <span className="metric-icon" style={{ background: `${kpi.color}15`, color: kpi.color, padding: '4px', borderRadius: '6px', display: 'inline-flex' }}>
                  <Icon size={16} />
                </span>
              </div>
              <strong>{kpi.value}</strong>
              <div className="metric-bottom">
                <span className={`metric-delta ${kpi.deltaType}`}>
                  {kpi.delta}
                </span>
                <small className="muted">{kpi.sub}</small>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Calculate the 5 KPIs deterministically from actual application state
  const activeTanks = (tanks || []).filter(t => t.active !== false && t.is_active !== false && !t.is_disabled);
  // "Monthly" = rolling last 30 days (matches the Sales overview graph); falls back to the
  // calendar month if the backend has not been migrated to send `sales.last30` yet.
  const kpiPeriod = period === 'monthly' && sales?.last30 ? 'last30' : period;
  const salesData = period === 'daily'
    ? get_today_sales({ sales, tanks: activeTanks })
    : get_sales_by_period(kpiPeriod, { sales, tanks: activeTanks });
  const volumeData = get_fuel_volume({ sales, tanks: activeTanks, period: kpiPeriod });
  const incomePeriod = period === 'daily' ? 'today' : kpiPeriod;
  const incomeData = get_other_income({ income, period: incomePeriod });
  const expensesData = get_expenses({ expenses, period: incomePeriod });
  const profitData = get_net_profit({ sales, tanks: activeTanks, income, expenses, period: incomePeriod });

  const periodLabel = period === 'daily' ? 'previous day' : period === 'weekly' ? 'previous week' : kpiPeriod === 'last30' ? 'previous 30 days' : 'previous month';
  const salesContext = (period === 'daily' && salesData.revenue === 0)
    ? t('shift_in_progress', 'Shift in progress')
    : `vs. ${periodLabel}`;

  // Custom date range: every card shows the selected dates instead of the last real period.
  const cc = customKpis;
  const cDelta = (v) => ({ hasDelta: v !== null && v !== undefined, delta: v === null || v === undefined ? '' : formatPct(v) });
  const customCards = cc ? [
    { id: 'sales', name: t('fuel_sales', 'Fuel Sales'), value: formatPKR(cc.fuelSales), ...cDelta(cc.change.fuelSales), isPositive: (cc.change.fuelSales ?? 0) >= 0, context: cc.compareLabel, Icon: TrendingUp, iconClass: 'icon-0' },
    { id: 'volume', name: t('fuel_volume', 'Fuel Volume'), value: formatLiters(cc.litres), ...cDelta(cc.change.litres), isPositive: (cc.change.litres ?? 0) >= 0, context: cc.compareLabel, Icon: Droplets, iconClass: 'icon-1' },
    { id: 'income', name: t('other_income', 'Other Income'), value: formatPKR(cc.otherIncome), ...cDelta(cc.change.otherIncome), isPositive: (cc.change.otherIncome ?? 0) >= 0, context: cc.compareLabel, Icon: Banknote, iconClass: 'icon-2' },
    // For expenses: a negative % is good (saved money)
    { id: 'expenses', name: t('expenses', 'Expenses'), value: formatPKR(cc.expenses), ...cDelta(cc.change.expenses), isPositive: (cc.change.expenses ?? 0) <= 0, context: cc.compareLabel, Icon: WalletCards, iconClass: 'icon-3' },
    { id: 'profit', name: t('net_profit', 'Net Profit'), value: formatPKR(cc.netProfit), ...cDelta(cc.change.netProfit), isPositive: (cc.change.netProfit ?? 0) >= 0, context: `Margin: ${cc.margin === null ? 'n/a' : `${cc.margin.toFixed(1)}%`}`, Icon: CircleDollarSign, iconClass: 'icon-4' },
  ] : null;

  const kpis = customCards || [
    {
      id: 'sales',
      name: period === 'daily' ? t('todays_sales', "Today's Sales") : t('fuel_sales', 'Fuel Sales'),
      value: salesData.formatted,
      delta: salesData.pctFormatted,
      isPositive: salesData.isPositive,
      hasDelta: salesData.hasDelta ?? (salesData.pctChange !== null),
      context: salesContext,
      Icon: TrendingUp,
      iconClass: 'icon-0',
    },
    {
      id: 'volume',
      name: t('fuel_volume', 'Fuel Volume'),
      value: volumeData.formatted,
      delta: volumeData.pctFormatted,
      isPositive: volumeData.isPositive,
      hasDelta: volumeData.pctChange !== null,
      context: `vs. ${periodLabel}`,
      Icon: Droplets,
      iconClass: 'icon-1',
    },
    {
      id: 'income',
      name: t('other_income', 'Other Income'),
      value: incomeData.formatted,
      delta: incomeData.pctFormatted,
      isPositive: incomeData.isPositive,
      hasDelta: incomeData.pctChange !== null,
      context: `vs. ${periodLabel}`,
      Icon: Banknote,
      iconClass: 'icon-2',
    },
    {
      id: 'expenses',
      name: t('expenses', 'Expenses'),
      value: expensesData.formatted,
      delta: expensesData.pctFormatted,
      // For expenses: a negative % is good (saved money)
      isPositive: expensesData.pctChange !== null && expensesData.pctChange <= 0,
      hasDelta: expensesData.pctChange !== null,
      context: `vs. ${periodLabel}`,
      Icon: WalletCards,
      iconClass: 'icon-3',
    },
    {
      id: 'profit',
      name: t('net_profit', 'Net Profit'),
      value: profitData.formatted,
      delta: profitData.pctFormatted,
      isPositive: profitData.isPositive,
      hasDelta: profitData.pctChange !== null,
      context: `Margin: ${profitData.marginFormatted}`,
      Icon: CircleDollarSign,
      iconClass: 'icon-4',
    },
  ];

  return (
    <div className="metric-grid kpi-5-grid">
      {kpis.map((kpi) => {
        const Icon = kpi.Icon;
        const trendClass = !kpi.hasDelta ? 'muted' : kpi.isPositive ? 'positive' : 'negative';

        return (
          <div className="metric kpi-card" key={kpi.id}>
            <div className="metric-top">
              <span>{kpi.name}</span>
              <div className={`metric-icon ${kpi.iconClass}`}>
                <Icon size={18} />
              </div>
            </div>
            <strong>{kpi.value}</strong>
            <small className={trendClass}>
              {kpi.hasDelta && (
                kpi.isPositive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />
              )}
              {kpi.hasDelta ? kpi.delta : ''}{' '}
              <span>{kpi.context}</span>
            </small>
          </div>
        );
      })}
    </div>
  );
}
