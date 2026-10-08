import React, { useState, useEffect } from 'react';
import { useTanks } from './hooks/useTanks';
import { toReportTanks } from './utils/reportTankRows';
import {
  ChartNoAxesCombined,
  CalendarDays,
  Download,
  CheckSquare,
  Square,
  TrendingUp,
  Droplets,
  Banknote,
  WalletCards,
  CircleDollarSign,
  Fuel,
  Receipt,
  Layers,
  ChevronDown,
  FileText,
  FileSpreadsheet,
} from 'lucide-react';
import {
  downloadReport,
  reportData,
  reportPeriod,
  reportSections,
  defaultSelectedSections,
} from './reportExport';
import { downloadPdfReport } from './reportPdfExport';
import Dropdown from './components/common/Dropdown';
import { formatPKR, formatLiters } from './utils/formatters';
import { formatKarachiDate } from './dateUtils';

const presets = {
  'Owner Executive Overview': defaultSelectedSections,
  'Financial Audit': ['Sales', 'Other Income', 'Expenses', 'Net Profit', 'Cash Reconciliation'],
  'Operations & Fuel Stock': ['Sales', 'Fuel Volume', 'Shift Performance', 'Nozzle Performance', 'Inventory'],
  'Full Station Audit (All 11 Sections)': reportSections,
};

