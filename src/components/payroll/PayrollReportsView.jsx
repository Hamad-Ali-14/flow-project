import React, { useState, useMemo } from 'react';
import {
  FileSpreadsheet,
  Download,
  Printer,
  CalendarCheck,
  Users,
  Award,
  AlertTriangle,
  Banknote,
  History,
  TrendingUp,
  FileText,
  Search,
  CheckCircle2,
  Clock,
  ArrowUpRight,
} from 'lucide-react';
import { formatPKR } from '../../utils/formatters';
import { monthLabel } from '../../utils/payrollCalculations';
import { fmtDate, METHOD_LABEL } from '../../utils/payrollUiHelpers';
import {
  calculateReportMetrics,
  exportPayrollExcelReport,
  exportPayrollPdfReport,
} from '../../utils/payrollReportExports';

export default function PayrollReportsView({
  month,
  year,
  payrollRows = [],
  payments = [],
  settings = {},
  onOpenPayslip,
}) {
  const [subReport, setSubReport] = useState('summary'); // 'summary' | 'attendance' | 'employee' | 'leaves' | 'audit' | 'payments'
  const [search, setSearch] = useState('');
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const metrics = useMemo(() => {
    return calculateReportMetrics(payrollRows, payments, settings);
  }, [payrollRows, payments, settings]);

  const handleExportExcel = () => {
    setExportingExcel(true);
    try {
      exportPayrollExcelReport({ month, year, rows: payrollRows, payments, settings });
    } finally {
      setTimeout(() => setExportingExcel(false), 500);
    }
  };

  const handleExportPdf = () => {
    setExportingPdf(true);
    try {
      exportPayrollPdfReport({ month, year, rows: payrollRows, payments, settings });
    } finally {
      setTimeout(() => setExportingPdf(false), 500);
    }
  };

  const filteredEmployees = useMemo(() => {
    if (!search) return metrics.employeeStats;
    const q = search.toLowerCase();
    return metrics.employeeStats.filter(
      (e) =>
        (e.employeeName || '').toLowerCase().includes(q) ||
        (e.designation || '').toLowerCase().includes(q) ||
        (e.shiftName || '').toLowerCase().includes(q),
    );
  }, [metrics.employeeStats, search]);

  return (
    <div className="payroll-reports-view" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Top Action Bar with Export Buttons */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          background: 'var(--card)',
          padding: '14px 18px',
          borderRadius: 12,
          border: '1px solid var(--line)',
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>Attendance & Payroll Reports Engine</span>
          </h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: 12.5 }}>
            Audited financial and workforce analytics for {monthLabel(month, year)}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="button secondary tiny"
            onClick={() => window.print()}
            title="Print report"
          >
            <Printer size={13} />
            <span>Print</span>
          </button>
          <button
            type="button"
            className="button secondary tiny"
            onClick={handleExportExcel}
            disabled={exportingExcel || payrollRows.length === 0}
            title="Download multi-sheet Excel (.xlsx)"
            id="btn-export-reports-excel"
          >
            <FileSpreadsheet size={13} style={{ color: 'var(--green)' }} />
            <span>{exportingExcel ? 'Exporting...' : 'Excel (.xlsx)'}</span>
          </button>
          <button
            type="button"
            className="button primary tiny"
            onClick={handleExportPdf}
            disabled={exportingPdf || payrollRows.length === 0}
            title="Download executive PDF report"
            id="btn-export-reports-pdf"
          >
            <Download size={13} />
            <span>{exportingPdf ? 'Generating...' : 'Executive PDF'}</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: 12,
        }}
      >
        <div className="summary-card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)', fontSize: 12 }}>
            <span>NET SALARY PAYABLE</span>
            <Banknote size={15} style={{ color: 'var(--blue)' }} />
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, margin: '6px 0 2px 0' }}>
            {formatPKR(metrics.totalNetSalary)}
          </div>
          <small style={{ color: 'var(--muted)', fontSize: 11 }}>
            Gross base: {formatPKR(metrics.totalBaseSalary)}
          </small>
        </div>

        <div className="summary-card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)', fontSize: 12 }}>
            <span>SETTLEMENT STATUS</span>
            <TrendingUp size={15} style={{ color: 'var(--green)' }} />
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, margin: '6px 0 2px 0', color: 'var(--green)' }}>
            {formatPKR(metrics.totalPaid)}
          </div>
          <small style={{ color: metrics.totalBalance > 0 ? '#ef4444' : 'var(--muted)', fontSize: 11, fontWeight: 600 }}>
            {metrics.totalBalance > 0 ? `Unpaid balance: ${formatPKR(metrics.totalBalance)}` : 'Fully cleared'}
          </small>
        </div>

        <div className="summary-card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)', fontSize: 12 }}>
            <span>ON-DUTY ATTENDANCE</span>
            <CalendarCheck size={15} style={{ color: 'var(--green)' }} />
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, margin: '6px 0 2px 0' }}>
            {metrics.overallDutyRate}%
          </div>
          <small style={{ color: 'var(--muted)', fontSize: 11 }}>
            {metrics.totalPresent}P • {metrics.totalLeave}L • {metrics.totalAbsent}A
          </small>
        </div>

        <div className="summary-card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)', fontSize: 12 }}>
            <span>PERFECT ATTENDANCE</span>
            <Award size={15} style={{ color: '#f59e0b' }} />
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, margin: '6px 0 2px 0', color: '#10b981' }}>
            +{formatPKR(metrics.totalBonus)}
          </div>
          <small style={{ color: 'var(--muted)', fontSize: 11 }}>
            {metrics.bonusEarners.length} of {metrics.staffCount} staff (+1 daily wage)
          </small>
        </div>
      </div>

      {/* Sub-Reports Switcher Tabs */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          paddingBottom: 4,
          borderBottom: '1px solid var(--line)',
        }}
        role="tablist"
      >
        {[
          { id: 'summary', label: '1. Salary & Wage Summary', icon: Banknote },
          { id: 'attendance', label: '2. Monthly Attendance', icon: CalendarCheck },
          { id: 'employee', label: '3. Employee Performance', icon: Users },
          { id: 'leaves', label: '4. Leave Analysis', icon: AlertTriangle },
          { id: 'audit', label: '5. Bonus vs Deduction Audit', icon: Award },
          { id: 'payments', label: `6. Payment Ledger (${payments.length})`, icon: History },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = subReport === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              className={`button tiny ${active ? 'primary' : 'ghost'}`}
              style={{
                borderRadius: 8,
                padding: '6px 12px',
                fontSize: 12,
                whiteSpace: 'nowrap',
              }}
              onClick={() => setSubReport(tab.id)}
            >
              <Icon size={13} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Search Filter for Table Views */}
      {subReport !== 'payments' && (
        <div className="pr-reports-toolbar">
          <div className="search pr-reports-search">
            <Search size={15} />
            <input
              type="text"
              placeholder="Search staff, role, shift..."
              aria-label="Search staff, role, shift"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span className="pr-reports-count">
            Showing {filteredEmployees.length} of {metrics.staffCount} staff
          </span>
        </div>
      )}

      {/* =========================================================================
          SUB-REPORT 1: SALARY & WAGE SUMMARY (Module 12.4)
         ========================================================================= */}
      {subReport === 'summary' && (
        <div className="pr-table-card">
          <table className="att-roster-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Shift</th>
                <th style={{ textAlign: 'right' }}>Base Salary</th>
                <th style={{ textAlign: 'right' }}>Daily Rate</th>
                <th style={{ textAlign: 'center' }}>Attendance</th>
                <th style={{ textAlign: 'right' }}>Bonus</th>
                <th style={{ textAlign: 'right' }}>Deductions</th>
                <th style={{ textAlign: 'right' }}>Net Take-Home</th>
                <th style={{ textAlign: 'right' }}>Disbursed</th>
                <th style={{ textAlign: 'right' }}>Balance</th>
                <th style={{ textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map((r) => (
                <tr key={r.id || r.employeeId}>
                  <td>
                    <strong>{r.employeeName}</strong>
                    <small style={{ display: 'block', color: 'var(--muted)' }}>{r.designation}</small>
                  </td>
                  <td>
                    <span className="att-shift-tag">{r.shiftName}</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>{formatPKR(r.monthlySalary)}</td>
                  <td style={{ textAlign: 'right' }}>{formatPKR(r.dailySalary)}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span style={{ fontSize: 12 }}>
                      <b style={{ color: 'var(--green)' }}>{r.presentDays}P</b> /{' '}
                      <b style={{ color: '#d97706' }}>{r.leaveDays}L</b> /{' '}
                      <b style={{ color: 'var(--red)' }}>{r.absentDays}A</b>
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {r.bonus > 0 ? (
                      <span style={{ color: 'var(--green)', fontWeight: 600 }}>+{formatPKR(r.bonus)}</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {r.deduction > 0 ? (
                      <span style={{ color: '#ef4444', fontWeight: 600 }}>-{formatPKR(r.deduction)}</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <strong>{formatPKR(r.finalSalary)}</strong>
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--green)' }}>{formatPKR(r.paidTotal)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: r.balance > 0 ? '#ef4444' : 'var(--green)' }}>
                    {formatPKR(r.balance)}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      type="button"
                      className="button secondary tiny"
                      onClick={() => onOpenPayslip && onOpenPayslip(r)}
                      title="View & print official slip"
                    >
                      <FileText size={11} /> Slip
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* =========================================================================
          SUB-REPORT 2: MONTHLY ATTENDANCE REGISTER (Module 12.1)
         ========================================================================= */}
      {subReport === 'attendance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Station overall metrics */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
              background: 'var(--card)',
              padding: 14,
              borderRadius: 10,
              border: '1px solid var(--line)',
            }}
          >
            <div>
              <span style={{ fontSize: 11, color: 'var(--muted)', display: 'block' }}>TOTAL PRESENT DAYS</span>
              <strong style={{ fontSize: 18, color: 'var(--green)' }}>{metrics.totalPresent}</strong>
            </div>
            <div>
              <span style={{ fontSize: 11, color: 'var(--muted)', display: 'block' }}>TOTAL LEAVE DAYS</span>
              <strong style={{ fontSize: 18, color: '#f59e0b' }}>{metrics.totalLeave}</strong>
            </div>
            <div>
              <span style={{ fontSize: 11, color: 'var(--muted)', display: 'block' }}>TOTAL ABSENT DAYS</span>
              <strong style={{ fontSize: 18, color: 'var(--red)' }}>{metrics.totalAbsent}</strong>
            </div>
            <div>
              <span style={{ fontSize: 11, color: 'var(--muted)', display: 'block' }}>STATION ON-DUTY RATE</span>
              <strong style={{ fontSize: 18, color: 'var(--blue)' }}>{metrics.overallDutyRate}%</strong>
            </div>
          </div>

          <div className="pr-table-card">
            <table className="att-roster-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Shift</th>
                  <th style={{ textAlign: 'center' }}>Present Days</th>
                  <th style={{ textAlign: 'center' }}>Leave Days</th>
                  <th style={{ textAlign: 'center' }}>Absent Days</th>
                  <th style={{ textAlign: 'center' }}>On-Duty Rate</th>
                  <th>Status Assessment</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((e) => (
                  <tr key={e.employeeId}>
                    <td>
                      <strong>{e.employeeName}</strong>
                      <small style={{ display: 'block', color: 'var(--muted)' }}>{e.designation}</small>
                    </td>
                    <td>{e.shiftName}</td>
                    <td style={{ textAlign: 'center', fontWeight: 600, color: 'var(--green)' }}>
                      {e.presentDays}
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 600, color: '#f59e0b' }}>
                      {e.leaveDays}
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 600, color: 'var(--red)' }}>
                      {e.absentDays}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                        <div
                          style={{
                            width: 60,
                            height: 6,
                            background: 'var(--line)',
                            borderRadius: 3,
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${e.presentRate}%`,
                              height: '100%',
                              background: e.presentRate >= 95 ? 'var(--green)' : e.presentRate >= 80 ? 'var(--blue)' : '#ef4444',
                            }}
                          />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{e.presentRate}%</span>
                      </div>
                    </td>
                    <td>
                      {e.isPerfect ? (
                        <span className="perfect-star-badge" style={{ fontSize: 11 }}>
                          ⭐ 100% Perfect Attendance
                        </span>
                      ) : e.absentDays > 0 ? (
                        <span className="att-status-pill absent" style={{ fontSize: 11 }}>
                          Requires Attention ({e.absentDays} Absents)
                        </span>
                      ) : (
                        <span className="att-status-pill present" style={{ fontSize: 11 }}>
                          Satisfactory Attendance
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =========================================================================
          SUB-REPORT 3: EMPLOYEE ATTENDANCE BREAKDOWN (Module 12.2)
         ========================================================================= */}
      {subReport === 'employee' && (
        <div className="pr-table-card">
          <table className="att-roster-table">
            <thead>
              <tr>
                <th>Staff Member</th>
                <th>Shift Assignment</th>
                <th style={{ textAlign: 'center' }}>Duty Rate (%)</th>
                <th style={{ textAlign: 'center' }}>Leave Rate (%)</th>
                <th style={{ textAlign: 'center' }}>Absent Rate (%)</th>
                <th style={{ textAlign: 'right' }}>Daily Wage Rate</th>
                <th style={{ textAlign: 'center' }}>Slip</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map((e) => (
                <tr key={e.employeeId}>
                  <td>
                    <strong>{e.employeeName}</strong>
                    <small style={{ display: 'block', color: 'var(--muted)' }}>{e.designation}</small>
                  </td>
                  <td>{e.shiftName}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span style={{ color: 'var(--green)', fontWeight: 700 }}>{e.presentRate}%</span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span style={{ color: '#f59e0b', fontWeight: 600 }}>{e.leaveRate}%</span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span style={{ color: 'var(--red)', fontWeight: 600 }}>{e.absentRate}%</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {formatPKR(e.dailySalary)}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      type="button"
                      className="button secondary tiny"
                      onClick={() => onOpenPayslip && onOpenPayslip(e)}
                    >
                      <FileText size={11} /> View Slip
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* =========================================================================
          SUB-REPORT 4: LEAVE ANALYSIS & RANKING (Module 12.3)
         ========================================================================= */}
      {subReport === 'leaves' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.04)',
              border: '1px solid rgba(239, 68, 68, 0.15)',
              borderRadius: 10,
              padding: 14,
            }}
          >
            <strong style={{ color: '#dc2626', fontSize: 13, display: 'block' }}>
              Staff with Leaves or Absences ({metrics.deductionPenalties.length} Staff Members)
            </strong>
            <small style={{ color: 'var(--muted)' }}>
              Each deductible day reduces salary by 1 daily wage (Monthly Salary ÷ 30).
            </small>
          </div>

          <div className="pr-table-card">
            <table className="att-roster-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Shift</th>
                  <th style={{ textAlign: 'center' }}>Leave Days</th>
                  <th style={{ textAlign: 'center' }}>Absent Days</th>
                  <th style={{ textAlign: 'center' }}>Total Deductible Days</th>
                  <th style={{ textAlign: 'right' }}>Daily Wage Rate</th>
                  <th style={{ textAlign: 'right' }}>Total Deducted</th>
                  <th style={{ textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {metrics.deductionPenalties.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: 24, color: 'var(--muted)' }}>
                      🎉 Zero staff members took leaves or absents this month! Perfect station attendance.
                    </td>
                  </tr>
                ) : (
                  metrics.deductionPenalties.map((d) => (
                    <tr key={d.employeeId}>
                      <td>
                        <strong>{d.employeeName}</strong>
                        <small style={{ display: 'block', color: 'var(--muted)' }}>{d.designation}</small>
                      </td>
                      <td>{d.shiftName}</td>
                      <td style={{ textAlign: 'center', color: '#f59e0b', fontWeight: 600 }}>{d.leaveDays}</td>
                      <td style={{ textAlign: 'center', color: 'var(--red)', fontWeight: 600 }}>{d.absentDays}</td>
                      <td style={{ textAlign: 'center', fontWeight: 700 }}>{d.deductibleDays}</td>
                      <td style={{ textAlign: 'right' }}>{formatPKR(d.dailySalary)}</td>
                      <td style={{ textAlign: 'right', color: '#dc2626', fontWeight: 700 }}>
                        -{formatPKR(d.deduction)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="button secondary tiny"
                          onClick={() => onOpenPayslip && onOpenPayslip(d)}
                        >
                          <FileText size={11} /> Slip
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =========================================================================
          SUB-REPORT 5: BONUS VS DEDUCTION AUDIT (Module 12.5)
         ========================================================================= */}
      {subReport === 'audit' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
          {/* Card A: Perfect Attendance Bonus Earners */}
          <div
            style={{
              background: 'var(--card)',
              border: '1px solid var(--line)',
              borderRadius: 12,
              padding: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Award size={18} style={{ color: '#10b981' }} />
              <div>
                <strong style={{ fontSize: 14 }}>Perfect Attendance Bonus Earners</strong>
                <small style={{ display: 'block', color: 'var(--muted)' }}>
                  Rule: 0 leaves in month (+1 daily wage added)
                </small>
              </div>
            </div>

            <div style={{ marginBottom: 12, padding: 8, background: 'rgba(16, 185, 129, 0.06)', borderRadius: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>
                {metrics.bonusEarners.length} staff rewarded • Total Bonus: +{formatPKR(metrics.totalBonus)}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {metrics.bonusEarners.map((b) => (
                <div
                  key={b.employeeId}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: 'var(--bg)',
                    border: '1px solid var(--line)',
                  }}
                >
                  <div>
                    <strong style={{ fontSize: 13 }}>{b.employeeName}</strong>
                    <small style={{ display: 'block', color: 'var(--muted)', fontSize: 11 }}>
                      {b.designation} • {b.presentDays} Present / 0 Leaves
                    </small>
                  </div>
                  <strong style={{ color: 'var(--green)', fontSize: 13 }}>
                    +{formatPKR(b.bonus)}
                  </strong>
                </div>
              ))}
            </div>
          </div>

          {/* Card B: Leave Deductions Imposed */}
          <div
            style={{
              background: 'var(--card)',
              border: '1px solid var(--line)',
              borderRadius: 12,
              padding: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <AlertTriangle size={18} style={{ color: '#ef4444' }} />
              <div>
                <strong style={{ fontSize: 14 }}>Leave Deductions Imposed</strong>
                <small style={{ display: 'block', color: 'var(--muted)' }}>
                  Rule: {metrics.daysBasis} working days basis (Daily Rate × Deductible Days)
                </small>
              </div>
            </div>

            <div style={{ marginBottom: 12, padding: 8, background: 'rgba(239, 68, 68, 0.06)', borderRadius: 6 }}>
              <span style={{ fontSize: 12, color: '#ef4444', fontWeight: 600 }}>
                {metrics.deductionPenalties.length} staff penalized • Total Deductions: -{formatPKR(metrics.totalDeduction)}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {metrics.deductionPenalties.map((d) => (
                <div
                  key={d.employeeId}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: 'var(--bg)',
                    border: '1px solid var(--line)',
                  }}
                >
                  <div>
                    <strong style={{ fontSize: 13 }}>{d.employeeName}</strong>
                    <small style={{ display: 'block', color: 'var(--muted)', fontSize: 11 }}>
                      {d.deductibleDays} deductible days ({d.leaveDays}L, {d.absentDays}A)
                    </small>
                  </div>
                  <strong style={{ color: '#ef4444', fontSize: 13 }}>
                    -{formatPKR(d.deduction)}
                  </strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          SUB-REPORT 6: SALARY PAYMENT HISTORY LEDGER (Module 12.6)
         ========================================================================= */}
      {subReport === 'payments' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Methods summary banner */}
          <div
            style={{
              display: 'flex',
              gap: 12,
              flexWrap: 'wrap',
              background: 'var(--card)',
              padding: 12,
              borderRadius: 10,
              border: '1px solid var(--line)',
            }}
          >
            {Object.entries(metrics.paymentsByMethod).map(([method, amt]) => (
              <div key={method} style={{ padding: '4px 10px', background: 'var(--bg)', borderRadius: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--muted)', display: 'block' }}>
                  {METHOD_LABEL[method] || method}
                </span>
                <strong style={{ fontSize: 13, color: 'var(--ink)' }}>{formatPKR(amt)}</strong>
              </div>
            ))}
          </div>

          <div className="pr-table-card">
            <table className="att-roster-table">
              <thead>
                <tr>
                  <th>Disbursement Date</th>
                  <th>Employee</th>
                  <th style={{ textAlign: 'right' }}>Paid Amount</th>
                  <th>Payment Method</th>
                  <th>Reference #</th>
                  <th>Authorized By</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {payments.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--muted)' }}>
                      No disbursements recorded yet for {monthLabel(month, year)}.
                    </td>
                  </tr>
                ) : (
                  payments.map((p) => (
                    <tr key={p.id}>
                      <td>{p.paymentDate ? fmtDate(p.paymentDate) : '—'}</td>
                      <td>
                        <strong>{p.employeeName}</strong>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--green)' }}>
                        {formatPKR(p.paidAmount)}
                      </td>
                      <td>
                        <span className="att-shift-tag">{METHOD_LABEL[p.method] || p.method}</span>
                      </td>
                      <td>
                        <code style={{ fontSize: 11 }}>{p.reference || '—'}</code>
                      </td>
                      <td>{p.createdByName || 'Station Manager'}</td>
                      <td>
                        <span className="att-status-pill present" style={{ fontSize: 11 }}>
                          {p.status || 'COMPLETED'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
