import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Banknote,
  Calendar,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Lock,
  FileText,
  CreditCard,
  History,
  Download,
  FileSpreadsheet,
  Search,
  Filter,
  Sparkles,
  Users,
  Award,
  Zap,
  RotateCcw,
  ShieldCheck,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { formatPKR } from '../../utils/formatters';
import { payrollApi } from '../../services/payrollService';
import {
  STATUS_TONE,
  PAYMENT_TONE,
  METHOD_LABEL,
  fmtDate,
  fmtDateTime,
  karachiToday,
} from '../../utils/payrollUiHelpers';
import { monthLabel, MONTH_NAMES } from '../../utils/payrollCalculations';
import PayrollReviewModal from './PayrollReviewModal';
import RecordPaymentModal from './RecordPaymentModal';
import PayslipModal from './PayslipModal';
import PayrollAuditTrailModal from './PayrollAuditTrailModal';
import PayrollReportsView from './PayrollReportsView';

// Show paisa when a balance is fractional (0.33 must not display as "PKR 0" while still payable).
const formatBalance = (n) => {
  const v = Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  return Number.isInteger(v) ? formatPKR(v) : `PKR ${v.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export default function PayrollPage({ notify }) {
  const { t } = useLanguage();

  // Active view tab: 'register' (Modules 7 & 8) | 'payments' (Module 9 Ledger)
  const [activeTab, setActiveTab] = useState('register');

  // Month & Year state (defaults to current Karachi month/year)
  const todayParts = useMemo(() => {
    const today = karachiToday();
    const [y, m] = today.split('-').map(Number);
    return { year: y, month: m };
  }, []);

  const [selectedMonth, setSelectedMonth] = useState(todayParts.month);
  const [selectedYear, setSelectedYear] = useState(todayParts.year);

  // Data state
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [payrollData, setPayrollData] = useState({
    rows: [],
    summary: { count: 0, draft: 0, approved: 0, rejected: 0, finalized: 0, totalPayable: 0, totalPaid: 0, missingEmployees: [] },
  });
  const [paymentHistoryList, setPaymentHistoryList] = useState([]);

  // Search & Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');

  // Modals state
  const [reviewRecord, setReviewRecord] = useState(null);
  const [paymentRecord, setPaymentRecord] = useState(null);
  const [payslipRecord, setPayslipRecord] = useState(null);
  const [payslipDetail, setPayslipDetail] = useState(null);
  const [auditTrailOpen, setAuditTrailOpen] = useState(false);
  const [auditCount, setAuditCount] = useState(0);

  // Load Payroll Data
  const loadPayroll = useCallback(async () => {
    setLoading(true);
    try {
      const data = await payrollApi.list(selectedMonth, selectedYear);
      setPayrollData(data || { rows: [], summary: {} });

      // Also load payment ledger
      const payments = await payrollApi.paymentHistory({ month: selectedMonth, year: selectedYear });
      setPaymentHistoryList(payments || []);

      // Also load audit log count (Module 11)
      try {
        const auditLogs = await payrollApi.getAuditSummary(50);
        setAuditCount(auditLogs?.length || 0);
      } catch (e) {
        // Non-fatal
      }
    } catch (err) {
      console.warn('Error fetching payroll:', err);
      if (notify) notify(err.message || 'Failed to load payroll data', 'error');
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, selectedYear, notify]);

  useEffect(() => {
    loadPayroll();
  }, [loadPayroll]);

  // Handler: Generate Payroll (Module 7)
  const handleGeneratePayroll = async () => {
    setGenerating(true);
    try {
      const res = await payrollApi.generate(selectedMonth, selectedYear);
      let msg = `Payroll generated: ${res.created} created, ${res.replaced} updated.`;
      if (res.skipped?.length > 0) {
        msg += ` (${res.skipped.length} skipped - already finalized or no salary set)`;
      }
      if (notify) notify(msg, 'success');
      await loadPayroll();
    } catch (err) {
      console.warn('Generation failed:', err);
      if (notify) notify(err.message || 'Failed to generate payroll', 'error');
    } finally {
      setGenerating(false);
    }
  };

  // Handler: Finalize All Approved (Module 8)
  const handleFinalizeAll = async () => {
    const approvedCount = payrollData.summary?.approved || 0;
    if (approvedCount === 0) {
      if (notify) notify('There are no approved payroll records to finalize.', 'warning');
      return;
    }
    const confirmed = window.confirm(
      `Are you sure you want to finalize and lock ${approvedCount} approved payroll records for ${monthLabel(selectedMonth, selectedYear)}? Once finalized, they cannot be edited.`,
    );
    if (!confirmed) return;

    setFinalizing(true);
    try {
      const res = await payrollApi.finalize(selectedMonth, selectedYear);
      if (notify) notify(`Finalized & locked ${res.finalized} payroll records. Ready for settlement!`, 'success');
      await loadPayroll();
    } catch (err) {
      console.warn('Finalization failed:', err);
      if (notify) notify(err.message || 'Failed to finalize payroll', 'error');
    } finally {
      setFinalizing(false);
    }
  };

  // Handler: Single Review Decision (Module 8)
  const handleReviewDecision = async (payrollId, decision, note) => {
    try {
      await payrollApi.review(payrollId, decision, note);
      if (notify) notify(`Payroll ${decision.toLowerCase()} successfully`, 'success');
      await loadPayroll();
    } catch (err) {
      console.warn('Review failed:', err);
      if (notify) notify(err.message || 'Failed to submit review', 'error');
      throw err;
    }
  };

  // Handler: Record Payment (Module 9)
  const handleRecordPayment = async (payrollId, paymentPayload) => {
    try {
      await payrollApi.recordPayment(payrollId, paymentPayload);
      if (notify) notify(`Disbursed ${formatPKR(paymentPayload.amount)} via ${paymentPayload.method}`, 'success');
      await loadPayroll();
    } catch (err) {
      console.warn('Payment recording failed:', err);
      if (notify) notify(err.message || 'Failed to record payment', 'error');
      throw err;
    }
  };

  // Handler: Open Payslip Modal
  const handleOpenPayslip = async (record) => {
    try {
      const fullDetail = await payrollApi.get(record.id);
      setPayslipDetail(fullDetail);
      setPayslipRecord(record);
    } catch (err) {
      // Fallback to basic record
      setPayslipDetail(record);
      setPayslipRecord(record);
    }
  };

  // Filtered rows for Register
  const filteredRows = useMemo(() => {
    return (payrollData.rows || []).filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (paymentFilter !== 'all' && r.paymentStatus !== paymentFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const name = (r.employeeName || '').toLowerCase();
        const desig = (r.designation || '').toLowerCase();
        if (!name.includes(q) && !desig.includes(q)) return false;
      }
      return true;
    });
  }, [payrollData.rows, statusFilter, paymentFilter, search]);

  const summary = payrollData.summary || {};
  const totalBalance = Math.max(0, (summary.totalPayable || 0) - (summary.totalPaid || 0));

  return (
    <div className="attendance-page-container">
      {/* Top Banner */}
      <div className="att-top-banner">
        <div className="att-title-group">
          <div className="att-icon-badge" style={{ background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(5, 150, 105, 0.25))', color: 'var(--green)' }}>
            <Banknote size={26} />
          </div>
          <div>
            <h1>{t('payroll', 'Station Payroll')}</h1>
            <p>{t('payroll_desc', 'Payroll generation, manager approvals, finalization lock & payment ledger')}</p>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="att-tabs-nav" role="tablist">
          <button
            type="button"
            className={`att-tab-btn ${activeTab === 'register' ? 'active' : ''}`}
            onClick={() => setActiveTab('register')}
          >
            <Banknote size={16} />
            <span>Payroll Register</span>
          </button>
          <button
            type="button"
            className={`att-tab-btn ${activeTab === 'payments' ? 'active' : ''}`}
            onClick={() => setActiveTab('payments')}
          >
            <History size={16} />
            <span>Payment Ledger</span>
            {paymentHistoryList.length > 0 && (
              <span className="att-audit-count-badge" style={{ background: 'var(--green)' }}>
                {paymentHistoryList.length}
              </span>
            )}
          </button>
          <button
            type="button"
            className={`att-tab-btn ${activeTab === 'reports' ? 'active' : ''}`}
            onClick={() => setActiveTab('reports')}
            id="tab-btn-payroll-reports"
          >
            <FileSpreadsheet size={16} />
            <span>Reports & Analytics</span>
          </button>
        </div>
      </div>

      {/* Period & Control Strip */}
      <div className="att-controls-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div className="att-filter-group">
            <label className="att-filter-label">Month:</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="att-select"
            >
              {MONTH_NAMES.map((name, idx) => (
                <option key={name} value={idx + 1}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div className="att-filter-group">
            <label className="att-filter-label">Year:</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="att-select"
            >
              {[2025, 2026, 2027].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className="button primary"
            onClick={handleGeneratePayroll}
            disabled={generating}
            title="Calculate and generate monthly payroll batch from attendance records"
          >
            <Zap size={15} />
            <span>{generating ? 'Calculating...' : 'Generate Payroll Batch'}</span>
          </button>

          {summary.approved > 0 && (
            <button
              type="button"
              className="button secondary"
              onClick={handleFinalizeAll}
              disabled={finalizing}
              style={{ borderColor: 'var(--green)', color: 'var(--green)' }}
              title="Lock all approved payrolls for disbursement"
            >
              <Lock size={14} />
              <span>Finalize Approved ({summary.approved})</span>
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            className="button secondary tiny"
            onClick={() => setAuditTrailOpen(true)}
            title="View Payroll Lock & Recalculation Audit Trail"
            id="btn-payroll-audit-trail"
          >
            <ShieldCheck size={14} />
            <span>Audit Trail</span>
            {auditCount > 0 && <span className="att-audit-count-badge">{auditCount}</span>}
          </button>
          <button
            type="button"
            className="button secondary tiny"
            onClick={loadPayroll}
            disabled={loading}
            title="Refresh payroll data"
          >
            <RotateCcw size={14} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* KPI Overview Strip */}
      <div className="att-kpi-grid">
        <div className="att-kpi-card">
          <span className="att-kpi-label">Payroll Count</span>
          <strong className="att-kpi-value">{summary.count || 0}</strong>
          <small className="att-kpi-sub">
            {summary.finalized || 0} locked • {summary.draft || 0} draft
          </small>
        </div>

        <div className="att-kpi-card">
          <span className="att-kpi-label">Total Payable</span>
          <strong className="att-kpi-value" style={{ color: 'var(--ink)' }}>
            {formatPKR(summary.totalPayable || 0)}
          </strong>
          <small className="att-kpi-sub">
            +{formatPKR(summary.totalBonus || 0)} bonus • -{formatPKR(summary.totalDeduction || 0)} leaves
          </small>
        </div>

        <div className="att-kpi-card present">
          <span className="att-kpi-label">Disbursed (Paid)</span>
          <strong className="att-kpi-value" style={{ color: 'var(--green)' }}>
            {formatPKR(summary.totalPaid || 0)}
          </strong>
          <small className="att-kpi-sub">Recorded in payment ledger</small>
        </div>

        <div className="att-kpi-card absent">
          <span className="att-kpi-label">Outstanding Balance</span>
          <strong className="att-kpi-value" style={{ color: totalBalance > 0 ? '#dc2626' : 'var(--green)' }}>
            {formatPKR(totalBalance)}
          </strong>
          <small className="att-kpi-sub">
            {totalBalance > 0 ? 'Pending disbursement' : 'All payrolls settled'}
          </small>
        </div>
      </div>

      {/* TAB 1: PAYROLL REGISTER (MODULES 7 & 8) */}
      {activeTab === 'register' && (
        <div className="att-main-card card">
          {/* Filters Bar */}
          <div className="att-controls-bar">
            <div className="att-filter-group">
              <label className="att-filter-label">Approval Status:</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="att-select"
              >
                <option value="all">All Statuses</option>
                <option value="DRAFT">Draft Only</option>
                <option value="APPROVED">Approved Only</option>
                <option value="REJECTED">Rejected Only</option>
                <option value="FINALIZED">Finalized (Locked)</option>
              </select>
            </div>

            <div className="att-filter-group">
              <label className="att-filter-label">Payment Status:</label>
              <select
                value={paymentFilter}
                onChange={(e) => setPaymentFilter(e.target.value)}
                className="att-select"
              >
                <option value="all">All Payments</option>
                <option value="UNPAID">Unpaid</option>
                <option value="PARTIAL">Partially Paid</option>
                <option value="PAID">Fully Paid</option>
              </select>
            </div>

            <div className="table-search search att-search-box">
              <Search size={15} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search staff by name or role..."
              />
            </div>
          </div>

          {/* Payroll Records Table */}
          <div className="table-wrap desktop-table-only" style={{ marginTop: 16 }}>
            <table className="att-monthly-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Attendance</th>
                  <th>Base Salary</th>
                  <th>Daily Rate (÷30)</th>
                  <th>Rule Impact</th>
                  <th>Net Payable</th>
                  <th>Approval</th>
                  <th>Settlement</th>
                  <th>Paid / Balance</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => {
                  return (
                    <tr key={r.id}>
                      <td>
                        <strong className="att-emp-name">{r.employeeName}</strong>
                        <small style={{ display: 'block', color: 'var(--muted)', fontSize: 11.5 }}>
                          {r.designation} • {r.shiftName}
                        </small>
                      </td>

                      <td>
                        <div style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 12 }}>
                          <span style={{ color: 'var(--green)', fontWeight: 700 }}>{r.presentDays}P</span>
                          <span>/</span>
                          <span style={{ color: r.leaveDays > 0 ? '#d97706' : 'var(--muted)', fontWeight: 700 }}>
                            {r.leaveDays}L
                          </span>
                          <span>/</span>
                          <span style={{ color: r.absentDays > 0 ? 'var(--red)' : 'var(--muted)', fontWeight: 700 }}>
                            {r.absentDays}A
                          </span>
                        </div>
                      </td>

                      <td>
                        <div className="att-salary-cell">
                          <span className="att-salary-num">{formatPKR(r.monthlySalary)}</span>
                          <small className="att-salary-sub">Fixed Contract</small>
                        </div>
                      </td>

                      <td>
                        <div className="att-salary-cell">
                          <span className="att-salary-num">{formatPKR(r.dailySalary)}</span>
                          <small className="att-salary-sub">PKR / day</small>
                        </div>
                      </td>

                      <td>
                        {r.bonus > 0 ? (
                          <span className="att-impact-tag bonus">
                            <Award size={11} /> +{formatPKR(r.bonus)} (Bonus)
                          </span>
                        ) : r.deduction > 0 ? (
                          <span className="att-impact-tag deduct">
                            -{formatPKR(r.deduction)} ({r.deductibleDays} leaves)
                          </span>
                        ) : (
                          <span className="att-impact-tag neutral">Standard Wage</span>
                        )}
                      </td>

                      <td>
                        <strong style={{ fontSize: 14, color: r.bonus > 0 ? 'var(--green)' : 'var(--ink)' }}>
                          {formatPKR(r.finalSalary)}
                        </strong>
                      </td>

                      <td>
                        <span className={`att-status-pill ${r.status.toLowerCase()}`}>
                          {r.status === 'FINALIZED' && <Lock size={11} />}
                          {r.status === 'APPROVED' && <CheckCircle2 size={11} />}
                          {r.status === 'REJECTED' && <XCircle size={11} />}
                          {r.status}
                        </span>
                      </td>

                      <td>
                        <span className={`att-status-pill ${r.paymentStatus === 'PAID' ? 'present' : r.paymentStatus === 'PARTIAL' ? 'leave' : 'absent'}`}>
                          {r.paymentStatus}
                        </span>
                      </td>

                      <td>
                        <div style={{ fontSize: 12 }}>
                          <span style={{ color: 'var(--green)', fontWeight: 700 }}>{formatPKR(r.paidTotal)}</span>
                          <span style={{ color: 'var(--muted)', display: 'block', fontSize: 11 }}>
                            Bal: {formatBalance(r.balance)}
                          </span>
                        </div>
                      </td>

                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {/* Module 8 Review button */}
                          {!r.locked && (
                            <button
                              type="button"
                              className="button secondary tiny"
                              onClick={() => setReviewRecord(r)}
                              title="Approve or Reject payroll"
                            >
                              Review
                            </button>
                          )}

                          {/* Module 9 Payment button */}
                          {r.status === 'FINALIZED' && r.balance > 0 && (
                            <button
                              type="button"
                              className="button primary tiny"
                              onClick={() => setPaymentRecord(r)}
                              title="Record payment disbursement"
                            >
                              Pay
                            </button>
                          )}

                          {/* Module 9 Payslip button */}
                          <button
                            type="button"
                            className="button secondary tiny"
                            onClick={() => handleOpenPayslip(r)}
                            title="View salary slip & download PDF"
                          >
                            <FileText size={12} />
                            <span>Slip</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile view */}
          <div className="mobile-cards-only" style={{ marginTop: 14 }}>
            {filteredRows.map((r) => (
              <div key={r.id} className="mobile-record-card">
                <div className="mobile-record-header">
                  <div>
                    <strong className="row-title">{r.employeeName}</strong>
                    <small style={{ display: 'block', color: 'var(--muted)' }}>
                      {r.designation} • {r.shiftName}
                    </small>
                  </div>
                  <span className={`att-status-pill ${r.status.toLowerCase()}`}>{r.status}</span>
                </div>

                <div className="mobile-record-body" style={{ marginTop: 8 }}>
                  <div className="mobile-record-field">
                    <span>Attendance:</span>
                    <b>{r.presentDays}P / {r.leaveDays}L / {r.absentDays}A</b>
                  </div>
                  <div className="mobile-record-field">
                    <span>Base Salary:</span>
                    <b>{formatPKR(r.monthlySalary)}</b>
                  </div>
                  <div className="mobile-record-field">
                    <span>Net Payable:</span>
                    <b style={{ color: 'var(--ink)' }}>{formatPKR(r.finalSalary)}</b>
                  </div>
                  <div className="mobile-record-field">
                    <span>Settlement:</span>
                    <b style={{ color: r.balance <= 0 ? 'var(--green)' : '#dc2626' }}>
                      {r.paymentStatus} (Bal: {formatBalance(r.balance)})
                    </b>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                  {!r.locked && (
                    <button
                      type="button"
                      className="button secondary tiny"
                      onClick={() => setReviewRecord(r)}
                    >
                      Review
                    </button>
                  )}
                  {r.status === 'FINALIZED' && r.balance > 0 && (
                    <button
                      type="button"
                      className="button primary tiny"
                      onClick={() => setPaymentRecord(r)}
                    >
                      Pay
                    </button>
                  )}
                  <button
                    type="button"
                    className="button secondary tiny"
                    onClick={() => handleOpenPayslip(r)}
                  >
                    Slip
                  </button>
                </div>
              </div>
            ))}
          </div>

          {!filteredRows.length && (
            <p className="empty-state">
              No payroll records found for {monthLabel(selectedMonth, selectedYear)}. Click "Generate Payroll Batch" to calculate from attendance.
            </p>
          )}
        </div>
      )}

      {/* TAB 2: PAYMENT HISTORY LEDGER (MODULE 9) */}
      {activeTab === 'payments' && (
        <div className="att-main-card card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Immutable Payment Ledger</h3>
              <p style={{ margin: '3px 0 0 0', color: 'var(--muted)', fontSize: 13 }}>
                Complete audit trail of all salary disbursements for {monthLabel(selectedMonth, selectedYear)}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                Period Disbursed
              </span>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--green)' }}>
                {formatPKR(summary.totalPaid || 0)}
              </div>
            </div>
          </div>

          <div className="table-wrap desktop-table-only">
            <table className="att-history-log-table">
              <thead>
                <tr>
                  <th>Payment Date</th>
                  <th>Employee</th>
                  <th>Amount Disbursed</th>
                  <th>Method</th>
                  <th>Reference / Tx ID</th>
                  <th>Recorded By</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {paymentHistoryList.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{fmtDate(p.paymentDate)}</strong>
                      <small style={{ display: 'block', color: 'var(--muted)', fontSize: 11 }}>
                        {fmtDateTime(p.createdAt)}
                      </small>
                    </td>
                    <td>
                      <strong>{p.employeeName}</strong>
                    </td>
                    <td>
                      <strong style={{ color: 'var(--green)', fontSize: 13.5 }}>
                        {formatPKR(p.paidAmount)}
                      </strong>
                    </td>
                    <td>
                      <span className="att-source-pill">
                        {METHOD_LABEL[p.method] || p.method}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
                        {p.reference || '—'}
                      </span>
                    </td>
                    <td>{p.createdByName || 'Manager'}</td>
                    <td>
                      <span className="att-notes-text">{p.note || '—'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mobile-cards-only" style={{ marginTop: 14 }}>
            {paymentHistoryList.map((p) => (
              <div key={p.id} className="mobile-record-card">
                <div className="mobile-record-header">
                  <div>
                    <strong className="row-title">{p.employeeName}</strong>
                    <small style={{ display: 'block', color: 'var(--muted)' }}>
                      {fmtDate(p.paymentDate)} • {METHOD_LABEL[p.method] || p.method}
                    </small>
                  </div>
                  <strong style={{ color: 'var(--green)' }}>{formatPKR(p.paidAmount)}</strong>
                </div>
                {p.reference && (
                  <small style={{ display: 'block', color: 'var(--muted)', marginTop: 4 }}>
                    Ref: {p.reference}
                  </small>
                )}
                {p.note && (
                  <p style={{ margin: '6px 0 0 0', fontSize: 12, color: 'var(--muted)' }}>
                    Note: {p.note}
                  </p>
                )}
              </div>
            ))}
          </div>

          {!paymentHistoryList.length && (
            <p className="empty-state">No payment disbursements recorded for this period yet.</p>
          )}
        </div>
      )}

      {/* Module 12: Attendance & Payroll Reports Engine */}
      {activeTab === 'reports' && (
        <PayrollReportsView
          month={selectedMonth}
          year={selectedYear}
          payrollRows={payrollData.rows || []}
          payments={paymentHistoryList || []}
          settings={payrollData.settings || {}}
          onOpenPayslip={handleOpenPayslip}
        />
      )}

      {/* Module 8: Review Modal */}
      {reviewRecord && (
        <PayrollReviewModal
          record={reviewRecord}
          onClose={() => setReviewRecord(null)}
          onReview={handleReviewDecision}
        />
      )}

      {/* Module 9: Record Payment Modal */}
      {paymentRecord && (
        <RecordPaymentModal
          record={paymentRecord}
          onClose={() => setPaymentRecord(null)}
          onRecordPayment={handleRecordPayment}
        />
      )}

      {/* Module 10: Payslip Modal */}
      {payslipRecord && (
        <PayslipModal
          record={payslipRecord}
          detail={payslipDetail}
          onClose={() => {
            setPayslipRecord(null);
            setPayslipDetail(null);
          }}
        />
      )}

      {/* Module 11: Payroll Lock & Audit Trail Modal */}
      {auditTrailOpen && (
        <PayrollAuditTrailModal
          onClose={() => setAuditTrailOpen(false)}
        />
      )}
    </div>
  );
}