export default function ReportsPage({ expenses, income, employees, today, notify }) {
  const { tanks: liveTanks, overview: tankOverview, api, sales } = useTanks();
  const [range, setRange] = useState('week');
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [reportType, setReportType] = useState('Owner Executive Overview');
  const [sections, setSections] = useState(defaultSelectedSections);
  const [busyExcel, setBusyExcel] = useState(false);
  const [busyPdf, setBusyPdf] = useState(false);
  const [salesSummary, setSalesSummary] = useState(null);
  const [shiftReconciliation, setShiftReconciliation] = useState([]);

  useEffect(() => {
    if (api?.getSalesSummary) {
      api.getSalesSummary().then(setSalesSummary).catch(() => { });
    }
    if (api?.getShiftReconciliation) {
      api.getShiftReconciliation().then(res => {
        if (res && res.length) setShiftReconciliation(res);
      }).catch(() => { });
    }
  }, [api]);

  const period = reportPeriod(range, today, start, end);
  const valid = Boolean(period.start && period.end && period.start <= period.end && period.end <= today);

  // Compute local filtered data
  const localData = valid ? reportData({ ...period, expenses, income, today }) : null;

  // Determine active sales bucket
  const activeBucketKey = range === 'today' ? 'daily' : range === 'week' ? 'weekly' : 'monthly';
  const liveBucket = (salesSummary || sales) && range !== 'custom' ? (salesSummary || sales)[activeBucketKey] : null;

  let fuelRevenue = liveBucket ? Number(liveBucket.revenue) || 0 : (localData?.fuelRevenue || 0);
  let fuelLitres = liveBucket ? Number(liveBucket.litres) || 0 : (localData?.fuelLitres || 0);

  if (fuelRevenue === 0 && liveTanks.length > 0) {
    fuelRevenue = liveTanks.reduce((s, t) => s + (Number(t.todayRevenue) || 0), 0);
    fuelLitres = liveTanks.reduce((s, t) => s + (Number(t.todayDispensed) || 0), 0);
  }

  const expenseTotal = localData ? localData.expenseTotal : 0;
  const incomeTotal = localData ? localData.incomeTotal : 0;
  const netResult = fuelRevenue + incomeTotal - expenseTotal;
  const profitMargin = (fuelRevenue + incomeTotal) > 0 ? ((netResult / (fuelRevenue + incomeTotal)) * 100).toFixed(1) : '0.0';

  const toggle = (name) => {
    setSections((prev) =>
      prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name]
    );
  };

  const allSelected = sections.length === reportSections.length;
  const toggleSelectAll = () => {
    if (allSelected) {
      setSections([]);
    } else {
      setSections([...reportSections]);
    }
  };

  const handleGenerateExcel = async () => {
    if (!valid || busyExcel || busyPdf) return;
    if (sections.length === 0) {
      notify('Please select at least one report section to include in the Excel file.');
      return;
    }

    setBusyExcel(true);
    try {
      await downloadReport({
        ...period,
        today,
        expenses,
        income,
        sections,
        reportType,
        tanks: liveTanks || [],
        employees,
        fuelRevenue,
        fuelLitres,
        shiftReconciliation,
        salesSummary,
      });
      notify('Multi-sheet Excel report (.xlsx) exported successfully!');
    } catch (error) {
      console.error('Report export failed', error);
      notify('Unable to generate Excel file. Please try again.');
    } finally {
      setBusyExcel(false);
    }
  };

  const handleGeneratePdf = async () => {
    if (!valid || busyPdf || busyExcel) return;
    if (sections.length === 0) {
      notify('Please select at least one report section to include in the PDF report.');
      return;
    }

    setBusyPdf(true);
    try {
      await downloadPdfReport({
        ...period,
        today,
        expenses,
        income,
        sections,
        reportType,
        tanks: liveTanks || [],
        employees,
        fuelRevenue,
        fuelLitres,
        shiftReconciliation,
        salesSummary,
      });
      notify('Executive PDF report (.pdf) generated and downloaded successfully!');
    } catch (error) {
      console.error('PDF export failed', error);
      notify('Unable to generate PDF report. Please try again.');
    } finally {
      setBusyPdf(false);
    }
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <ChartNoAxesCombined size={15} /> EXECUTIVE REPORTING &amp; ANALYTICS
          </div>
          <h1>Station Reports &amp; Historical Analysis</h1>
          <p>Multi-dimensional historical trends, period financial statements, and multi-sheet Excel exports</p>
        </div>
      </div>

      {/* Main Reporting Controls & Snapshot Grid */}
      <div className="report-grid">
        {/* Left Column: Report Builder & Section Checkboxes */}
        <section className="card report-config">
          <div className="card-head">
            <div>
              <h2>Excel Report Configuration</h2>
              <p>Select period range and choose which sheets to generate in your downloadable Excel workbook (.xlsx).</p>
            </div>
          </div>

          <div className="report-controls">
            <div className="report-field">
              <span>Report Preset</span>
              <Dropdown
                block
                ariaLabel="Report preset"
                value={reportType}
                onChange={(v) => {
                  setReportType(v);
                  setSections(presets[v] || defaultSelectedSections);
                }}
                options={Object.keys(presets).map((p) => ({ value: p, label: p }))}
              />
            </div>

            <div className="report-field">
              <span>Reporting Period</span>
              <Dropdown
                block
                ariaLabel="Reporting period"
                value={range}
                onChange={setRange}
                options={[
                  { value: 'today', label: 'Daily (Today)' },
                  { value: 'week', label: 'Weekly (Last 7 Days)' },
                  { value: 'month', label: 'Monthly (Current Month)' },
                  { value: 'custom', label: 'Custom Date Range' },
                ]}
              />
            </div>

            {range === 'custom' && (
              <>
                <label>
                  From
                  <input type="date" max={today} value={start} onChange={(e) => setStart(e.target.value)} />
                </label>
                <label>
                  To
                  <input type="date" max={today} value={end} onChange={(e) => setEnd(e.target.value)} />
                </label>
              </>
            )}
          </div>

          {!valid && (
            <p className="report-error" role="alert">
              Please select a valid date range ending on or before today ({today}).
            </p>
          )}

          <div className="report-period">
            <CalendarDays size={17} />
            {valid ? `${period.start} through ${period.end} · Asia/Karachi (PKT)` : 'Choose a valid reporting period'}
          </div>

          <fieldset className="report-sections">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <legend style={{ margin: 0, fontWeight: 600 }}>
                Report Sections <small>(Summary sheet included by default)</small>
              </legend>
              <button
                type="button"
                className="button secondary button-sm"
                onClick={toggleSelectAll}
                style={{ padding: '4px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {allSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                {allSelected ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            <div className="checkbox-grid">
              {reportSections.map((sec) => (
                <label key={sec} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={sections.includes(sec)}
                    onChange={() => toggle(sec)}
                  />
                  <span>{sec}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="report-download-actions">
            <button
              type="button"
              className="button primary report-download report-download-pdf"
              disabled={!valid || busyPdf || busyExcel || sections.length === 0}
              onClick={handleGeneratePdf}
            >
              <FileText size={18} />
              {busyPdf ? 'Generating Audited PDF Report...' : 'Download PDF Report (.pdf)'}
            </button>

            <button
              type="button"
              className="button secondary report-download report-download-excel"
              disabled={!valid || busyExcel || busyPdf || sections.length === 0}
              onClick={handleGenerateExcel}
            >
              <FileSpreadsheet size={18} />
              {busyExcel ? 'Generating Multi-Sheet Excel Workbook...' : 'Download Excel Report (.xlsx)'}
            </button>
          </div>
        </section>

        {/* Right Column: Period Snapshot & Executive Metrics */}
        <section className="card report-preview">
          <div className="card-head">
            <div>
              <div className="card-title-row">
                <Receipt size={17} className="text-blue" />
                <h2>Period Financial Snapshot</h2>
              </div>
              <p>Audited figures from station records ({period.start} to {period.end})</p>
            </div>
          </div>

          <div className="snapshot-breakdown">
            {/* 1. Fuel Sales Revenue */}
            <div className="snapshot-row">
              <div className="snapshot-row-left">
                <div className="snapshot-icon blue">
                  <Fuel size={16} />
                </div>
                <div className="snapshot-labels">
                  <span className="snapshot-title">Fuel Sales Revenue</span>
                  <span className="snapshot-meta">{formatLiters(fuelLitres)} dispensed</span>
                </div>
              </div>
              <div className="snapshot-val text-blue">
                {formatPKR(fuelRevenue)}
              </div>
            </div>

            {/* 2. Other Station Income */}
            <div className="snapshot-row">
              <div className="snapshot-row-left">
                <div className="snapshot-icon green">
                  <CircleDollarSign size={16} />
                </div>
                <div className="snapshot-labels">
                  <span className="snapshot-title">Other Income</span>
                  <span className="snapshot-meta">Convenience store &amp; services</span>
                </div>
              </div>
              <div className="snapshot-val text-green">
                +{formatPKR(incomeTotal)}
              </div>
            </div>

            {/* 3. Operating Expenses */}
            <div className="snapshot-row">
              <div className="snapshot-row-left">
                <div className="snapshot-icon amber">
                  <Banknote size={16} />
                </div>
                <div className="snapshot-labels">
                  <span className="snapshot-title">Operating Expenses</span>
                  <span className="snapshot-meta">Station utilities &amp; costs</span>
                </div>
              </div>
              <div className="snapshot-val text-amber">
                -{formatPKR(expenseTotal)}
              </div>
            </div>

            {/* 4. Net Operating Result Highlight Card */}
            <div className={`snapshot-net-card ${netResult >= 0 ? 'positive' : 'negative'}`}>
              <div className="snapshot-net-header">
                <span className="snapshot-net-title">Net Operating Result</span>
                <span className="snapshot-margin-badge">{profitMargin}% Margin</span>
              </div>
              <div className={`snapshot-net-amount ${netResult >= 0 ? 'positive' : 'negative'}`}>
                {formatPKR(netResult)}
              </div>
            </div>
          </div>

          <div className="report-export-sheets">
            <span className="export-sheets-label">
              <Layers size={13} /> Active Sheets for Export ({sections.length}):
            </span>
            <div className="export-sheets-list">
              {sections.map((s) => (
                <span key={s} className="sheet-chip">
                  {s}
                </span>
              ))}
            </div>
          </div>

          <div className="report-note-box">
            <span>Generated from verified shift closings and operating ledger records.</span>
          </div>
        </section>
      </div>
    </>
  );
}