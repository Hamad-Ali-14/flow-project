import React from 'react';
import {
  CircleDollarSign,
  TrendingUp,
  PieChart,
  Wallet,
  ArrowUpRight,
  ShieldAlert,
} from 'lucide-react';
import { get_net_profit, get_expenses } from '../../utils/flowAiTools';
import { formatPKR } from '../../utils/formatters';

export default function FinancialInsights({
  sales,
  tanks = [],
  income = [],
  expenses = [],
  period = 'today',
  canSeeSales = true,
}) {
  if (!canSeeSales) {
    return (
      <section className="card financial-insights-card">
        <div className="card-head">
          <div>
            <h2>Profitability &amp; Financial Insights</h2>
            <p>Executive net profit and station operating cost breakdown</p>
          </div>
        </div>
        <div className="restricted-overlay">
          <ShieldAlert size={24} />
          <p>Financial intelligence restricted to Owner / Administrator role.</p>
        </div>
      </section>
    );
  }

  const profit = get_net_profit({ sales, tanks, income, expenses, period });
  const expenseData = get_expenses({ expenses, period });

  // Map category breakdowns with percentage bars
  const totalExp = expenseData.total || 0;
  const categories = Object.entries(expenseData.byCategory);

  return (
    <section className="card financial-insights-card">
      <div className="card-head">
        <div>
          <div className="card-title-row">
            <CircleDollarSign size={18} className="text-green" />
            <h2>Profitability &amp; Financial Insights</h2>
          </div>
          <p>Station net bottom-line profit, gross operating margin, and live cost distribution</p>
        </div>
      </div>

      <div className="financial-insights-body">
        {/* Top KPIs: Net Profit & Profit Margin */}
        <div className="profit-spotlight-grid">
          <div className="spotlight-card profit-card">
            <span className="spotlight-label">Station Net Profit</span>
            <strong className="spotlight-value text-green">{profit.formatted}</strong>
            <small className="spotlight-sub">
              Fuel Sales + Other Income - Expenses
            </small>
          </div>

          <div className="spotlight-card margin-card">
            <span className="spotlight-label">Net Operating Margin</span>
            <strong className="spotlight-value text-blue">{profit.marginFormatted}</strong>
            <small className="spotlight-sub">
              {profit.margin > 10 ? 'Healthy operating margin' : 'Monitor fuel purchase price'}
            </small>
          </div>
        </div>

        {/* Revenue Mix */}
        <div className="revenue-mix-box">
          <div className="mix-header">
            <span>Gross Revenue Breakdown</span>
            <strong>{profit.revenueFormatted}</strong>
          </div>
          <div className="mix-bar-wrap">
            <div
              className="mix-segment fuel-segment"
              style={{
                width: `${profit.totalRevenue > 0 ? (profit.fuelRevenue / profit.totalRevenue) * 100 : 80}%`,
              }}
              title={`Fuel Sales: ${formatPKR(profit.fuelRevenue)}`}
            />
            <div
              className="mix-segment income-segment"
              style={{
                width: `${profit.totalRevenue > 0 ? (profit.otherIncome / profit.totalRevenue) * 100 : 20}%`,
              }}
              title={`Other Income: ${formatPKR(profit.otherIncome)}`}
            />
          </div>
          <div className="mix-legend">
            <span>
              <i className="dot blue" /> Fuel Sales ({formatPKR(profit.fuelRevenue)})
            </span>
            <span>
              <i className="dot green" /> Other Income ({formatPKR(profit.otherIncome)})
            </span>
          </div>
        </div>

        {/* Expense Breakdown List */}
        <div className="expense-breakdown-section">
          <div className="breakdown-head">
            <h4>Operating Cost Distribution</h4>
            <span>Total: {expenseData.formatted}</span>
          </div>

          <div className="expense-category-list">
            {categories.length === 0 ? (
              <p className="empty-subtext">No expense records logged for this period.</p>
            ) : (
              categories.map(([category, amount]) => {
                const pct = totalExp > 0 ? Math.round((amount / totalExp) * 100) : 0;
                return (
                  <div key={category} className="expense-category-row">
                    <div className="cat-info">
                      <span className="cat-name">{category}</span>
                      <strong className="cat-amount">{formatPKR(amount)}</strong>
                    </div>
                    <div className="cat-track">
                      <div className="cat-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="cat-pct">{pct}% of costs</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
