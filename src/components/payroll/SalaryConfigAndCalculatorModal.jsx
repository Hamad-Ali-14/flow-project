import React, { useState, useMemo } from 'react';
import {
  X,
  Calculator,
  Sliders,
  Award,
  HelpCircle,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  TrendingUp,
  Banknote,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { calculateDailySalary, calculateEmployeeSalary, DEFAULT_WORKING_DAYS_BASIS } from '../../utils/payrollEngine';
import { formatPKR } from '../../utils/formatters';

export default function SalaryConfigAndCalculatorModal({ staffList = [], initialEmployee = null, onClose }) {
  const { t } = useLanguage();

  // Active view inside modal: 'calculator' or 'rules'
  const [modalTab, setModalTab] = useState('calculator'); // 'calculator' | 'config'

  // Interactive Simulator State
  const [selectedEmpId, setSelectedEmpId] = useState(() => {
    if (initialEmployee?.id) return initialEmployee.id;
    if (initialEmployee?.employeeId) return initialEmployee.employeeId;
    return staffList[0]?.id || 'custom';
  });
  const [customSalary, setCustomSalary] = useState(() => {
    return initialEmployee?.monthlySalary || initialEmployee?.salary || 30000;
  });
  const [simLeaves, setSimLeaves] = useState(() => {
    return typeof initialEmployee?.leaveDays === 'number' ? initialEmployee.leaveDays : 0;
  });
  const [simAbsents, setSimAbsents] = useState(() => {
    return typeof initialEmployee?.absentDays === 'number' ? initialEmployee.absentDays : 0;
  });
  const [workingDaysBasis, setWorkingDaysBasis] = useState(DEFAULT_WORKING_DAYS_BASIS);

  // Active simulated employee
  const activeEmp = useMemo(() => {
    return staffList.find((s) => s.id === selectedEmpId) || null;
  }, [staffList, selectedEmpId]);

  const effectiveSalary = activeEmp ? activeEmp.monthlySalary : customSalary;

  // Run Module 6 Calculation Engine
  const calculation = useMemo(() => {
    return calculateEmployeeSalary({
      monthlySalary: effectiveSalary,
      leaveDays: simLeaves,
      absentDays: simAbsents,
      workingDaysBasis,
    });
  }, [effectiveSalary, simLeaves, simAbsents, workingDaysBasis]);

  return (
    <div className="modal-layer" onMouseDown={onClose} id="salary-config-modal-overlay">
      <div
        className="modal att-history-modal"
        onMouseDown={(e) => e.stopPropagation()}
        style={{ maxWidth: 740, width: '95%' }}
      >
        <div className="modal-top">
          <div className="modal-mark">
            <Calculator size={20} />
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close dialog">
            <X size={19} />
          </button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: '1.3rem' }}>Salary Engine & Configuration</h2>
          </div>
          <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: 13 }}>
            Working-day basis, daily wage calculation & actual station payroll deduction/bonus engine
          </p>
        </div>

        {/* Tab switch */}
        <div className="att-tabs-nav" style={{ marginBottom: 16 }}>
          <button
            type="button"
            className={`att-tab-btn ${modalTab === 'calculator' ? 'active' : ''}`}
            onClick={() => setModalTab('calculator')}
          >
            <Calculator size={15} /> Live Calculation Simulator
          </button>
          <button
            type="button"
            className={`att-tab-btn ${modalTab === 'config' ? 'active' : ''}`}
            onClick={() => setModalTab('config')}
          >
            <Sliders size={15} /> Station Salary Rules & Roster
          </button>
        </div>

        {/* TAB 1: LIVE CALCULATION SIMULATOR (MODULE 6) */}
        {modalTab === 'calculator' && (
          <div className="att-calc-container">
            {/* Rule banner reminder */}
            <div className="att-rule-banner">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 12.5, color: 'var(--blue)', marginBottom: 4 }}>
                <Sparkles size={14} /> Salary Engine Formula
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
                <div className="att-rule-snippet">
                  <b>Daily Salary</b> = Monthly Salary ÷ 30
                </div>
                <div className="att-rule-snippet">
                  <b>0 Leaves</b>: Monthly + Daily Salary (⭐ Bonus)
                </div>
                <div className="att-rule-snippet" style={{ gridColumn: 'span 2' }}>
                  <b>1+ Leaves</b>: Monthly − (Leave Days × Daily Salary)
                </div>
              </div>
            </div>

            {/* Inputs Grid */}
            <div className="att-sim-controls-grid">
              <div>
                <label style={{ display: 'block', fontWeight: 600, fontSize: 12, marginBottom: 5 }}>
                  Select Employee
                </label>
                <select
                  value={selectedEmpId}
                  onChange={(e) => setSelectedEmpId(e.target.value)}
                  className="att-select"
                  style={{ width: '100%' }}
                >
                  <option value="custom">Custom Test Wage</option>
                  {staffList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.designation}) — {formatPKR(s.monthlySalary)}
                    </option>
                  ))}
                </select>
              </div>

              {selectedEmpId === 'custom' && (
                <div>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: 12, marginBottom: 5 }}>
                    Monthly Salary (PKR)
                  </label>
                  <input
                    type="number"
                    step="500"
                    value={customSalary}
                    onChange={(e) => setCustomSalary(Number(e.target.value))}
                    className="att-select"
                    style={{ width: '100%' }}
                  />
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontWeight: 600, fontSize: 12, marginBottom: 5 }}>
                  Leave Days Taken
                </label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[0, 1, 2, 3, 4].map((cnt) => (
                    <button
                      key={cnt}
                      type="button"
                      className={`button tiny ${simLeaves === cnt ? 'primary' : 'secondary'}`}
                      onClick={() => setSimLeaves(cnt)}
                      style={{ minWidth: 32 }}
                    >
                      {cnt}
                    </button>
                  ))}
                  <input
                    type="number"
                    min="0"
                    max="31"
                    value={simLeaves}
                    onChange={(e) => setSimLeaves(Number(e.target.value))}
                    className="att-select"
                    style={{ width: 64, padding: '4px 6px', textAlign: 'center' }}
                  />
                </div>
              </div>
            </div>

            {/* Live Result Breakdown Card */}
            <div className="att-calc-result-card">
              <div className="att-calc-result-header">
                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)' }}>
                    Calculated Take-Home Salary
                  </span>
                  <div style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em' }}>
                    {formatPKR(calculation.netSalary)}
                  </div>
                </div>
                {calculation.isPerfectAttendance ? (
                  <span className="perfect-star-badge" style={{ fontSize: 13, padding: '6px 12px' }}>
                    <Award size={16} /> ⭐ Perfect Attendance Bonus Active
                  </span>
                ) : (
                  <span className="att-status-pill leave" style={{ fontSize: 12 }}>
                    Deduction: -{formatPKR(calculation.leaveDeduction)}
                  </span>
                )}
              </div>

              {/* Mathematical Breakdown line items */}
              <div className="att-calc-lines">
                <div className="att-calc-line">
                  <span>Base Monthly Wage</span>
                  <strong>{formatPKR(calculation.monthlySalary)}</strong>
                </div>
                <div className="att-calc-line">
                  <span>Daily Salary Basis (÷ 30)</span>
                  <strong>{formatPKR(calculation.dailySalary)} / day</strong>
                </div>
                {calculation.isPerfectAttendance ? (
                  <div className="att-calc-line" style={{ color: 'var(--green)' }}>
                    <span>⭐ Perfect Attendance Bonus (+1 Daily Salary)</span>
                    <strong>+{formatPKR(calculation.bonus)}</strong>
                  </div>
                ) : (
                  <div className="att-calc-line" style={{ color: 'var(--red)' }}>
                    <span>Leave Deduction ({calculation.leaveDays} days × {formatPKR(calculation.dailySalary)})</span>
                    <strong>-{formatPKR(calculation.leaveDeduction)}</strong>
                  </div>
                )}
                <div className="att-calc-line total">
                  <span>Final Calculated Salary</span>
                  <strong style={{ color: 'var(--blue)' }}>{formatPKR(calculation.netSalary)}</strong>
                </div>
              </div>

              {/* Exact reference note from prompt */}
              <div className="att-calc-example-strip">
                <small style={{ color: 'var(--muted)' }}>
                  <b>Example Rule Verification:</b> 30,000 base salary ➔ 0 leaves = 31,000 | 1 leave = 29,000 | 2 leaves = 28,000 | 3 leaves = 27,000
                </small>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: STATION SALARY RULES & ROSTER (MODULE 5) */}
        {modalTab === 'config' && (
          <div className="att-rules-container">
            <div className="att-config-summary">
              <div className="att-config-item">
                <span>Working-Day Basis</span>
                <strong>30 Days</strong>
                <small>Standard station payroll basis</small>
              </div>
              <div className="att-config-item">
                <span>Daily Wage Formula</span>
                <strong>Monthly ÷ 30</strong>
                <small>Exact rate per shift</small>
              </div>
              <div className="att-config-item">
                <span>Perfect Attendance Bonus</span>
                <strong>+1 Daily Wage</strong>
                <small>Awarded on 0 leaves taken</small>
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 10px 0', textTransform: 'uppercase', color: 'var(--muted)' }}>
                Station Staff Salary & Daily Rate Schedule
              </h3>
              <div className="att-modal-table-wrap">
                <table className="att-roster-table">
                  <thead>
                    <tr>
                      <th>Staff Member</th>
                      <th>Designation</th>
                      <th>Assigned Shift</th>
                      <th>Monthly Wage</th>
                      <th>Daily Wage (÷30)</th>
                      <th>0-Leave Potential</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffList.map((emp) => {
                      const daily = calculateDailySalary(emp.monthlySalary, 30);
                      const perfectBonus = emp.monthlySalary + daily;
                      return (
                        <tr key={emp.id}>
                          <td><strong>{emp.name}</strong></td>
                          <td>{emp.designation}</td>
                          <td><span className="att-shift-badge">{emp.shiftName}</span></td>
                          <td><strong>{formatPKR(emp.monthlySalary)}</strong></td>
                          <td><code style={{ color: 'var(--blue)' }}>{formatPKR(daily)}</code></td>
                          <td><strong style={{ color: 'var(--green)' }}>{formatPKR(perfectBonus)}</strong></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        <div className="modal-actions" style={{ marginTop: 20 }}>
          <button className="button primary" onClick={onClose} id="close-salary-engine-btn">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
