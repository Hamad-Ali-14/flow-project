import React, { useState } from 'react';
import {
  X,
  Printer,
  Download,
  FileText,
  User,
  Calendar,
  Award,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Receipt,
  Languages,
  Check,
} from 'lucide-react';
import { formatPKR } from '../../utils/formatters';
import { monthLabel } from '../../utils/payrollCalculations';
import { fmtDate, fmtDateTime, METHOD_LABEL } from '../../utils/payrollUiHelpers';
import { exportPayslipPdf } from '../../utils/payslipPdfExport';

export default function PayslipModal({ record, detail, onClose }) {
  if (!record) return null;

  const data = detail || record;
  const payments = data.payments || [];

  // View Options: A4 standard sheet vs. 80mm POS thermal receipt
  const [viewMode, setViewMode] = useState('a4'); // 'a4' | 'thermal'
  const [lang, setLang] = useState('en'); // 'en' | 'ur'

  const voucherNumber = `FLOW-SLIP-${record.year}-${String(record.month).padStart(2, '0')}-${String(record.employeeId || 'STAFF').slice(-6).toUpperCase()}`;

  const handleDownloadPdf = () => {
    exportPayslipPdf(record, data);
  };

  const handlePrint = () => {
    window.print();
  };

  const isUrdu = lang === 'ur';

  return (
    <div className="modal-layer" onMouseDown={onClose} id="payslip-modal-overlay">
      <div
        className="modal att-history-modal"
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          maxWidth: viewMode === 'thermal' ? 460 : 760,
          width: '95%',
          transition: 'max-width 0.2s ease',
        }}
      >
        <div className="modal-top">
          <div className="modal-mark">
            <FileText size={20} />
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close dialog">
            <X size={19} />
          </button>
        </div>

        {/* Controls bar: Title, View Switcher & Actions */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 16,
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem' }}>
                {isUrdu ? 'تنخواہ سلپ و واؤچر' : 'Salary Slip & Voucher'}
              </h2>
              <span className={`att-status-pill ${record.status.toLowerCase()}`}>{record.status}</span>
              {record.locked && (
                <span className="perfect-star-badge" style={{ fontSize: 11 }}>
                  🔒 Finalized & Locked
                </span>
              )}
            </div>
            <p style={{ margin: '3px 0 0 0', color: 'var(--muted)', fontSize: 12.5 }}>
              {monthLabel(record.month, record.year)} • FLOW - Gujranwala Cantt Bypass
            </p>
          </div>

          {/* Format & Export Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* View Mode Toggle */}
            <div
              style={{
                display: 'inline-flex',
                background: 'var(--card)',
                border: '1px solid var(--line)',
                borderRadius: 8,
                padding: 2,
              }}
            >
              <button
                type="button"
                className={`button tiny ${viewMode === 'a4' ? 'primary' : 'ghost'}`}
                style={{ padding: '4px 8px', fontSize: 11 }}
                onClick={() => setViewMode('a4')}
                title="A4 Standard Full Voucher"
              >
                <FileText size={12} /> A4
              </button>
              <button
                type="button"
                className={`button tiny ${viewMode === 'thermal' ? 'primary' : 'ghost'}`}
                style={{ padding: '4px 8px', fontSize: 11 }}
                onClick={() => setViewMode('thermal')}
                title="80mm Thermal Receipt (POS Slip)"
              >
                <Receipt size={12} /> 80mm
              </button>
            </div>

            {/* Language Toggle */}
            <button
              type="button"
              className="button secondary tiny"
              style={{ padding: '4px 8px', fontSize: 11 }}
              onClick={() => setLang(isUrdu ? 'en' : 'ur')}
              title="Toggle English / Urdu"
            >
              <Languages size={12} />
              <span>{isUrdu ? 'English' : 'اردو'}</span>
            </button>

            <button className="button secondary tiny" onClick={handlePrint} title="Print voucher">
              <Printer size={13} />
              <span>Print</span>
            </button>
            <button className="button primary tiny" onClick={handleDownloadPdf} title="Download official PDF salary slip">
              <Download size={13} />
              <span>PDF</span>
            </button>
          </div>
        </div>

        {/* =========================================================================
            VIEW 1: STANDARD A4 VOUCHER VIEW
           ========================================================================= */}
        {viewMode === 'a4' && (
          <div
            className="payslip-card-body"
            style={{
              background: 'var(--bg)',
              padding: 20,
              borderRadius: 12,
              border: '1px solid var(--line)',
              direction: isUrdu ? 'rtl' : 'ltr',
            }}
          >
            {/* Station Header Banner */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                borderBottom: '2px solid var(--line)',
                paddingBottom: 14,
                marginBottom: 16,
              }}
            >
              <div>
                <strong style={{ fontSize: '1.2rem', color: 'var(--ink)', letterSpacing: 0.5 }}>
                  FLOW PETROLEUM
                </strong>
                <small style={{ display: 'block', color: 'var(--muted)', fontSize: 11 }}>
                  Station #42 • Gujranwala Cantt Bypass • NTN: 928341-7
                </small>
                <span
                  style={{
                    display: 'inline-block',
                    marginTop: 4,
                    fontSize: 10,
                    fontFamily: 'monospace',
                    background: 'rgba(29, 101, 219, 0.08)',
                    color: 'var(--blue)',
                    padding: '2px 6px',
                    borderRadius: 4,
                  }}
                >
                  Voucher #{voucherNumber}
                </span>
              </div>
              <div style={{ textAlign: isUrdu ? 'left' : 'right' }}>
                <strong style={{ fontSize: 13, color: 'var(--blue)', display: 'block' }}>
                  {isUrdu ? 'سرکاری تنخواہ سلپ' : 'OFFICIAL SALARY SLIP'}
                </strong>
                <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                  {isUrdu ? 'مدت' : 'Period'}: {monthLabel(record.month, record.year)}
                </div>
                <div style={{ fontSize: 11, color: record.balance <= 0 ? 'var(--green)' : '#dc2626', fontWeight: 600 }}>
                  {isUrdu ? 'حیثیت' : 'Settlement'}: {record.balance <= 0 ? (isUrdu ? 'مکمل ادا شدہ' : 'PAID') : (isUrdu ? 'غیر ادا شدہ بقایا' : 'UNPAID')}
                </div>
              </div>
            </div>

            {/* Employee Details Strip */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: 12,
                paddingBottom: 14,
                borderBottom: '1px dashed var(--line)',
              }}
            >
              <div>
                <span style={{ fontSize: 11, color: 'var(--muted)', display: 'block' }}>
                  {isUrdu ? 'ملازم کا نام' : 'EMPLOYEE NAME'}
                </span>
                <strong style={{ fontSize: 14 }}>{record.employeeName}</strong>
              </div>
              <div>
                <span style={{ fontSize: 11, color: 'var(--muted)', display: 'block' }}>
                  {isUrdu ? 'عہدہ' : 'DESIGNATION'}
                </span>
                <span style={{ fontSize: 13 }}>{record.designation}</span>
              </div>
              <div>
                <span style={{ fontSize: 11, color: 'var(--muted)', display: 'block' }}>
                  {isUrdu ? 'شفٹ' : 'ASSIGNED SHIFT'}
                </span>
                <span style={{ fontSize: 13 }}>{record.shiftName}</span>
              </div>
              <div>
                <span style={{ fontSize: 11, color: 'var(--muted)', display: 'block' }}>
                  {isUrdu ? 'حاضری تفصیل' : 'ATTENDANCE'}
                </span>
                <span style={{ fontSize: 13 }}>
                  <b style={{ color: 'var(--green)' }}>{record.presentDays}P</b> /{' '}
                  <b style={{ color: '#d97706' }}>{record.leaveDays}L</b> /{' '}
                  <b style={{ color: 'var(--red)' }}>{record.absentDays}A</b>
                </span>
              </div>
            </div>

            {/* Calculation Table */}
            <div style={{ marginTop: 16 }}>
              <table className="att-roster-table" style={{ width: '100%', fontSize: 12.5 }}>
                <thead>
                  <tr>
                    <th>{isUrdu ? 'تفصیل' : 'Description'}</th>
                    <th>{isUrdu ? 'بنیاد / اصول' : 'Rule / Basis'}</th>
                    <th style={{ textAlign: isUrdu ? 'left' : 'right' }}>{isUrdu ? 'رقم' : 'Amount'}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><b>{isUrdu ? 'بنیادی ماہانہ تنخواہ' : 'Basic Monthly Salary'}</b></td>
                    <td>{isUrdu ? 'روسٹر معاہدہ شرح' : 'Fixed Roster Rate'}</td>
                    <td style={{ textAlign: isUrdu ? 'left' : 'right' }}><b>{formatPKR(record.monthlySalary)}</b></td>
                  </tr>
                  <tr>
                    <td>{isUrdu ? 'یومیہ شرح اجرت' : 'Daily Wage Rate'}</td>
                    <td>{isUrdu ? 'ماہانہ تنخواہ ÷ 30 دن' : 'Monthly Salary ÷ 30 days'}</td>
                    <td style={{ textAlign: isUrdu ? 'left' : 'right' }}>{formatPKR(record.dailySalary)} / day</td>
                  </tr>
                  {record.bonus > 0 && (
                    <tr style={{ background: 'rgba(16, 185, 129, 0.06)' }}>
                      <td>
                        <b style={{ color: 'var(--green)' }}>⭐ {isUrdu ? 'مکمل حاضری بونس' : 'Perfect Attendance Bonus'}</b>
                      </td>
                      <td>{isUrdu ? 'ماہ میں 0 چھٹیاں (+1 دن کی اجرت)' : '0 Leaves in month (+1 Daily Wage)'}</td>
                      <td style={{ textAlign: isUrdu ? 'left' : 'right', color: 'var(--green)', fontWeight: 700 }}>
                        +{formatPKR(record.bonus)}
                      </td>
                    </tr>
                  )}
                  {record.deduction > 0 && (
                    <tr style={{ background: 'rgba(239, 68, 68, 0.06)' }}>
                      <td>
                        <b style={{ color: '#dc2626' }}>{isUrdu ? 'چھٹی / غیر حاضری کٹوتی' : 'Leave / Absence Deductions'}</b>
                      </td>
                      <td>
                        {record.deductibleDays} {isUrdu ? 'دن ×' : 'deductible days ×'} {formatPKR(record.dailySalary)}
                      </td>
                      <td style={{ textAlign: isUrdu ? 'left' : 'right', color: '#dc2626', fontWeight: 700 }}>
                        -{formatPKR(record.deduction)}
                      </td>
                    </tr>
                  )}
                  <tr style={{ borderTop: '2px solid var(--line)', background: 'rgba(29, 101, 219, 0.05)' }}>
                    <td>
                      <strong style={{ fontSize: 14 }}>{isUrdu ? 'خالص قابل ادا تنخواہ' : 'NET TAKE-HOME SALARY'}</strong>
                    </td>
                    <td>{isUrdu ? 'ماہ کا کل معاوضہ' : 'Total wage payable for month'}</td>
                    <td style={{ textAlign: isUrdu ? 'left' : 'right' }}>
                      <strong style={{ fontSize: 15.5, color: 'var(--ink)' }}>{formatPKR(record.finalSalary)}</strong>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Settlement / Payments Strip */}
            <div
              style={{
                marginTop: 16,
                padding: 12,
                borderRadius: 8,
                background: 'rgba(11, 40, 80, 0.03)',
                border: '1px solid var(--line)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <span style={{ fontSize: 11, color: 'var(--muted)', display: 'block', textTransform: 'uppercase', fontWeight: 700 }}>
                    {isUrdu ? 'ادائیگی کی حیثیث' : 'Settlement Status'}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: record.balance <= 0 ? 'var(--green)' : '#dc2626' }}>
                    {record.balance <= 0
                      ? (isUrdu ? 'مکمل ادا شدہ (کوئی بقایا نہیں)' : 'FULLY PAID (Zero Balance)')
                      : `${isUrdu ? 'غیر ادا شدہ بقایا' : 'PARTIAL / UNPAID'} (${formatPKR(record.balance)})`}
                  </span>
                </div>
                <div style={{ textAlign: isUrdu ? 'left' : 'right' }}>
                  <span style={{ fontSize: 11, color: 'var(--muted)', display: 'block' }}>
                    {isUrdu ? 'کل ادا شدہ رقم' : 'TOTAL DISBURSED'}
                  </span>
                  <strong style={{ fontSize: 14 }}>{formatPKR(record.paidTotal)}</strong>
                </div>
              </div>

              {/* List payments if any */}
              {payments.length > 0 && (
                <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px dashed var(--line)' }}>
                  <small style={{ fontWeight: 700, display: 'block', marginBottom: 4, color: 'var(--muted)' }}>
                    {isUrdu ? `ادائیگیوں کا ریکارڈ (${payments.length}):` : `Recorded Disbursements (${payments.length}):`}
                  </small>
                  {payments.map((p) => (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, padding: '3px 0' }}>
                      <span>
                        {fmtDate(p.paymentDate)} • {METHOD_LABEL[p.method] || p.method} {p.reference ? `(${p.reference})` : ''}
                      </span>
                      <strong style={{ color: 'var(--green)' }}>{formatPKR(p.paidAmount)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Signature Block */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 30,
                marginTop: 22,
                paddingTop: 16,
                borderTop: '1px solid var(--line)',
              }}
            >
              <div style={{ textAlign: 'center' }}>
                <div style={{ borderBottom: '1px solid var(--line)', height: 32 }} />
                <small style={{ color: 'var(--muted)', marginTop: 4, display: 'block' }}>
                  {isUrdu ? 'مینیجر دستخط اور مہر' : 'Manager Signature & Station Stamp'}
                </small>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ borderBottom: '1px solid var(--line)', height: 32 }} />
                <small style={{ color: 'var(--muted)', marginTop: 4, display: 'block' }}>
                  {isUrdu ? 'ملازم دستخط / نشان انگوٹھا' : 'Employee Signature / Thumbprint'}
                </small>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            VIEW 2: 80MM POS THERMAL SLIP VIEW (Receipt Printer Format)
           ========================================================================= */}
        {viewMode === 'thermal' && (
          <div
            className="thermal-slip-container"
            style={{
              background: '#ffffff',
              color: '#111827',
              padding: '18px 16px',
              borderRadius: 6,
              fontFamily: '"Courier New", Courier, monospace',
              fontSize: 12,
              boxShadow: '0 4px 18px rgba(0,0,0,0.12)',
              border: '1px solid #e5e7eb',
              margin: '0 auto',
              maxWidth: 380,
            }}
          >
            {/* Thermal Station Header */}
            <div style={{ textAlign: 'center', borderBottom: '1px dashed #4b5563', paddingBottom: 10, marginBottom: 10 }}>
              <strong style={{ fontSize: 16, display: 'block', letterSpacing: 1 }}>FLOW PETROLEUM</strong>
              <div style={{ fontSize: 11, color: '#4b5563' }}>STATION #42 • GUJRANWALA</div>
              <div style={{ fontSize: 10, color: '#6b7280' }}>CANTONMENT BYPASS</div>
              <div style={{ fontSize: 11, fontWeight: 'bold', marginTop: 4, borderTop: '1px dotted #9ca3af', paddingTop: 4 }}>
                {isUrdu ? '*** تنخواہ پرچی ***' : '*** SALARY PAYMENT SLIP ***'}
              </div>
              <div style={{ fontSize: 10, color: '#374151' }}>
                {monthLabel(record.month, record.year).toUpperCase()}
              </div>
            </div>

            {/* Voucher Metadata */}
            <div style={{ fontSize: 11, marginBottom: 8, lineHeight: 1.5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>VOUCHER:</span>
                <b>{voucherNumber}</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>STAFF:</span>
                <b>{record.employeeName}</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>DESIGNATION:</span>
                <span>{record.designation}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>SHIFT:</span>
                <span>{record.shiftName}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>ATTENDANCE:</span>
                <b>{record.presentDays}P / {record.leaveDays}L / {record.absentDays}A</b>
              </div>
            </div>

            {/* Dashed Separator */}
            <div style={{ borderTop: '1px dashed #4b5563', margin: '8px 0' }} />

            {/* Calculation Lines */}
            <div style={{ fontSize: 11.5, lineHeight: 1.6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Basic Salary:</span>
                <span>PKR {record.monthlySalary?.toLocaleString('en-PK')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: '#4b5563' }}>
                <span>(Daily Rate ÷30):</span>
                <span>PKR {record.dailySalary?.toLocaleString('en-PK')}</span>
              </div>

              {record.bonus > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#047857', fontWeight: 'bold' }}>
                  <span>+ Attendance Bonus:</span>
                  <span>+PKR {record.bonus?.toLocaleString('en-PK')}</span>
                </div>
              )}

              {record.deduction > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#b91c1c', fontWeight: 'bold' }}>
                  <span>- Deductions ({record.deductibleDays}d):</span>
                  <span>-PKR {record.deduction?.toLocaleString('en-PK')}</span>
                </div>
              )}
            </div>

            {/* Dashed Separator */}
            <div style={{ borderTop: '2px dashed #111827', margin: '8px 0' }} />

            {/* Net Total */}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 'bold' }}>
              <span>NET SALARY:</span>
              <span>PKR {record.finalSalary?.toLocaleString('en-PK')}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 4 }}>
              <span>DISBURSED:</span>
              <span>PKR {record.paidTotal?.toLocaleString('en-PK')}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 'bold', color: record.balance <= 0 ? '#047857' : '#b91c1c' }}>
              <span>BALANCE:</span>
              <span>PKR {record.balance?.toLocaleString('en-PK')}</span>
            </div>

            {/* Payments List if any */}
            {payments.length > 0 && (
              <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px dotted #9ca3af', fontSize: 10 }}>
                <span style={{ fontWeight: 'bold', display: 'block' }}>PAYMENTS:</span>
                {payments.map((p) => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{fmtDate(p.paymentDate)} [{p.method}]</span>
                    <b>PKR {Number(p.paidAmount).toLocaleString('en-PK')}</b>
                  </div>
                ))}
              </div>
            )}

            {/* Barcode representation */}
            <div style={{ textAlign: 'center', marginTop: 14, paddingTop: 8, borderTop: '1px dashed #4b5563' }}>
              <div
                style={{
                  height: 24,
                  background: 'repeating-linear-gradient(90deg, #111827 0, #111827 2px, transparent 2px, transparent 4px, #111827 4px, #111827 7px, transparent 7px, transparent 9px)',
                  maxWidth: 200,
                  margin: '0 auto',
                }}
              />
              <small style={{ fontSize: 9, letterSpacing: 1, display: 'block', marginTop: 3 }}>
                *{voucherNumber}*
              </small>
            </div>

            {/* Signatures */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18, fontSize: 10, textAlign: 'center' }}>
              <div>
                <div style={{ borderBottom: '1px solid #4b5563', width: 100, marginBottom: 2 }} />
                <span>Station Mgr</span>
              </div>
              <div>
                <div style={{ borderBottom: '1px solid #4b5563', width: 100, marginBottom: 2 }} />
                <span>Staff Sign</span>
              </div>
            </div>

            {/* Footer cut mark */}
            <div style={{ textAlign: 'center', marginTop: 12, fontSize: 9, color: '#6b7280' }}>
              ---------------- CUT HERE ----------------
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
