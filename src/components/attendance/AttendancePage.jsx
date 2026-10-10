// import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
// import {
//   CalendarCheck,
//   Calendar,
//   Clock,
//   UserCheck,
//   Users,
//   Search,
//   Filter,
//   CheckCircle2,
//   XCircle,
//   AlertCircle,
//   RotateCcw,
//   Sparkles,
//   ChevronLeft,
//   ChevronRight,
//   Download,
//   Award,
//   Zap,
//   Info,
//   Layers,
//   History,
//   FileSpreadsheet,
//   FileEdit,
//   ShieldCheck,
//   Calculator,
//   Banknote,
//   FileText,
// } from 'lucide-react';
// import { useLanguage } from '../../context/LanguageContext';
// import { useTanks } from '../../hooks/useTanks';
// import {
//   getKarachiTodayISO,
//   formatKarachiDate,
//   addDaysISO,
//   KARACHI_SHIFTS,
// } from '../../dateUtils';
// import {
//   isFiller,
//   calculateAttendanceStats,
//   calculateMonthlyAttendanceSummary,
//   filterAttendanceRecords,
//   prepareBulkFillerAttendance,
//   exportAttendanceToCsv,
// } from '../../utils/attendance';
// import { calculateEmployeeSalary, calculateDailySalary } from '../../utils/payrollEngine';
// import { formatPKR } from '../../utils/formatters';
// import EmployeeHistoryModal from './EmployeeHistoryModal';
// import AttendanceCorrectionModal from './AttendanceCorrectionModal';
// import AttendanceAuditTrailModal from './AttendanceAuditTrailModal';
// import SalaryConfigAndCalculatorModal from '../payroll/SalaryConfigAndCalculatorModal';
// import PayslipModal from '../payroll/PayslipModal';
// import { payrollApi } from '../../services/payrollService';

// export default function AttendancePage({ notify, onNavigate }) {
//   const { t } = useLanguage();
//   const { api } = useTanks();

//   // Active view tab: 'daily' (Module 2), 'history' (Module 3), 'monthly' (Module 3)
//   const [activeTab, setActiveTab] = useState('daily');

//   // Daily Screen State
//   const [selectedDate, setSelectedDate] = useState(() => getKarachiTodayISO());
//   const [selectedShift, setSelectedShift] = useState('all'); // 'all', 'Shift 1 - Day', 'Shift 2 - Night'
//   const [searchQuery, setSearchQuery] = useState('');
//   const [staffList, setStaffList] = useState([]);
//   const [attendanceRecords, setAttendanceRecords] = useState([]);
//   const [loading, setLoading] = useState(true);
//   const [savingId, setSavingId] = useState(null);
//   const [bulkSaving, setBulkSaving] = useState(false);
//   // Synchronous in-flight lock: state updates are async, so two fast clicks could both pass a state check.
//   const inFlightRef = useRef(false);
//   const errorText = (err, fallback) => (err && err.message ? `${fallback}: ${err.message}` : fallback);

//   // History Tab Filters
//   const [historyRange, setHistoryRange] = useState('month'); // 'today', 'week', 'month', 'custom'
//   const [historyStartDate, setHistoryStartDate] = useState(() => addDaysISO(getKarachiTodayISO(), -30));
//   const [historyEndDate, setHistoryEndDate] = useState(() => getKarachiTodayISO());
//   const [historyStatusFilter, setHistoryStatusFilter] = useState('all');

//   // Monthly Register State
//   const [selectedMonth, setSelectedMonth] = useState(() => getKarachiTodayISO().slice(0, 7)); // YYYY-MM
//   const [historyEmployeeModal, setHistoryEmployeeModal] = useState(null);

//   // Module 4: Audit & Correction State
//   const [auditLogs, setAuditLogs] = useState([]);
//   const [correctionTarget, setCorrectionTarget] = useState(null);
//   const [auditTrailOpen, setAuditTrailOpen] = useState(false);

//   // Module 5 & 6: Salary Engine Modal State
//   const [salaryEngineOpen, setSalaryEngineOpen] = useState(false);
//   const [calculatorTargetEmployee, setCalculatorTargetEmployee] = useState(null);

//   // Module 10: Salary Slip Modal State from Attendance
//   const [payslipModalData, setPayslipModalData] = useState(null);

//   // 1. Fetch Staff Roster & Attendance
//   const loadData = useCallback(async () => {
//     setLoading(true);
//     try {
//       let roster = [];
//       if (api?.getStaffRoster) {
//         roster = await api.getStaffRoster();
//       } else if (api?.getEmployees) {
//         // Fallback if getStaffRoster not present
//         const raw = await api.getEmployees();
//         roster = raw.map((r, i) => ({
//           id: `emp-${i + 1}`,
//           name: r[0],
//           designation: r[1],
//           shiftName: r[2] || 'Shift 1 - Day',
//           shiftId: null, // placeholder ids are not database uuids
//           active: r[3] === 'Active',
//           monthlySalary: Number(String(r[4]).replace(/[^0-9]/g, '')) || 35000,
//         }));
//       }
//       setStaffList(roster);

//       if (api?.getAttendance) {
//         const records = await api.getAttendance();
//         setAttendanceRecords(records || []);
//       }

//       if (api?.getAttendanceAuditLog) {
//         const logs = await api.getAttendanceAuditLog();
//         setAuditLogs(logs || []);
//       }
//     } catch (err) {
//       console.warn('Error loading attendance data:', err);
//       if (notify) notify('Failed to load attendance records', 'error');
//     } finally {
//       setLoading(false);
//     }
//   }, [api, notify]);

//   useEffect(() => {
//     loadData();
//   }, [loadData]);

//   // Daily records map: key = employeeId
//   const dailyAttendanceMap = useMemo(() => {
//     const map = new Map();
//     for (const r of attendanceRecords) {
//       if (r.date === selectedDate) {
//         map.set(String(r.employeeId || r.employee_id), r);
//       }
//     }
//     return map;
//   }, [attendanceRecords, selectedDate]);

//   // Filtered staff for the Daily View
//   const filteredDailyStaff = useMemo(() => {
//     return staffList.filter((emp) => {
//       // Shift filter
//       if (selectedShift !== 'all') {
//         const empShift = (emp.shiftName || '').toLowerCase();
//         const filterShift = selectedShift.toLowerCase();
//         if (!empShift.includes(filterShift) && !empShift.includes('general')) {
//           return false;
//         }
//       }
//       // Search query
//       if (searchQuery) {
//         const q = searchQuery.toLowerCase();
//         const name = (emp.name || '').toLowerCase();
//         const desig = (emp.designation || '').toLowerCase();
//         if (!name.includes(q) && !desig.includes(q)) return false;
//       }
//       return true;
//     });
//   }, [staffList, selectedShift, searchQuery]);

//   // Fillers count in current daily filtered list
//   const fillerCount = useMemo(() => {
//     return filteredDailyStaff.filter((emp) => isFiller(emp.designation)).length;
//   }, [filteredDailyStaff]);

//   // Daily Attendance Stats
//   const dailyStats = useMemo(() => {
//     const dayRecords = attendanceRecords.filter((r) => r.date === selectedDate);
//     return calculateAttendanceStats(dayRecords, staffList.length);
//   }, [attendanceRecords, selectedDate, staffList.length]);

//   // Monthly Summary Data (Module 3)
//   const monthlySummary = useMemo(() => {
//     // Filter records for selected month (YYYY-MM)
//     const monthRecords = attendanceRecords.filter((r) => r.date && r.date.startsWith(selectedMonth));
//     const [year, month] = selectedMonth.split('-').map(Number);
//     const daysInMonth = new Date(year, month, 0).getDate();
//     return calculateMonthlyAttendanceSummary(monthRecords, staffList, daysInMonth);
//   }, [attendanceRecords, staffList, selectedMonth]);

//   // Monthly Overview Stats
//   const monthlyStats = useMemo(() => {
//     const totalWorkingDays = monthlySummary[0]?.totalWorkingDays || 30;
//     const totalStaff = monthlySummary.length;
//     const perfectCount = monthlySummary.filter((s) => s.isPerfectAttendance).length;
//     const totalLeaves = monthlySummary.reduce((sum, s) => sum + s.leaveDays, 0);
//     const avgRate =
//       totalStaff > 0
//         ? Math.round(monthlySummary.reduce((sum, s) => sum + s.attendanceRate, 0) / totalStaff)
//         : 0;

//     return { totalWorkingDays, totalStaff, perfectCount, totalLeaves, avgRate };
//   }, [monthlySummary]);

//   // History Tab Filtered Records
//   const filteredHistoryRecords = useMemo(() => {
//     return filterAttendanceRecords(attendanceRecords, {
//       search: searchQuery,
//       shift: selectedShift,
//       status: historyStatusFilter,
//       startDate: historyStartDate,
//       endDate: historyEndDate,
//     });
//   }, [attendanceRecords, searchQuery, selectedShift, historyStatusFilter, historyStartDate, historyEndDate]);

//   // Handler: Single Mark Attendance (Upsert)
//   const handleMarkAttendance = async (employee, status) => {
//     if (inFlightRef.current) return; // a save is already running
//     inFlightRef.current = true;
//     setSavingId(employee.id);
//     const current = dailyAttendanceMap.get(String(employee.id));
//     const shift = employee.shiftName || 'Shift 1 - Day';
//     const isNight = shift.includes('Night');

//     const payload = {
//       employeeId: employee.id,
//       date: selectedDate,
//       shiftId: employee.shiftId || null,
//       status,
//       notes: current?.notes || (status === 'Leave' ? 'Approved leave' : status === 'Absent' ? 'Unnotified' : 'On-time attendance'),
//       checkInTime: status === 'Present' ? (isNight ? '19:00' : '07:00') : null,
//       checkOutTime: status === 'Present' ? (isNight ? '07:00' : '19:00') : null,
//       attendanceSource: 'Manual',
//     };

//     try {
//       if (api?.markAttendance) {
//         const saved = await api.markAttendance(payload);
//         setAttendanceRecords((prev) => {
//           const idx = prev.findIndex(
//             (r) =>
//               (String(r.employeeId || r.employee_id) === String(employee.id) || r.employeeName === employee.name) &&
//               r.date === selectedDate,
//           );
//           if (idx >= 0) {
//             const next = [...prev];
//             next[idx] = { ...next[idx], ...saved };
//             return next;
//           }
//           return [saved, ...prev];
//         });
//         if (notify) notify(`${employee.name} marked ${status}`);
//       } else {
//         // Local state fallback
//         const mockSaved = {
//           ...payload,
//           id: `att-${Date.now()}`,
//           employeeName: employee.name,
//           designation: employee.designation,
//           shiftName: employee.shiftName,
//         };
//         setAttendanceRecords((prev) => [mockSaved, ...prev.filter((r) => !(r.employeeId === employee.id && r.date === selectedDate))]);
//         if (notify) notify(`${employee.name} marked ${status} (local)`);
//       }
//     } catch (err) {
//       console.error('Error marking attendance:', err);
//       if (notify) notify(errorText(err, 'Failed to record attendance'), 'error');
//     } finally {
//       inFlightRef.current = false;
//       setSavingId(null);
//     }
//   };

//   // Handler: Update Check-in / Notes for an already marked record
//   const handleUpdateRecordDetails = async (employee, field, value) => {
//     const current = dailyAttendanceMap.get(String(employee.id));
//     if (!current) return;
//     const updated = {
//       ...current,
//       employeeId: employee.id,
//       [field]: value,
//     };
//     try {
//       if (api?.markAttendance) {
//         const saved = await api.markAttendance(updated);
//         setAttendanceRecords((prev) => prev.map((r) => (r.id === current.id ? { ...r, ...saved } : r)));
//       }
//     } catch (err) {
//       console.error('Failed to update record details:', err);
//       if (notify) notify(errorText(err, 'Failed to update attendance details'), 'error');
//     }
//   };

//   // Handler: Attendance Correction with Audit Trail (Module 4)
//   const handleSaveCorrection = async (correctionData) => {
//     try {
//       if (api?.correctAttendanceRecord) {
//         const result = await api.correctAttendanceRecord(correctionData);
//         if (result?.record) {
//           setAttendanceRecords((prev) => {
//             const idx = prev.findIndex(
//               (r) =>
//                 r.id === result.record.id ||
//                 (String(r.employeeId || r.employee_id) === String(result.record.employeeId) &&
//                   r.date === result.record.date),
//             );
//             if (idx >= 0) {
//               const next = [...prev];
//               next[idx] = { ...next[idx], ...result.record };
//               return next;
//             }
//             return [result.record, ...prev];
//           });
//         }
//         if (result?.auditEntry) {
//           setAuditLogs((prev) => [result.auditEntry, ...prev]);
//         }
//       } else {
//         const auditEntry = {
//           id: `audit-${Date.now()}`,
//           attendanceId: correctionData.attendanceId,
//           employeeId: correctionData.employeeId,
//           employeeName: correctionData.employeeName,
//           attendanceDate: correctionData.date,
//           date: correctionData.date,
//           previousStatus: correctionData.previousStatus,
//           newStatus: correctionData.newStatus,
//           reason: correctionData.reason,
//           changedBy: 'mgr-current',
//           changedByName: correctionData.changedByName || 'Current Manager',
//           createdAt: new Date().toISOString(),
//         };
//         setAttendanceRecords((prev) =>
//           prev.map((r) => {
//             if (
//               r.id === correctionData.attendanceId ||
//               (String(r.employeeId || r.employee_id) === String(correctionData.employeeId) &&
//                 r.date === correctionData.date)
//             ) {
//               return {
//                 ...r,
//                 status: correctionData.newStatus,
//                 checkInTime: correctionData.newCheckIn || r.checkInTime,
//                 checkOutTime: correctionData.newCheckOut || r.checkOutTime,
//                 lastCorrectedAt: new Date().toISOString(),
//                 correctionReason: correctionData.reason,
//               };
//             }
//             return r;
//           }),
//         );
//         setAuditLogs((prev) => [auditEntry, ...prev]);
//       }

//       // Module 11: Auto-recalculate payroll if period has locked or existing finalized payroll
//       if (correctionData.recalculatePayroll && correctionData.date) {
//         const [y, m] = correctionData.date.split('-').map(Number);
//         try {
//           await payrollApi.recalculate(
//             correctionData.employeeId,
//             m,
//             y,
//             `Attendance correction for ${correctionData.date}: ${correctionData.previousStatus} -> ${correctionData.newStatus} (${correctionData.reason})`,
//             correctionData.changedByName || 'Station Manager'
//           );
//           if (notify) notify(`Payroll automatically recalculated for ${m}/${y}`, 'info');
//         } catch (recalcErr) {
//           console.warn('Auto payroll recalculate notice:', recalcErr);
//         }
//       }

//       if (notify) notify(`Attendance corrected for ${correctionData.employeeName || 'staff member'}`);
//       setCorrectionTarget(null);
//     } catch (err) {
//       console.warn('Error saving correction:', err);
//       if (notify) notify('Failed to save correction', 'error');
//     }
//   };

//   // Handler: Open Payslip from Monthly Register (Module 10)
//   const handleOpenSlipFromMonthly = async (emp, salaryCalc) => {
//     const [y, m] = selectedMonth.split('-').map(Number);
//     try {
//       const listRes = await payrollApi.list(m, y);
//       const existing = (listRes.rows || []).find((r) => String(r.employeeId) === String(emp.employeeId));
//       if (existing) {
//         const detail = await payrollApi.get(existing.id);
//         setPayslipModalData(detail || existing);
//         return;
//       }
//     } catch (err) {
//       console.warn('Notice loading existing payroll record for slip:', err);
//     }
//     const slipRecord = {
//       id: `slip-${emp.employeeId}-${selectedMonth}`,
//       employeeId: emp.employeeId,
//       employeeName: emp.name,
//       designation: emp.designation,
//       shiftName: emp.shiftName || 'Day Shift',
//       month: m,
//       year: y,
//       monthlySalary: salaryCalc.monthlySalary,
//       dailySalary: salaryCalc.dailySalary,
//       daysBasis: salaryCalc.daysBasis || 30,
//       presentDays: emp.presentDays,
//       absentDays: emp.absentDays,
//       leaveDays: emp.leaveDays,
//       deductibleDays: emp.leaveDays + (salaryCalc.absentDeduction > 0 ? emp.absentDays : 0),
//       deduction: (salaryCalc.leaveDeduction || 0) + (salaryCalc.absentDeduction || 0),
//       bonus: salaryCalc.perfectAttendanceBonus || 0,
//       finalSalary: salaryCalc.netSalary,
//       status: 'APPROVED',
//       locked: false,
//       balance: salaryCalc.netSalary,
//       paidTotal: 0,
//       paymentStatus: 'UNPAID',
//     };
//     setPayslipModalData(slipRecord);
//   };

//   // Handler: Bulk Mark for All Fillers (Module 2 Requirement)
//   const handleBulkFillersPresent = async () => {
//     if (inFlightRef.current) return;
//     inFlightRef.current = true;
//     setBulkSaving(true);
//     const fillerList = filteredDailyStaff.filter((emp) => isFiller(emp.designation));
//     if (!fillerList.length) {
//       if (notify) notify('No pump attendants found in the selected view', 'warning');
//       inFlightRef.current = false;
//       setBulkSaving(false);
//       return;
//     }

//     const entries = fillerList.map((emp) => {
//       const isNight = (emp.shiftName || '').includes('Night');
//       return {
//         employeeId: emp.id,
//         date: selectedDate,
//         shiftId: emp.shiftId,
//         shiftName: emp.shiftName,
//         status: 'Present',
//         notes: 'Bulk filler attendance marked',
//         checkInTime: isNight ? '19:00' : '07:00',
//         checkOutTime: isNight ? '07:00' : '19:00',
//         attendanceSource: 'Manual',
//       };
//     });

//     try {
//       if (api?.bulkMarkAttendance) {
//         const savedList = await api.bulkMarkAttendance(entries);
//         setAttendanceRecords((prev) => {
//           // Replace or insert
//           const next = [...prev];
//           for (const s of savedList) {
//             const idx = next.findIndex(
//               (r) =>
//                 (String(r.employeeId || r.employee_id) === String(s.employeeId) || r.employeeName === s.employeeName) &&
//                 r.date === selectedDate,
//             );
//             if (idx >= 0) next[idx] = { ...next[idx], ...s };
//             else next.unshift(s);
//           }
//           return next;
//         });
//         if (notify) notify(`Marked ${savedList.length} fillers present for ${selectedDate}`);
//       }
//     } catch (err) {
//       console.error('Error bulk marking fillers:', err);
//       if (notify) notify(errorText(err, 'Failed to bulk mark fillers'), 'error');
//     } finally {
//       inFlightRef.current = false;
//       setBulkSaving(false);
//     }
//   };

//   // Handler: Bulk Mark All Staff in Current Filter Present
//   const handleBulkAllStaffPresent = async () => {
//     if (!filteredDailyStaff.length || inFlightRef.current) return;
//     inFlightRef.current = true;
//     setBulkSaving(true);
//     const entries = filteredDailyStaff.map((emp) => {
//       const isNight = (emp.shiftName || '').includes('Night');
//       return {
//         employeeId: emp.id,
//         date: selectedDate,
//         shiftId: emp.shiftId,
//         shiftName: emp.shiftName,
//         status: 'Present',
//         notes: 'Bulk roster attendance marked',
//         checkInTime: isNight ? '19:00' : '07:00',
//         checkOutTime: isNight ? '07:00' : '19:00',
//         attendanceSource: 'Manual',
//       };
//     });

//     try {
//       if (api?.bulkMarkAttendance) {
//         const savedList = await api.bulkMarkAttendance(entries);
//         setAttendanceRecords((prev) => {
//           const next = [...prev];
//           for (const s of savedList) {
//             const idx = next.findIndex(
//               (r) =>
//                 (String(r.employeeId || r.employee_id) === String(s.employeeId) || r.employeeName === s.employeeName) &&
//                 r.date === selectedDate,
//             );
//             if (idx >= 0) next[idx] = { ...next[idx], ...s };
//             else next.unshift(s);
//           }
//           return next;
//         });
//         if (notify) notify(`Marked all ${savedList.length} staff members present!`);
//       }
//     } catch (err) {
//       console.error('Error in bulk all staff:', err);
//       if (notify) notify(errorText(err, 'Failed to record bulk attendance'), 'error');
//     } finally {
//       inFlightRef.current = false;
//       setBulkSaving(false);
//     }
//   };

//   // Handler: Export CSV
//   const handleExportCsv = () => {
//     const csvContent = exportAttendanceToCsv(monthlySummary, selectedMonth);
//     const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
//     const url = URL.createObjectURL(blob);
//     const link = document.createElement('a');
//     link.href = url;
//     link.setAttribute('download', `FLOW_Attendance_${selectedMonth}.csv`);
//     document.body.appendChild(link);
//     link.click();
//     document.body.removeChild(link);
//     if (notify) notify(`Exported attendance for ${selectedMonth}`);
//   };

//   return (
//     <div className="attendance-page-container">
//       {/* Header and Tab Selector */}
//       <div className="att-top-banner">
//         <div className="att-title-group">
//           <div className="att-icon-badge">
//             <CalendarCheck size={26} />
//           </div>
//           <div>
//             <h1>{t('attendance', 'Attendance')}</h1>
//             <p>{t('attendance_desc', 'Daily station staff attendance, shifts & monthly history register')}</p>
//           </div>
//         </div>

//         {/* Banner Quick Actions (Module 4 & Module 5/6) */}
//         <div className="att-banner-actions">
//           <button
//             type="button"
//             className="button secondary"
//             onClick={() => setAuditTrailOpen(true)}
//             id="btn-open-audit-trail"
//             title="Attendance Correction Audit Trail"
//           >
//             <ShieldCheck size={16} />
//             <span>Audit Trail</span>
//             {auditLogs.length > 0 && <span className="att-audit-count-badge">{auditLogs.length}</span>}
//           </button>
//           <button
//             type="button"
//             className="button primary"
//             onClick={() => {
//               setCalculatorTargetEmployee(null);
//               setSalaryEngineOpen(true);
//             }}
//             id="btn-open-salary-engine"
//             title="Salary Rules & Payroll Engine"
//           >
//             <Calculator size={16} />
//             <span>Salary Engine</span>
//           </button>
//           {onNavigate && (
//             <button
//               type="button"
//               className="button secondary"
//               onClick={() => onNavigate('payroll')}
//               id="btn-goto-payroll"
//               title="Open Payroll Generation & Settlement"
//               style={{ borderColor: 'rgba(16, 185, 129, 0.4)', color: 'var(--green)' }}
//             >
//               <Banknote size={16} />
//               <span>Payroll Ledger</span>
//             </button>
//           )}
//         </div>

//         {/* Tab Buttons */}
//         <div className="att-tabs-nav" role="tablist">
//           <button
//             id="tab-daily-attendance"
//             className={`att-tab-btn ${activeTab === 'daily' ? 'active' : ''}`}
//             onClick={() => setActiveTab('daily')}
//             role="tab"
//             aria-selected={activeTab === 'daily'}
//           >
//             <Calendar size={16} />
//             <span>{t('daily_attendance', 'Daily Attendance')}</span>
//           </button>
//           <button
//             id="tab-attendance-history"
//             className={`att-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
//             onClick={() => setActiveTab('history')}
//             role="tab"
//             aria-selected={activeTab === 'history'}
//           >
//             <History size={16} />
//             <span>{t('attendance_history', 'Attendance History')}</span>
//           </button>
//           <button
//             id="tab-monthly-attendance"
//             className={`att-tab-btn ${activeTab === 'monthly' ? 'active' : ''}`}
//             onClick={() => setActiveTab('monthly')}
//             role="tab"
//             aria-selected={activeTab === 'monthly'}
//           >
//             <FileSpreadsheet size={16} />
//             <span>{t('monthly_attendance', 'Monthly Register')}</span>
//           </button>
//         </div>
//       </div>

//       {/* KPI Overview Strip */}
//       <div className="att-kpi-grid">
//         {activeTab === 'daily' ? (
//           <>
//             <div className="att-kpi-card">
//               <span className="att-kpi-label">Station Staff</span>
//               <strong className="att-kpi-value">{staffList.length}</strong>
//               <small className="att-kpi-sub">Total on roster</small>
//             </div>
//             <div className="att-kpi-card present">
//               <span className="att-kpi-label">{t('present', 'Present')}</span>
//               <strong className="att-kpi-value" style={{ color: 'var(--green)' }}>
//                 {dailyStats.present}
//               </strong>
//               <small className="att-kpi-sub">{dailyStats.attendanceRate}% on duty</small>
//             </div>
//             <div className="att-kpi-card leave">
//               <span className="att-kpi-label">{t('leave', 'On Leave')}</span>
//               <strong className="att-kpi-value" style={{ color: '#d97706' }}>
//                 {dailyStats.leave}
//               </strong>
//               <small className="att-kpi-sub">Approved leaves</small>
//             </div>
//             <div className="att-kpi-card absent">
//               <span className="att-kpi-label">{t('absent', 'Absent')}</span>
//               <strong className="att-kpi-value" style={{ color: 'var(--red)' }}>
//                 {dailyStats.absent}
//               </strong>
//               <small className="att-kpi-sub">Unnotified</small>
//             </div>
//             <div className="att-kpi-card neutral">
//               <span className="att-kpi-label">Not Marked</span>
//               <strong className="att-kpi-value" style={{ color: 'var(--muted)' }}>
//                 {dailyStats.unmarked}
//               </strong>
//               <small className="att-kpi-sub">Pending entry</small>
//             </div>
//           </>
//         ) : (
//           <>
//             <div className="att-kpi-card">
//               <span className="att-kpi-label">Working Days</span>
//               <strong className="att-kpi-value">{monthlyStats.totalWorkingDays}</strong>
//               <small className="att-kpi-sub">Cycle basis (30 days)</small>
//             </div>
//             <div className="att-kpi-card present">
//               <span className="att-kpi-label">Avg Attendance</span>
//               <strong className="att-kpi-value" style={{ color: 'var(--blue)' }}>
//                 {monthlyStats.avgRate}%
//               </strong>
//               <small className="att-kpi-sub">Station rate</small>
//             </div>
//             <div className="att-kpi-card perfect">
//               <span className="att-kpi-label">100% Perfect Attendance</span>
//               <strong className="att-kpi-value" style={{ color: '#d97706' }}>
//                 ⭐ {monthlyStats.perfectCount}
//               </strong>
//               <small className="att-kpi-sub">0 Leaves & 0 Absents</small>
//             </div>
//             <div className="att-kpi-card leave">
//               <span className="att-kpi-label">Total Station Leaves</span>
//               <strong className="att-kpi-value" style={{ color: '#b45309' }}>
//                 {monthlyStats.totalLeaves}
//               </strong>
//               <small className="att-kpi-sub">Payroll deduction basis</small>
//             </div>
//           </>
//         )}
//       </div>

//       {/* ========================================================================= */}
//       {/* TAB 1: DAILY ATTENDANCE SCREEN (MODULE 2) */}
//       {/* ========================================================================= */}
//       {activeTab === 'daily' && (
//         <div className="att-main-card card">
//           {/* Controls Bar */}
//           <div className="att-controls-bar">
//             {/* Date Navigator */}
//             <div className="att-date-nav">
//               <button
//                 className="icon-btn tiny"
//                 onClick={() => setSelectedDate((d) => addDaysISO(d, -1))}
//                 title="Previous Day"
//                 aria-label="Previous Day"
//                 id="prev-day-btn"
//               >
//                 <ChevronLeft size={16} />
//               </button>
//               <div className="att-date-picker-wrap">
//                 <input
//                   type="date"
//                   value={selectedDate}
//                   onChange={(e) => setSelectedDate(e.target.value)}
//                   className="att-date-input"
//                   id="attendance-date-picker"
//                 />
//                 <span className="att-date-label">
//                   {formatKarachiDate(new Date(`${selectedDate}T12:00:00+05:00`))}
//                 </span>
//               </div>
//               <button
//                 className="icon-btn tiny"
//                 onClick={() => setSelectedDate((d) => addDaysISO(d, 1))}
//                 title="Next Day"
//                 aria-label="Next Day"
//                 id="next-day-btn"
//               >
//                 <ChevronRight size={16} />
//               </button>
//               {selectedDate !== getKarachiTodayISO() && (
//                 <button
//                   className="button secondary tiny"
//                   onClick={() => setSelectedDate(getKarachiTodayISO())}
//                   id="today-btn"
//                 >
//                   Today
//                 </button>
//               )}
//             </div>

//             {/* Shift Selector Filter */}
//             <div className="att-filter-group">
//               <label htmlFor="shift-filter-select" className="att-filter-label">
//                 Shift:
//               </label>
//               <select
//                 id="shift-filter-select"
//                 value={selectedShift}
//                 onChange={(e) => setSelectedShift(e.target.value)}
//                 className="att-select"
//               >
//                 <option value="all">All Shifts</option>
//                 <option value="Shift 1 - Day">Shift 1 - Day (07:00 – 19:00)</option>
//                 <option value="Shift 2 - Night">Shift 2 - Night (19:00 – 07:00)</option>
//               </select>
//             </div>

//             {/* Search Input */}
//             <div className="table-search search att-search-box">
//               <Search size={15} />
//               <input
//                 id="search-daily-staff"
//                 value={searchQuery}
//                 onChange={(e) => setSearchQuery(e.target.value)}
//                 placeholder="Search staff by name or role..."
//               />
//             </div>
//           </div>

//           {/* Bulk Action Buttons Bar (Module 2 Requirement) */}
//           <div className="att-bulk-strip">
//             <div className="att-bulk-left">
//               <span className="att-bulk-hint">
//                 <Info size={14} /> Quick bulk actions for current shift roster:
//               </span>
//             </div>
//             <div className="att-bulk-actions">
//               {/* Module 2: Bulk attendance for all fillers */}
//               <button
//                 className="button primary att-filler-btn"
//                 onClick={handleBulkFillersPresent}
//                 disabled={bulkSaving || savingId !== null}
//                 aria-busy={bulkSaving}
//                 id="bulk-fillers-present-btn"
//                 title="Mark all pump attendants on duty as Present"
//               >
//                 <Zap size={16} />
//                 <span>Mark All Fillers Present ({fillerCount})</span>
//               </button>

//               <button
//                 className="button secondary"
//                 onClick={handleBulkAllStaffPresent}
//                 disabled={bulkSaving || savingId !== null}
//                 aria-busy={bulkSaving}
//                 id="bulk-all-staff-present-btn"
//               >
//                 <UserCheck size={16} />
//                 <span>Mark All Staff Present</span>
//               </button>
//             </div>
//           </div>

//           {/* Staff Roster Attendance Table */}
//           <div className="table-wrap desktop-table-only" style={{ marginTop: 16 }}>
//             <table className="att-roster-table">
//               <thead>
//                 <tr>
//                   <th>Employee</th>
//                   <th>Designation</th>
//                   <th>Shift</th>
//                   <th style={{ width: 280 }}>Attendance Status</th>
//                   <th>Check-In / Out</th>
//                   <th>Reason / Notes</th>
//                   <th>Source</th>
//                   <th>Action</th>
//                 </tr>
//               </thead>
//               <tbody>
//                 {filteredDailyStaff.map((emp) => {
//                   const record = dailyAttendanceMap.get(String(emp.id));
//                   const currentStatus = record?.status || null;
//                   const isPumpFiller = isFiller(emp.designation);

//                   return (
//                     <tr key={emp.id} className={currentStatus ? 'row-marked' : 'row-unmarked'}>
//                       <td>
//                         <div className="att-emp-cell">
//                           <div className="att-avatar">
//                             {emp.name
//                               .split(' ')
//                               .map((n) => n[0])
//                               .join('')
//                               .slice(0, 2)
//                               .toUpperCase()}
//                           </div>
//                           <div>
//                             <strong className="att-emp-name">{emp.name}</strong>
//                             {isPumpFiller && <span className="att-filler-tag">Filler</span>}
//                           </div>
//                         </div>
//                       </td>

//                       <td>
//                         <span className="att-designation-text">{emp.designation}</span>
//                       </td>

//                       <td>
//                         <span className="att-shift-badge">{emp.shiftName || 'Shift 1 - Day'}</span>
//                       </td>

//                       {/* Interactive Status Pill Buttons */}
//                       <td>
//                         <div className="att-status-buttons" role="group" aria-label="Mark Attendance Status">
//                           <button
//                             type="button"
//                             className={`att-status-btn present ${currentStatus === 'Present' ? 'active' : ''}`}
//                             onClick={() => handleMarkAttendance(emp, 'Present')}
//                             disabled={savingId !== null || bulkSaving}
//                             title="Mark Present"
//                             aria-label={`Mark ${emp.name} Present`}
//                           >
//                             <CheckCircle2 size={14} />
//                             <span>Present</span>
//                           </button>

//                           <button
//                             type="button"
//                             className={`att-status-btn absent ${currentStatus === 'Absent' ? 'active' : ''}`}
//                             onClick={() => handleMarkAttendance(emp, 'Absent')}
//                             disabled={savingId !== null || bulkSaving}
//                             title="Mark Absent"
//                             aria-label={`Mark ${emp.name} Absent`}
//                           >
//                             <XCircle size={14} />
//                             <span>Absent</span>
//                           </button>

//                           <button
//                             type="button"
//                             className={`att-status-btn leave ${currentStatus === 'Leave' ? 'active' : ''}`}
//                             onClick={() => handleMarkAttendance(emp, 'Leave')}
//                             disabled={savingId !== null || bulkSaving}
//                             title="Mark On Leave"
//                             aria-label={`Mark ${emp.name} On Leave`}
//                           >
//                             <Clock size={14} />
//                             <span>Leave</span>
//                           </button>
//                         </div>
//                       </td>

//                       {/* Timings */}
//                       <td>
//                         {currentStatus === 'Present' ? (
//                           <div className="att-time-inputs">
//                             <input
//                               type="time"
//                               className="att-time-field"
//                               value={record?.checkInTime || '07:00'}
//                               onChange={(e) => handleUpdateRecordDetails(emp, 'checkInTime', e.target.value)}
//                               title="Check-in Time"
//                             />
//                             <span>-</span>
//                             <input
//                               type="time"
//                               className="att-time-field"
//                               value={record?.checkOutTime || '19:00'}
//                               onChange={(e) => handleUpdateRecordDetails(emp, 'checkOutTime', e.target.value)}
//                               title="Check-out Time"
//                             />
//                           </div>
//                         ) : (
//                           <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>
//                         )}
//                       </td>

//                       {/* Reason / Notes */}
//                       <td>
//                         <input
//                           className="att-notes-input"
//                           placeholder={currentStatus === 'Leave' ? 'Reason for leave...' : 'Notes...'}
//                           defaultValue={record?.notes || ''}
//                           onBlur={(e) => handleUpdateRecordDetails(emp, 'notes', e.target.value)}
//                         />
//                       </td>

//                       {/* Source */}
//                       <td>
//                         <span
//                           className="att-source-pill"
//                           title="Designed for Manual & Biometric sync"
//                         >
//                           {record?.attendanceSource || 'Manual'}
//                         </span>
//                       </td>

//                       {/* Module 4: Edit & Correction Action */}
//                       <td>
//                         {record ? (
//                           <button
//                             type="button"
//                             className="button secondary tiny"
//                             onClick={() =>
//                               setCorrectionTarget({
//                                 ...record,
//                                 employeeId: emp.id,
//                                 employeeName: emp.name,
//                                 designation: emp.designation,
//                                 shiftName: emp.shiftName,
//                                 date: selectedDate,
//                               })
//                             }
//                             title="Attendance Correction with Audit Trail"
//                           >
//                             <FileEdit size={12} />
//                             <span>Correct</span>
//                           </button>
//                         ) : (
//                           <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>
//                         )}
//                       </td>
//                     </tr>
//                   );
//                 })}
//               </tbody>
//             </table>
//           </div>

//           {/* Mobile Card Roster */}
//           <div className="mobile-cards-only" style={{ marginTop: 14 }}>
//             {filteredDailyStaff.map((emp) => {
//               const record = dailyAttendanceMap.get(String(emp.id));
//               const currentStatus = record?.status || null;

//               return (
//                 <div key={emp.id} className="mobile-record-card att-mobile-card">
//                   <div className="mobile-record-header">
//                     <div>
//                       <strong className="row-title">{emp.name}</strong>
//                       <small style={{ display: 'block', color: 'var(--muted)' }}>
//                         {emp.designation} • {emp.shiftName}
//                       </small>
//                     </div>
//                     {currentStatus ? (
//                       <span className={`att-status-pill ${currentStatus.toLowerCase()}`}>
//                         {currentStatus}
//                       </span>
//                     ) : (
//                       <span className="att-status-pill neutral">Not marked</span>
//                     )}
//                   </div>

//                   <div className="mobile-record-body" style={{ marginTop: 10 }}>
//                     <div className="att-status-buttons" style={{ width: '100%' }}>
//                       <button
//                         type="button"
//                         className={`att-status-btn present ${currentStatus === 'Present' ? 'active' : ''}`}
//                         onClick={() => handleMarkAttendance(emp, 'Present')}
//                       >
//                         <CheckCircle2 size={14} /> Present
//                       </button>
//                       <button
//                         type="button"
//                         className={`att-status-btn absent ${currentStatus === 'Absent' ? 'active' : ''}`}
//                         onClick={() => handleMarkAttendance(emp, 'Absent')}
//                       >
//                         <XCircle size={14} /> Absent
//                       </button>
//                       <button
//                         type="button"
//                         className={`att-status-btn leave ${currentStatus === 'Leave' ? 'active' : ''}`}
//                         onClick={() => handleMarkAttendance(emp, 'Leave')}
//                       >
//                         <Clock size={14} /> Leave
//                       </button>
//                     </div>

//                     {record && (
//                       <button
//                         type="button"
//                         className="button secondary tiny"
//                         onClick={() =>
//                           setCorrectionTarget({
//                             ...record,
//                             employeeId: emp.id,
//                             employeeName: emp.name,
//                             designation: emp.designation,
//                             shiftName: emp.shiftName,
//                             date: selectedDate,
//                           })
//                         }
//                         style={{ marginTop: 8, width: '100%', justifyContent: 'center' }}
//                       >
//                         <FileEdit size={12} /> Correct with Audit Log
//                       </button>
//                     )}
//                   </div>
//                 </div>
//               );
//             })}
//           </div>

//           {!filteredDailyStaff.length && (
//             <p className="empty-state">No staff members match the selected shift or search query.</p>
//           )}
//         </div>
//       )}

//       {/* ========================================================================= */}
//       {/* TAB 2: ATTENDANCE HISTORY & LOG (MODULE 3) */}
//       {/* ========================================================================= */}
//       {activeTab === 'history' && (
//         <div className="att-main-card card">
//           {/* History Filters */}
//           <div className="att-controls-bar">
//             <div className="att-filter-group">
//               <label className="att-filter-label">Range:</label>
//               <select
//                 value={historyRange}
//                 onChange={(e) => {
//                   const val = e.target.value;
//                   setHistoryRange(val);
//                   const today = getKarachiTodayISO();
//                   if (val === 'today') {
//                     setHistoryStartDate(today);
//                     setHistoryEndDate(today);
//                   } else if (val === 'week') {
//                     setHistoryStartDate(addDaysISO(today, -7));
//                     setHistoryEndDate(today);
//                   } else if (val === 'month') {
//                     setHistoryStartDate(addDaysISO(today, -30));
//                     setHistoryEndDate(today);
//                   }
//                 }}
//                 className="att-select"
//               >
//                 <option value="month">Last 30 Days</option>
//                 <option value="week">Last 7 Days</option>
//                 <option value="today">Today Only</option>
//                 <option value="custom">Custom Date Range</option>
//               </select>
//             </div>

//             {historyRange === 'custom' && (
//               <div className="att-date-range-inputs">
//                 <input
//                   type="date"
//                   value={historyStartDate}
//                   onChange={(e) => setHistoryStartDate(e.target.value)}
//                   className="att-date-input"
//                 />
//                 <span>to</span>
//                 <input
//                   type="date"
//                   value={historyEndDate}
//                   onChange={(e) => setHistoryEndDate(e.target.value)}
//                   className="att-date-input"
//                 />
//               </div>
//             )}

//             <div className="att-filter-group">
//               <label className="att-filter-label">Status:</label>
//               <select
//                 value={historyStatusFilter}
//                 onChange={(e) => setHistoryStatusFilter(e.target.value)}
//                 className="att-select"
//               >
//                 <option value="all">All Statuses</option>
//                 <option value="Present">Present Only</option>
//                 <option value="Leave">Leave Only</option>
//                 <option value="Absent">Absent Only</option>
//               </select>
//             </div>

//             <div className="att-filter-group">
//               <label className="att-filter-label">Shift:</label>
//               <select
//                 value={selectedShift}
//                 onChange={(e) => setSelectedShift(e.target.value)}
//                 className="att-select"
//               >
//                 <option value="all">All Shifts</option>
//                 <option value="Shift 1 - Day">Shift 1 - Day</option>
//                 <option value="Shift 2 - Night">Shift 2 - Night</option>
//               </select>
//             </div>

//             <div className="table-search search att-search-box">
//               <Search size={15} />
//               <input
//                 value={searchQuery}
//                 onChange={(e) => setSearchQuery(e.target.value)}
//                 placeholder="Search history records..."
//               />
//             </div>
//           </div>

//           {/* History Records Table */}
//           <div className="table-wrap desktop-table-only" style={{ marginTop: 16 }}>
//             <table className="att-history-log-table">
//               <thead>
//                 <tr>
//                   <th>Date</th>
//                   <th>Employee</th>
//                   <th>Designation</th>
//                   <th>Shift</th>
//                   <th>Status</th>
//                   <th>Times</th>
//                   <th>Source</th>
//                   <th>Notes</th>
//                   <th>Action</th>
//                 </tr>
//               </thead>
//               <tbody>
//                 {filteredHistoryRecords.map((r, i) => (
//                   <tr key={r.id || `${r.date}-${r.employeeId}-${i}`}>
//                     <td>
//                       <strong>{formatKarachiDate(new Date(`${r.date}T12:00:00+05:00`))}</strong>
//                       <small style={{ display: 'block', color: 'var(--muted)', fontSize: 11 }}>
//                         {r.date}
//                       </small>
//                     </td>
//                     <td>
//                       <strong>{r.employeeName}</strong>
//                     </td>
//                     <td>{r.designation}</td>
//                     <td>
//                       <span className="att-shift-badge">{r.shiftName || 'Shift 1 - Day'}</span>
//                     </td>
//                     <td>
//                       <span className={`att-status-pill ${r.status.toLowerCase()}`}>
//                         {r.status === 'Present' && <CheckCircle2 size={13} />}
//                         {r.status === 'Absent' && <XCircle size={13} />}
//                         {r.status === 'Leave' && <Clock size={13} />}
//                         {r.status}
//                       </span>
//                     </td>
//                     <td>
//                       {r.checkInTime || r.checkOutTime ? (
//                         <small style={{ fontFamily: 'monospace' }}>
//                           {r.checkInTime || '--:--'} - {r.checkOutTime || '--:--'}
//                         </small>
//                       ) : (
//                         <span style={{ color: 'var(--muted)' }}>—</span>
//                       )}
//                     </td>
//                     <td>
//                       <span className="att-source-pill">{r.attendanceSource || 'Manual'}</span>
//                     </td>
//                     <td>
//                       <span className="att-notes-text">{r.notes || '—'}</span>
//                     </td>
//                     <td>
//                       <div style={{ display: 'flex', gap: 6 }}>
//                         <button
//                           className="button secondary tiny"
//                           onClick={() => {
//                             const staff = staffList.find(
//                               (s) => String(s.id) === String(r.employeeId) || s.name === r.employeeName,
//                             );
//                             setHistoryEmployeeModal(staff || { name: r.employeeName, designation: r.designation, shiftName: r.shiftName });
//                           }}
//                         >
//                           View
//                         </button>
//                         <button
//                           className="button secondary tiny"
//                           onClick={() => setCorrectionTarget(r)}
//                           title="Edit Attendance with Mandatory Reason & Audit Log"
//                         >
//                           <FileEdit size={12} />
//                           <span>Correct</span>
//                         </button>
//                       </div>
//                     </td>
//                   </tr>
//                 ))}
//               </tbody>
//             </table>
//           </div>

//           {/* Mobile Cards for History */}
//           <div className="mobile-cards-only" style={{ marginTop: 14 }}>
//             {filteredHistoryRecords.map((r, i) => (
//               <div key={r.id || `${r.date}-${r.employeeId}-${i}`} className="mobile-record-card">
//                 <div className="mobile-record-header">
//                   <div>
//                     <strong className="row-title">{r.employeeName}</strong>
//                     <small style={{ display: 'block', color: 'var(--muted)' }}>
//                       {formatKarachiDate(new Date(`${r.date}T12:00:00+05:00`))} • {r.shiftName}
//                     </small>
//                   </div>
//                   <span className={`att-status-pill ${r.status.toLowerCase()}`}>{r.status}</span>
//                 </div>
//                 {r.notes && (
//                   <p style={{ margin: '8px 0 0 0', fontSize: 12, color: 'var(--muted)' }}>
//                     Note: {r.notes}
//                   </p>
//                 )}
//                 <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
//                   <button
//                     type="button"
//                     className="button secondary tiny"
//                     onClick={() => {
//                       const staff = staffList.find(
//                         (s) => String(s.id) === String(r.employeeId) || s.name === r.employeeName,
//                       );
//                       setHistoryEmployeeModal(staff || { name: r.employeeName, designation: r.designation, shiftName: r.shiftName });
//                     }}
//                   >
//                     View
//                   </button>
//                   <button
//                     type="button"
//                     className="button secondary tiny"
//                     onClick={() => setCorrectionTarget(r)}
//                   >
//                     <FileEdit size={12} /> Correct
//                   </button>
//                 </div>
//               </div>
//             ))}
//           </div>

//           {!filteredHistoryRecords.length && (
//             <p className="empty-state">No attendance records found for the selected filter range.</p>
//           )}
//         </div>
//       )}

//       {/* ========================================================================= */}
//       {/* TAB 3: MONTHLY ATTENDANCE REGISTER & SUMMARY (MODULE 3 & PAYROLL BASE) */}
//       {/* ========================================================================= */}
//       {activeTab === 'monthly' && (
//         <div className="att-main-card card">
//           {/* Month Selector & Export Bar */}
//           <div className="att-controls-bar">
//             <div className="att-filter-group">
//               <label className="att-filter-label">Month:</label>
//               <input
//                 type="month"
//                 value={selectedMonth}
//                 onChange={(e) => setSelectedMonth(e.target.value)}
//                 className="att-month-input"
//                 id="monthly-register-month-picker"
//               />
//             </div>

//             <div className="att-filter-group">
//               <label className="att-filter-label">Shift:</label>
//               <select
//                 value={selectedShift}
//                 onChange={(e) => setSelectedShift(e.target.value)}
//                 className="att-select"
//               >
//                 <option value="all">All Shifts</option>
//                 <option value="Shift 1 - Day">Shift 1 - Day</option>
//                 <option value="Shift 2 - Night">Shift 2 - Night</option>
//               </select>
//             </div>

//             <div className="table-search search att-search-box">
//               <Search size={15} />
//               <input
//                 value={searchQuery}
//                 onChange={(e) => setSearchQuery(e.target.value)}
//                 placeholder="Search employee or role..."
//               />
//             </div>

//             <div style={{ marginLeft: 'auto' }}>
//               <button
//                 className="button primary"
//                 onClick={handleExportCsv}
//                 id="export-attendance-csv-btn"
//               >
//                 <Download size={15} />
//                 <span>Export CSV</span>
//               </button>
//             </div>
//           </div>

//           {/* Monthly Table with Module 5 & 6 Integrated Payroll Calculations */}
//           <div className="table-wrap desktop-table-only" style={{ marginTop: 16 }}>
//             <table className="att-monthly-table">
//               <thead>
//                 <tr>
//                   <th>Employee</th>
//                   <th>Role</th>
//                   <th>Shift</th>
//                   <th>Days (P / L / A)</th>
//                   <th>Attendance %</th>
//                   <th>Monthly Salary</th>
//                   <th>Daily Rate (÷30)</th>
//                   <th>Rule Impact</th>
//                   <th>Net Est. Salary</th>
//                   <th>Actions</th>
//                 </tr>
//               </thead>
//               <tbody>
//                 {monthlySummary
//                   .filter((emp) => {
//                     if (selectedShift !== 'all') {
//                       const empShift = (emp.shift || '').toLowerCase();
//                       if (!empShift.includes(selectedShift.toLowerCase()) && !empShift.includes('general')) {
//                         return false;
//                       }
//                     }
//                     if (searchQuery) {
//                       const q = searchQuery.toLowerCase();
//                       if (!emp.name.toLowerCase().includes(q) && !emp.designation.toLowerCase().includes(q)) {
//                         return false;
//                       }
//                     }
//                     return true;
//                   })
//                   .map((emp) => {
//                     const staff = staffList.find(
//                       (s) => String(s.id) === String(emp.employeeId) || s.name === emp.name,
//                     );
//                     const monthlySalary = staff?.monthlySalary || emp.monthlySalary || 35000;
//                     const salaryCalc = calculateEmployeeSalary({
//                       monthlySalary,
//                       leaveDays: emp.leaveDays,
//                       absentDays: emp.absentDays,
//                       workingDaysBasis: 30,
//                     });

//                     return (
//                       <tr key={emp.employeeId}>
//                         <td>
//                           <strong className="att-emp-name">{emp.name}</strong>
//                         </td>
//                         <td>{emp.designation}</td>
//                         <td>
//                           <span className="att-shift-badge">{emp.shift}</span>
//                         </td>
//                         <td>
//                           <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5 }}>
//                             <span style={{ color: 'var(--green)', fontWeight: 700 }} title="Present Days">
//                               {emp.presentDays}P
//                             </span>
//                             <span style={{ color: 'var(--line)' }}>/</span>
//                             <span style={{ color: emp.leaveDays > 0 ? '#d97706' : 'var(--muted)', fontWeight: 700 }} title="Leave Days">
//                               {emp.leaveDays}L
//                             </span>
//                             <span style={{ color: 'var(--line)' }}>/</span>
//                             <span style={{ color: emp.absentDays > 0 ? 'var(--red)' : 'var(--muted)', fontWeight: 700 }} title="Absent Days">
//                               {emp.absentDays}A
//                             </span>
//                           </div>
//                         </td>
//                         <td>
//                           <div className="att-rate-cell">
//                             <span className="att-rate-num">{emp.attendanceRate}%</span>
//                             <div className="att-rate-bar">
//                               <div
//                                 className="att-rate-bar-fill"
//                                 style={{ width: `${Math.min(100, emp.attendanceRate)}%` }}
//                               />
//                             </div>
//                           </div>
//                         </td>

//                         {/* Module 5: Monthly Salary */}
//                         <td>
//                           <div className="att-salary-cell">
//                             <span className="att-salary-num">{formatPKR(salaryCalc.monthlySalary)}</span>
//                             <small className="att-salary-sub">Base Config</small>
//                           </div>
//                         </td>

//                         {/* Module 5: Daily Rate (Monthly ÷ 30) */}
//                         <td>
//                           <div className="att-salary-cell">
//                             <span className="att-salary-num">{formatPKR(salaryCalc.dailySalary)}</span>
//                             <small className="att-salary-sub">PKR / day</small>
//                           </div>
//                         </td>

//                         {/* Module 6: Bonus / Deduction Rule Impact */}
//                         <td>
//                           {salaryCalc.isPerfectAttendance ? (
//                             <span className="att-impact-tag bonus" title="Perfect Attendance Rule: Monthly + Daily Salary">
//                               <Award size={11} /> +{formatPKR(salaryCalc.perfectAttendanceBonus)} Bonus
//                             </span>
//                           ) : salaryCalc.leaveDeduction > 0 ? (
//                             <span className="att-impact-tag deduct" title={`Leave Rule: Monthly - (${emp.leaveDays} × Daily Salary)`}>
//                               -{formatPKR(salaryCalc.leaveDeduction)} ({emp.leaveDays} leaves)
//                             </span>
//                           ) : salaryCalc.absentDeduction > 0 ? (
//                             <span className="att-impact-tag deduct" title={`Absent Rule: Monthly - (${emp.absentDays} × Daily Salary)`}>
//                               -{formatPKR(salaryCalc.absentDeduction)} ({emp.absentDays} absents)
//                             </span>
//                           ) : (
//                             <span className="att-impact-tag neutral">Standard</span>
//                           )}
//                         </td>

//                         {/* Module 6: Net Calculated Take-Home Salary */}
//                         <td>
//                           <strong
//                             style={{
//                               fontSize: 13.5,
//                               color: salaryCalc.isPerfectAttendance ? 'var(--green)' : 'var(--ink)',
//                             }}
//                           >
//                             {formatPKR(salaryCalc.netSalary)}
//                           </strong>
//                         </td>

//                         {/* Actions */}
//                         <td>
//                           <div style={{ display: 'flex', gap: 6 }}>
//                             <button
//                               className="button secondary tiny"
//                               onClick={() => {
//                                 setHistoryEmployeeModal(staff || emp);
//                               }}
//                               title="View individual attendance history timeline"
//                             >
//                               History
//                             </button>
//                             <button
//                               className="button secondary tiny"
//                               onClick={() => handleOpenSlipFromMonthly(emp, salaryCalc)}
//                               title="View & Print official Salary Slip"
//                               id={`btn-slip-${emp.employeeId}`}
//                             >
//                               <FileText size={11} /> Slip
//                             </button>
//                             <button
//                               className="button primary tiny"
//                               onClick={() => {
//                                 setCalculatorTargetEmployee({
//                                   ...(staff || {}),
//                                   id: emp.employeeId,
//                                   name: emp.name,
//                                   designation: emp.designation,
//                                   monthlySalary,
//                                   leaveDays: emp.leaveDays,
//                                   absentDays: emp.absentDays,
//                                 });
//                                 setSalaryEngineOpen(true);
//                               }}
//                               title="Test Salary Engine with live calculations"
//                             >
//                               <Calculator size={11} /> Test Rule
//                             </button>
//                           </div>
//                         </td>
//                       </tr>
//                     );
//                   })}
//               </tbody>
//             </table>
//           </div>

//           {/* Mobile view for Monthly Register */}
//           <div className="mobile-cards-only" style={{ marginTop: 14 }}>
//             {monthlySummary.map((emp) => {
//               const staff = staffList.find(
//                 (s) => String(s.id) === String(emp.employeeId) || s.name === emp.name,
//               );
//               const monthlySalary = staff?.monthlySalary || emp.monthlySalary || 35000;
//               const salaryCalc = calculateEmployeeSalary({
//                 monthlySalary,
//                 leaveDays: emp.leaveDays,
//                 absentDays: emp.absentDays,
//                 workingDaysBasis: 30,
//               });

//               return (
//                 <div key={emp.employeeId} className="mobile-record-card">
//                   <div className="mobile-record-header">
//                     <div>
//                       <strong className="row-title">{emp.name}</strong>
//                       <small style={{ display: 'block', color: 'var(--muted)' }}>
//                         {emp.designation} • {emp.shift}
//                       </small>
//                     </div>
//                     {salaryCalc.isPerfectAttendance ? (
//                       <span className="perfect-star-badge">
//                         <Award size={12} /> ⭐ Perfect
//                       </span>
//                     ) : (
//                       <span className="att-status-pill neutral">{emp.attendanceRate}% Rate</span>
//                     )}
//                   </div>
//                   <div className="mobile-record-body" style={{ marginTop: 8 }}>
//                     <div className="mobile-record-field">
//                       <span>Attendance:</span>
//                       <b>
//                         <span style={{ color: 'var(--green)' }}>{emp.presentDays}P</span> /{' '}
//                         <span style={{ color: '#d97706' }}>{emp.leaveDays}L</span> /{' '}
//                         <span style={{ color: 'var(--red)' }}>{emp.absentDays}A</span>
//                       </b>
//                     </div>
//                     <div className="mobile-record-field">
//                       <span>Base Salary:</span>
//                       <b>{formatPKR(salaryCalc.monthlySalary)}</b>
//                     </div>
//                     <div className="mobile-record-field">
//                       <span>Rule Impact:</span>
//                       {salaryCalc.isPerfectAttendance ? (
//                         <b style={{ color: 'var(--green)' }}>+{formatPKR(salaryCalc.perfectAttendanceBonus)} (Bonus)</b>
//                       ) : salaryCalc.leaveDeduction > 0 ? (
//                         <b style={{ color: '#dc2626' }}>-{formatPKR(salaryCalc.leaveDeduction)}</b>
//                       ) : (
//                         <span>Standard</span>
//                       )}
//                     </div>
//                     <div className="mobile-record-field">
//                       <span>Net Salary:</span>
//                       <b style={{ color: salaryCalc.isPerfectAttendance ? 'var(--green)' : 'var(--ink)' }}>
//                         {formatPKR(salaryCalc.netSalary)}
//                       </b>
//                     </div>
//                   </div>
//                   <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
//                     <button
//                       type="button"
//                       className="button secondary tiny"
//                       onClick={() => setHistoryEmployeeModal(staff || emp)}
//                     >
//                       History
//                     </button>
//                     <button
//                       type="button"
//                       className="button secondary tiny"
//                       onClick={() => handleOpenSlipFromMonthly(emp, salaryCalc)}
//                       title="View Salary Slip"
//                     >
//                       <FileText size={11} /> Slip
//                     </button>
//                     <button
//                       type="button"
//                       className="button primary tiny"
//                       onClick={() => {
//                         setCalculatorTargetEmployee({
//                           ...(staff || {}),
//                           id: emp.employeeId,
//                           name: emp.name,
//                           designation: emp.designation,
//                           monthlySalary,
//                           leaveDays: emp.leaveDays,
//                           absentDays: emp.absentDays,
//                         });
//                         setSalaryEngineOpen(true);
//                       }}
//                     >
//                       <Calculator size={11} /> Test Rule
//                     </button>
//                   </div>
//                 </div>
//               );
//             })}
//           </div>
//         </div>
//       )}

//       {/* Employee Individual History Drilldown Modal */}
//       {historyEmployeeModal && (
//         <EmployeeHistoryModal
//           employee={historyEmployeeModal}
//           records={attendanceRecords}
//           onClose={() => setHistoryEmployeeModal(null)}
//         />
//       )}

//       {/* Module 4: Attendance Correction Modal */}
//       {correctionTarget && (
//         <AttendanceCorrectionModal
//           record={correctionTarget}
//           employee={staffList.find(
//             (s) =>
//               String(s.id) === String(correctionTarget.employeeId) ||
//               s.name === correctionTarget.employeeName,
//           )}
//           auditHistory={auditLogs.filter(
//             (a) =>
//               String(a.employeeId) === String(correctionTarget.employeeId) ||
//               a.employeeName === correctionTarget.employeeName,
//           )}
//           currentUserName="Station Manager"
//           onClose={() => setCorrectionTarget(null)}
//           onSaveCorrection={handleSaveCorrection}
//         />
//       )}

//       {/* Module 4: Attendance Audit Trail Modal */}
//       {auditTrailOpen && (
//         <AttendanceAuditTrailModal
//           auditLogs={auditLogs}
//           onClose={() => setAuditTrailOpen(false)}
//         />
//       )}

//       {/* Module 5 & 6: Salary Configuration & Live Payroll Calculator Modal */}
//       {salaryEngineOpen && (
//         <SalaryConfigAndCalculatorModal
//           staffList={staffList}
//           initialEmployee={calculatorTargetEmployee}
//           onClose={() => {
//             setSalaryEngineOpen(false);
//             setCalculatorTargetEmployee(null);
//           }}
//         />
//       )}

//       {/* Module 10: Salary Slip & Official Voucher Modal */}
//       {payslipModalData && (
//         <PayslipModal
//           record={payslipModalData}
//           detail={payslipModalData}
//           onClose={() => setPayslipModalData(null)}
//         />
//       )}
//     </div>
//   );
// }
////////////============from here
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  CalendarCheck,
  Calendar,
  Clock,
  UserCheck,
  Users,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RotateCcw,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Download,
  Award,
  Zap,
  Info,
  Layers,
  History,
  FileSpreadsheet,
  FileEdit,
  ShieldCheck,
  Calculator,
  Banknote,
  FileText,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useTanks } from '../../hooks/useTanks';
import {
  getKarachiTodayISO,
  formatKarachiDate,
  addDaysISO,
  KARACHI_SHIFTS,
} from '../../dateUtils';
import {
  isFiller,
  calculateAttendanceStats,
  calculateMonthlyAttendanceSummary,
  filterAttendanceRecords,
  prepareBulkFillerAttendance,
  exportAttendanceToCsv,
} from '../../utils/attendance';
import { calculateEmployeeSalary, calculateDailySalary } from '../../utils/payrollEngine';
import { formatPKR } from '../../utils/formatters';
import EmployeeHistoryModal from './EmployeeHistoryModal';
import AttendanceCorrectionModal from './AttendanceCorrectionModal';
import AttendanceAuditTrailModal from './AttendanceAuditTrailModal';
import SalaryConfigAndCalculatorModal from '../payroll/SalaryConfigAndCalculatorModal';
import PayslipModal from '../payroll/PayslipModal';
import { payrollApi } from '../../services/payrollService';

export default function AttendancePage({ notify, onNavigate }) {
  const { t } = useLanguage();
  const { api } = useTanks();

  // Active view tab: 'daily' (Module 2), 'history' (Module 3), 'monthly' (Module 3)
  const [activeTab, setActiveTab] = useState('daily');

  // Daily Screen State
  const [selectedDate, setSelectedDate] = useState(() => getKarachiTodayISO());
  const [selectedShift, setSelectedShift] = useState('all'); // 'all', 'Shift 1 - Day', 'Shift 2 - Night'
  const [searchQuery, setSearchQuery] = useState('');
  const [staffList, setStaffList] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  // Synchronous in-flight lock: state updates are async, so two fast clicks could both pass a state check.
  const inFlightRef = useRef(false);
  const errorText = (err, fallback) => (err && err.message ? `${fallback}: ${err.message}` : fallback);

  // History Tab Filters
  const [historyRange, setHistoryRange] = useState('month'); // 'today', 'week', 'month', 'custom'
  const [historyStartDate, setHistoryStartDate] = useState(() => addDaysISO(getKarachiTodayISO(), -30));
  const [historyEndDate, setHistoryEndDate] = useState(() => getKarachiTodayISO());
  const [historyStatusFilter, setHistoryStatusFilter] = useState('all');

  // Monthly Register State
  const [selectedMonth, setSelectedMonth] = useState(() => getKarachiTodayISO().slice(0, 7)); // YYYY-MM
  const [historyEmployeeModal, setHistoryEmployeeModal] = useState(null);

  // Module 4: Audit & Correction State
  const [auditLogs, setAuditLogs] = useState([]);
  const [correctionTarget, setCorrectionTarget] = useState(null);
  const [auditTrailOpen, setAuditTrailOpen] = useState(false);

  // Module 5 & 6: Salary Engine Modal State
  const [salaryEngineOpen, setSalaryEngineOpen] = useState(false);
  const [calculatorTargetEmployee, setCalculatorTargetEmployee] = useState(null);

  // Module 10: Salary Slip Modal State from Attendance
  const [payslipModalData, setPayslipModalData] = useState(null);

  // 1. Fetch Staff Roster & Attendance
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      let roster = [];
      if (api?.getStaffRoster) {
        roster = await api.getStaffRoster();
      } else if (api?.getEmployees) {
        // Fallback if getStaffRoster not present
        const raw = await api.getEmployees();
        roster = raw.map((r, i) => ({
          id: `emp-${i + 1}`,
          name: r[0],
          designation: r[1],
          shiftName: r[2] || 'Shift 1 - Day',
          shiftId: null, // placeholder ids are not database uuids
          active: r[3] === 'Active',
          monthlySalary: Number(String(r[4]).replace(/[^0-9]/g, '')) || 35000,
        }));
      }
      setStaffList(roster);

      if (api?.getAttendance) {
        const records = await api.getAttendance();
        setAttendanceRecords(records || []);
      }

      if (api?.getAttendanceAuditLog) {
        const logs = await api.getAttendanceAuditLog();
        setAuditLogs(logs || []);
      }
    } catch (err) {
      console.warn('Error loading attendance data:', err);
      if (notify) notify('Failed to load attendance records', 'error');
    } finally {
      setLoading(false);
    }
  }, [api, notify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Daily records map: key = employeeId
  const dailyAttendanceMap = useMemo(() => {
    const map = new Map();
    for (const r of attendanceRecords) {
      if (r.date === selectedDate) {
        map.set(String(r.employeeId || r.employee_id), r);
      }
    }
    return map;
  }, [attendanceRecords, selectedDate]);

  // Filtered staff for the Daily View
  const filteredDailyStaff = useMemo(() => {
    return staffList.filter((emp) => {
      // Shift filter
      if (selectedShift !== 'all') {
        const empShift = (emp.shiftName || '').toLowerCase();
        const filterShift = selectedShift.toLowerCase();
        if (!empShift.includes(filterShift) && !empShift.includes('general')) {
          return false;
        }
      }
      // Search query
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const name = (emp.name || '').toLowerCase();
        const desig = (emp.designation || '').toLowerCase();
        if (!name.includes(q) && !desig.includes(q)) return false;
      }
      return true;
    });
  }, [staffList, selectedShift, searchQuery]);

  // Fillers count in current daily filtered list
  const fillerCount = useMemo(() => {
    return filteredDailyStaff.filter((emp) => isFiller(emp.designation)).length;
  }, [filteredDailyStaff]);

  // Daily Attendance Stats
  const dailyStats = useMemo(() => {
    const dayRecords = attendanceRecords.filter((r) => r.date === selectedDate);
    return calculateAttendanceStats(dayRecords, staffList.length);
  }, [attendanceRecords, selectedDate, staffList.length]);

  // Monthly Summary Data (Module 3)
  const monthlySummary = useMemo(() => {
    // Filter records for selected month (YYYY-MM)
    const monthRecords = attendanceRecords.filter((r) => r.date && r.date.startsWith(selectedMonth));
    const [year, month] = selectedMonth.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    return calculateMonthlyAttendanceSummary(monthRecords, staffList, daysInMonth);
  }, [attendanceRecords, staffList, selectedMonth]);

  // Monthly Overview Stats
  const monthlyStats = useMemo(() => {
    const totalWorkingDays = monthlySummary[0]?.totalWorkingDays || 30;
    const totalStaff = monthlySummary.length;
    const perfectCount = monthlySummary.filter((s) => s.isPerfectAttendance).length;
    const totalLeaves = monthlySummary.reduce((sum, s) => sum + s.leaveDays, 0);
    const avgRate =
      totalStaff > 0
        ? Math.round(monthlySummary.reduce((sum, s) => sum + s.attendanceRate, 0) / totalStaff)
        : 0;

    return { totalWorkingDays, totalStaff, perfectCount, totalLeaves, avgRate };
  }, [monthlySummary]);

  // History Tab Filtered Records
  const filteredHistoryRecords = useMemo(() => {
    return filterAttendanceRecords(attendanceRecords, {
      search: searchQuery,
      shift: selectedShift,
      status: historyStatusFilter,
      startDate: historyStartDate,
      endDate: historyEndDate,
    });
  }, [attendanceRecords, searchQuery, selectedShift, historyStatusFilter, historyStartDate, historyEndDate]);

  // Handler: Single Mark Attendance (Upsert)
  const handleMarkAttendance = async (employee, status) => {
    if (inFlightRef.current) return; // a save is already running
    inFlightRef.current = true;
    setSavingId(employee.id);
    const current = dailyAttendanceMap.get(String(employee.id));
    const shift = employee.shiftName || 'Shift 1 - Day';
    const isNight = shift.includes('Night');

    const payload = {
      employeeId: employee.id,
      date: selectedDate,
      shiftId: employee.shiftId || null,
      status,
      notes: current?.notes || (status === 'Leave' ? 'Approved leave' : status === 'Absent' ? 'Unnotified' : 'On-time attendance'),
      checkInTime: status === 'Present' ? (isNight ? '19:00' : '07:00') : null,
      checkOutTime: status === 'Present' ? (isNight ? '07:00' : '19:00') : null,
      attendanceSource: 'Manual',
    };

    try {
      if (api?.markAttendance) {
        const saved = await api.markAttendance(payload);
        setAttendanceRecords((prev) => {
          const idx = prev.findIndex(
            (r) =>
              (String(r.employeeId || r.employee_id) === String(employee.id) || r.employeeName === employee.name) &&
              r.date === selectedDate,
          );
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = { ...next[idx], ...saved };
            return next;
          }
          return [saved, ...prev];
        });
        if (notify) notify(`${employee.name} marked ${status}`);
      } else {
        // Local state fallback
        const mockSaved = {
          ...payload,
          id: `att-${Date.now()}`,
          employeeName: employee.name,
          designation: employee.designation,
          shiftName: employee.shiftName,
        };
        setAttendanceRecords((prev) => [mockSaved, ...prev.filter((r) => !(r.employeeId === employee.id && r.date === selectedDate))]);
        if (notify) notify(`${employee.name} marked ${status} (local)`);
      }
    } catch (err) {
      console.error('Error marking attendance:', err);
      if (notify) notify(errorText(err, 'Failed to record attendance'), 'error');
    } finally {
      inFlightRef.current = false;
      setSavingId(null);
    }
  };

  // Handler: Update Check-in / Notes for an already marked record
  const handleUpdateRecordDetails = async (employee, field, value) => {
    const current = dailyAttendanceMap.get(String(employee.id));
    if (!current) return;
    const updated = {
      ...current,
      employeeId: employee.id,
      [field]: value,
    };
    try {
      if (api?.markAttendance) {
        const saved = await api.markAttendance(updated);
        setAttendanceRecords((prev) => prev.map((r) => (r.id === current.id ? { ...r, ...saved } : r)));
      }
    } catch (err) {
      console.error('Failed to update record details:', err);
      if (notify) notify(errorText(err, 'Failed to update attendance details'), 'error');
    }
  };

  // Handler: Attendance Correction with Audit Trail (Module 4)
  const handleSaveCorrection = async (correctionData) => {
    try {
      if (api?.correctAttendanceRecord) {
        const result = await api.correctAttendanceRecord(correctionData);
        if (result?.record) {
          setAttendanceRecords((prev) => {
            const idx = prev.findIndex(
              (r) =>
                r.id === result.record.id ||
                (String(r.employeeId || r.employee_id) === String(result.record.employeeId) &&
                  r.date === result.record.date),
            );
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = { ...next[idx], ...result.record };
              return next;
            }
            return [result.record, ...prev];
          });
        }
        if (result?.auditEntry) {
          setAuditLogs((prev) => [result.auditEntry, ...prev]);
        }
      } else {
        const auditEntry = {
          id: `audit-${Date.now()}`,
          attendanceId: correctionData.attendanceId,
          employeeId: correctionData.employeeId,
          employeeName: correctionData.employeeName,
          attendanceDate: correctionData.date,
          date: correctionData.date,
          previousStatus: correctionData.previousStatus,
          newStatus: correctionData.newStatus,
          reason: correctionData.reason,
          changedBy: 'mgr-current',
          changedByName: correctionData.changedByName || 'Current Manager',
          createdAt: new Date().toISOString(),
        };
        setAttendanceRecords((prev) =>
          prev.map((r) => {
            if (
              r.id === correctionData.attendanceId ||
              (String(r.employeeId || r.employee_id) === String(correctionData.employeeId) &&
                r.date === correctionData.date)
            ) {
              return {
                ...r,
                status: correctionData.newStatus,
                checkInTime: correctionData.newCheckIn || r.checkInTime,
                checkOutTime: correctionData.newCheckOut || r.checkOutTime,
                lastCorrectedAt: new Date().toISOString(),
                correctionReason: correctionData.reason,
              };
            }
            return r;
          }),
        );
        setAuditLogs((prev) => [auditEntry, ...prev]);
      }

      // Module 11: Auto-recalculate payroll if period has locked or existing finalized payroll
      if (correctionData.recalculatePayroll && correctionData.date) {
        const [y, m] = correctionData.date.split('-').map(Number);
        try {
          await payrollApi.recalculate(
            correctionData.employeeId,
            m,
            y,
            `Attendance correction for ${correctionData.date}: ${correctionData.previousStatus} -> ${correctionData.newStatus} (${correctionData.reason})`,
            correctionData.changedByName || 'Station Manager'
          );
          if (notify) notify(`Payroll automatically recalculated for ${m}/${y}`, 'info');
        } catch (recalcErr) {
          console.warn('Auto payroll recalculate notice:', recalcErr);
        }
      }

      if (notify) notify(`Attendance corrected for ${correctionData.employeeName || 'staff member'}`);
      setCorrectionTarget(null);
    } catch (err) {
      console.warn('Error saving correction:', err);
      if (notify) notify('Failed to save correction', 'error');
    }
  };

  // Handler: Open Payslip from Monthly Register (Module 10)
  const handleOpenSlipFromMonthly = async (emp, salaryCalc) => {
    const [y, m] = selectedMonth.split('-').map(Number);
    try {
      const listRes = await payrollApi.list(m, y);
      const existing = (listRes.rows || []).find((r) => String(r.employeeId) === String(emp.employeeId));
      if (existing) {
        const detail = await payrollApi.get(existing.id);
        setPayslipModalData(detail || existing);
        return;
      }
    } catch (err) {
      console.warn('Notice loading existing payroll record for slip:', err);
    }
    const slipRecord = {
      id: `slip-${emp.employeeId}-${selectedMonth}`,
      employeeId: emp.employeeId,
      employeeName: emp.name,
      designation: emp.designation,
      shiftName: emp.shiftName || 'Day Shift',
      month: m,
      year: y,
      monthlySalary: salaryCalc.monthlySalary,
      dailySalary: salaryCalc.dailySalary,
      daysBasis: salaryCalc.daysBasis || 30,
      presentDays: emp.presentDays,
      absentDays: emp.absentDays,
      leaveDays: emp.leaveDays,
      deductibleDays: emp.leaveDays + (salaryCalc.absentDeduction > 0 ? emp.absentDays : 0),
      deduction: (salaryCalc.leaveDeduction || 0) + (salaryCalc.absentDeduction || 0),
      bonus: salaryCalc.perfectAttendanceBonus || 0,
      finalSalary: salaryCalc.netSalary,
      status: 'APPROVED',
      locked: false,
      balance: salaryCalc.netSalary,
      paidTotal: 0,
      paymentStatus: 'UNPAID',
    };
    setPayslipModalData(slipRecord);
  };

  // Handler: Bulk Mark for All Fillers (Module 2 Requirement)
  const handleBulkFillersPresent = async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setBulkSaving(true);
    const fillerList = filteredDailyStaff.filter((emp) => isFiller(emp.designation));
    if (!fillerList.length) {
      if (notify) notify('No pump attendants found in the selected view', 'warning');
      inFlightRef.current = false;
      setBulkSaving(false);
      return;
    }

    const entries = fillerList.map((emp) => {
      const isNight = (emp.shiftName || '').includes('Night');
      return {
        employeeId: emp.id,
        date: selectedDate,
        shiftId: emp.shiftId,
        shiftName: emp.shiftName,
        status: 'Present',
        notes: 'Bulk filler attendance marked',
        checkInTime: isNight ? '19:00' : '07:00',
        checkOutTime: isNight ? '07:00' : '19:00',
        attendanceSource: 'Manual',
      };
    });

    try {
      if (api?.bulkMarkAttendance) {
        const savedList = await api.bulkMarkAttendance(entries);
        setAttendanceRecords((prev) => {
          // Replace or insert
          const next = [...prev];
          for (const s of savedList) {
            const idx = next.findIndex(
              (r) =>
                (String(r.employeeId || r.employee_id) === String(s.employeeId) || r.employeeName === s.employeeName) &&
                r.date === selectedDate,
            );
            if (idx >= 0) next[idx] = { ...next[idx], ...s };
            else next.unshift(s);
          }
          return next;
        });
        const skippedN = savedList.skippedLocked?.length || 0;
        if (notify) {
          if (skippedN) notify(`Marked ${savedList.length} present. ${skippedN} skipped: salary for this month is already finalized.`, 'warning');
          else notify(`Marked ${savedList.length} fillers present for ${selectedDate}`);
        }
      }
    } catch (err) {
      console.error('Error bulk marking fillers:', err);
      if (notify) notify(errorText(err, 'Failed to bulk mark fillers'), 'error');
    } finally {
      inFlightRef.current = false;
      setBulkSaving(false);
    }
  };

  // Handler: Bulk Mark All Staff in Current Filter Present
  const handleBulkAllStaffPresent = async () => {
    if (!filteredDailyStaff.length || inFlightRef.current) return;
    inFlightRef.current = true;
    setBulkSaving(true);
    const entries = filteredDailyStaff.map((emp) => {
      const isNight = (emp.shiftName || '').includes('Night');
      return {
        employeeId: emp.id,
        date: selectedDate,
        shiftId: emp.shiftId,
        shiftName: emp.shiftName,
        status: 'Present',
        notes: 'Bulk roster attendance marked',
        checkInTime: isNight ? '19:00' : '07:00',
        checkOutTime: isNight ? '07:00' : '19:00',
        attendanceSource: 'Manual',
      };
    });

    try {
      if (api?.bulkMarkAttendance) {
        const savedList = await api.bulkMarkAttendance(entries);
        setAttendanceRecords((prev) => {
          const next = [...prev];
          for (const s of savedList) {
            const idx = next.findIndex(
              (r) =>
                (String(r.employeeId || r.employee_id) === String(s.employeeId) || r.employeeName === s.employeeName) &&
                r.date === selectedDate,
            );
            if (idx >= 0) next[idx] = { ...next[idx], ...s };
            else next.unshift(s);
          }
          return next;
        });
        const skippedN = savedList.skippedLocked?.length || 0;
        if (notify) {
          if (skippedN) notify(`Marked ${savedList.length} present. ${skippedN} skipped: salary for this month is already finalized.`, 'warning');
          else notify(`Marked all ${savedList.length} staff members present!`);
        }
      }
    } catch (err) {
      console.error('Error in bulk all staff:', err);
      if (notify) notify(errorText(err, 'Failed to record bulk attendance'), 'error');
    } finally {
      inFlightRef.current = false;
      setBulkSaving(false);
    }
  };

  // Handler: Export CSV
  const handleExportCsv = () => {
    const csvContent = exportAttendanceToCsv(monthlySummary, selectedMonth);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `FLOW_Attendance_${selectedMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    if (notify) notify(`Exported attendance for ${selectedMonth}`);
  };

  return (
    <div className="attendance-page-container">
      {/* Header and Tab Selector */}
      <div className="att-top-banner">
        <div className="att-title-group">
          <div className="att-icon-badge">
            <CalendarCheck size={26} />
          </div>
          <div>
            <h1>{t('attendance', 'Attendance')}</h1>
            <p>{t('attendance_desc', 'Daily station staff attendance, shifts & monthly history register')}</p>
          </div>
        </div>

        {/* Banner Quick Actions (Module 4 & Module 5/6) */}
        <div className="att-banner-actions">
          <button
            type="button"
            className="button secondary"
            onClick={() => setAuditTrailOpen(true)}
            id="btn-open-audit-trail"
            title="Attendance Correction Audit Trail"
          >
            <ShieldCheck size={16} />
            <span>Audit Trail</span>
            {auditLogs.length > 0 && <span className="att-audit-count-badge">{auditLogs.length}</span>}
          </button>
          <button
            type="button"
            className="button primary"
            onClick={() => {
              setCalculatorTargetEmployee(null);
              setSalaryEngineOpen(true);
            }}
            id="btn-open-salary-engine"
            title="Salary Rules & Payroll Engine"
          >
            <Calculator size={16} />
            <span>Salary Engine</span>
          </button>
        </div>

        {/* Tab Buttons */}
        <div className="att-tabs-nav" role="tablist">
          <button
            id="tab-daily-attendance"
            className={`att-tab-btn ${activeTab === 'daily' ? 'active' : ''}`}
            onClick={() => setActiveTab('daily')}
            role="tab"
            aria-selected={activeTab === 'daily'}
          >
            <Calendar size={16} />
            <span>{t('daily_attendance', 'Daily Attendance')}</span>
          </button>
          <button
            id="tab-attendance-history"
            className={`att-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
            role="tab"
            aria-selected={activeTab === 'history'}
          >
            <History size={16} />
            <span>{t('attendance_history', 'Attendance History')}</span>
          </button>
          <button
            id="tab-monthly-attendance"
            className={`att-tab-btn ${activeTab === 'monthly' ? 'active' : ''}`}
            onClick={() => setActiveTab('monthly')}
            role="tab"
            aria-selected={activeTab === 'monthly'}
          >
            <FileSpreadsheet size={16} />
            <span>{t('monthly_attendance', 'Monthly Register')}</span>
          </button>
        </div>
      </div>

      {/* KPI Overview Strip */}
      <div className="att-kpi-grid">
        {activeTab === 'daily' ? (
          <>
            <div className="att-kpi-card">
              <span className="att-kpi-label">Station Staff</span>
              <strong className="att-kpi-value">{staffList.length}</strong>
              <small className="att-kpi-sub">Total on roster</small>
            </div>
            <div className="att-kpi-card present">
              <span className="att-kpi-label">{t('present', 'Present')}</span>
              <strong className="att-kpi-value" style={{ color: 'var(--green)' }}>
                {dailyStats.present}
              </strong>
              <small className="att-kpi-sub">{dailyStats.attendanceRate}% on duty</small>
            </div>
            <div className="att-kpi-card leave">
              <span className="att-kpi-label">{t('leave', 'On Leave')}</span>
              <strong className="att-kpi-value" style={{ color: '#d97706' }}>
                {dailyStats.leave}
              </strong>
              <small className="att-kpi-sub">Approved leaves</small>
            </div>
            <div className="att-kpi-card absent">
              <span className="att-kpi-label">{t('absent', 'Absent')}</span>
              <strong className="att-kpi-value" style={{ color: 'var(--red)' }}>
                {dailyStats.absent}
              </strong>
              <small className="att-kpi-sub">Unnotified</small>
            </div>
            <div className="att-kpi-card neutral">
              <span className="att-kpi-label">Not Marked</span>
              <strong className="att-kpi-value" style={{ color: 'var(--muted)' }}>
                {dailyStats.unmarked}
              </strong>
              <small className="att-kpi-sub">Pending entry</small>
            </div>
          </>
        ) : (
          <>
            <div className="att-kpi-card">
              <span className="att-kpi-label">Working Days</span>
              <strong className="att-kpi-value">{monthlyStats.totalWorkingDays}</strong>
              <small className="att-kpi-sub">Cycle basis (30 days)</small>
            </div>
            <div className="att-kpi-card present">
              <span className="att-kpi-label">Avg Attendance</span>
              <strong className="att-kpi-value" style={{ color: 'var(--blue)' }}>
                {monthlyStats.avgRate}%
              </strong>
              <small className="att-kpi-sub">Station rate</small>
            </div>
            <div className="att-kpi-card perfect">
              <span className="att-kpi-label">100% Perfect Attendance</span>
              <strong className="att-kpi-value" style={{ color: '#d97706' }}>
                ⭐ {monthlyStats.perfectCount}
              </strong>
              <small className="att-kpi-sub">0 Leaves & 0 Absents</small>
            </div>
            <div className="att-kpi-card leave">
              <span className="att-kpi-label">Total Station Leaves</span>
              <strong className="att-kpi-value" style={{ color: '#b45309' }}>
                {monthlyStats.totalLeaves}
              </strong>
              <small className="att-kpi-sub">Payroll deduction basis</small>
            </div>
          </>
        )}
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: DAILY ATTENDANCE SCREEN (MODULE 2) */}
      {/* ========================================================================= */}
      {activeTab === 'daily' && (
        <div className="att-main-card card">
          {/* Controls Bar */}
          <div className="att-controls-bar">
            {/* Date Navigator */}
            <div className="att-date-nav">
              <button
                className="icon-btn tiny"
                onClick={() => setSelectedDate((d) => addDaysISO(d, -1))}
                title="Previous Day"
                aria-label="Previous Day"
                id="prev-day-btn"
              >
                <ChevronLeft size={16} />
              </button>
              <div className="att-date-picker-wrap">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="att-date-input"
                  id="attendance-date-picker"
                />
                <span className="att-date-label">
                  {formatKarachiDate(new Date(`${selectedDate}T12:00:00+05:00`))}
                </span>
              </div>
              <button
                className="icon-btn tiny"
                onClick={() => setSelectedDate((d) => addDaysISO(d, 1))}
                title="Next Day"
                aria-label="Next Day"
                id="next-day-btn"
              >
                <ChevronRight size={16} />
              </button>
              {selectedDate !== getKarachiTodayISO() && (
                <button
                  className="button secondary tiny"
                  onClick={() => setSelectedDate(getKarachiTodayISO())}
                  id="today-btn"
                >
                  Today
                </button>
              )}
            </div>

            {/* Shift Selector Filter */}
            <div className="att-filter-group">
              <label htmlFor="shift-filter-select" className="att-filter-label">
                Shift:
              </label>
              <select
                id="shift-filter-select"
                value={selectedShift}
                onChange={(e) => setSelectedShift(e.target.value)}
                className="att-select"
              >
                <option value="all">All Shifts</option>
                <option value="Shift 1 - Day">Shift 1 - Day (07:00 – 19:00)</option>
                <option value="Shift 2 - Night">Shift 2 - Night (19:00 – 07:00)</option>
              </select>
            </div>

            {/* Search Input */}
            <div className="table-search search att-search-box">
              <Search size={15} />
              <input
                id="search-daily-staff"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search staff by name or role..."
              />
            </div>
          </div>

          {/* Bulk Action Buttons Bar (Module 2 Requirement) */}
          <div className="att-bulk-strip">
            <div className="att-bulk-left">
              <span className="att-bulk-hint">
                <Info size={14} /> Quick bulk actions for current shift roster:
              </span>
            </div>
            <div className="att-bulk-actions">
              {/* Module 2: Bulk attendance for all fillers */}
              <button
                className="button primary att-filler-btn"
                onClick={handleBulkFillersPresent}
                disabled={bulkSaving || savingId !== null}
                aria-busy={bulkSaving}
                id="bulk-fillers-present-btn"
                title="Mark all pump attendants on duty as Present"
              >
                <Zap size={16} />
                <span>Mark All Fillers Present ({fillerCount})</span>
              </button>

              <button
                className="button secondary"
                onClick={handleBulkAllStaffPresent}
                disabled={bulkSaving || savingId !== null}
                aria-busy={bulkSaving}
                id="bulk-all-staff-present-btn"
              >
                <UserCheck size={16} />
                <span>Mark All Staff Present</span>
              </button>
            </div>
          </div>

          {/* Staff Roster Attendance Table */}
          <div className="table-wrap desktop-table-only" style={{ marginTop: 16 }}>
            <table className="att-roster-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Designation</th>
                  <th>Shift</th>
                  <th style={{ width: 280 }}>Attendance Status</th>
                  <th>Check-In / Out</th>
                  <th>Reason / Notes</th>
                  <th>Source</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredDailyStaff.map((emp) => {
                  const record = dailyAttendanceMap.get(String(emp.id));
                  const currentStatus = record?.status || null;
                  const isPumpFiller = isFiller(emp.designation);

                  return (
                    <tr key={emp.id} className={currentStatus ? 'row-marked' : 'row-unmarked'}>
                      <td>
                        <div className="att-emp-cell">
                          <div className="att-avatar">
                            {emp.name
                              .split(' ')
                              .map((n) => n[0])
                              .join('')
                              .slice(0, 2)
                              .toUpperCase()}
                          </div>
                          <div>
                            <strong className="att-emp-name">{emp.name}</strong>
                            {isPumpFiller && <span className="att-filler-tag">Filler</span>}
                          </div>
                        </div>
                      </td>

                      <td>
                        <span className="att-designation-text">{emp.designation}</span>
                      </td>

                      <td>
                        <span className="att-shift-badge">{emp.shiftName || 'Shift 1 - Day'}</span>
                      </td>

                      {/* Interactive Status Pill Buttons */}
                      <td>
                        <div className="att-status-buttons" role="group" aria-label="Mark Attendance Status">
                          <button
                            type="button"
                            className={`att-status-btn present ${currentStatus === 'Present' ? 'active' : ''}`}
                            onClick={() => handleMarkAttendance(emp, 'Present')}
                            disabled={savingId !== null || bulkSaving}
                            title="Mark Present"
                            aria-label={`Mark ${emp.name} Present`}
                          >
                            <CheckCircle2 size={14} />
                            <span>Present</span>
                          </button>

                          <button
                            type="button"
                            className={`att-status-btn absent ${currentStatus === 'Absent' ? 'active' : ''}`}
                            onClick={() => handleMarkAttendance(emp, 'Absent')}
                            disabled={savingId !== null || bulkSaving}
                            title="Mark Absent"
                            aria-label={`Mark ${emp.name} Absent`}
                          >
                            <XCircle size={14} />
                            <span>Absent</span>
                          </button>

                          <button
                            type="button"
                            className={`att-status-btn leave ${currentStatus === 'Leave' ? 'active' : ''}`}
                            onClick={() => handleMarkAttendance(emp, 'Leave')}
                            disabled={savingId !== null || bulkSaving}
                            title="Mark On Leave"
                            aria-label={`Mark ${emp.name} On Leave`}
                          >
                            <Clock size={14} />
                            <span>Leave</span>
                          </button>
                        </div>
                      </td>

                      {/* Timings */}
                      <td>
                        {currentStatus === 'Present' ? (
                          <div className="att-time-inputs">
                            <input
                              type="time"
                              className="att-time-field"
                              value={record?.checkInTime || '07:00'}
                              onChange={(e) => handleUpdateRecordDetails(emp, 'checkInTime', e.target.value)}
                              title="Check-in Time"
                            />
                            <span>-</span>
                            <input
                              type="time"
                              className="att-time-field"
                              value={record?.checkOutTime || '19:00'}
                              onChange={(e) => handleUpdateRecordDetails(emp, 'checkOutTime', e.target.value)}
                              title="Check-out Time"
                            />
                          </div>
                        ) : (
                          <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>
                        )}
                      </td>

                      {/* Reason / Notes */}
                      <td>
                        <input
                          className="att-notes-input"
                          placeholder={currentStatus === 'Leave' ? 'Reason for leave...' : 'Notes...'}
                          defaultValue={record?.notes || ''}
                          onBlur={(e) => handleUpdateRecordDetails(emp, 'notes', e.target.value)}
                        />
                      </td>

                      {/* Source */}
                      <td>
                        <span
                          className="att-source-pill"
                          title="Designed for Manual & Biometric sync"
                        >
                          {record?.attendanceSource || 'Manual'}
                        </span>
                      </td>

                      {/* Module 4: Edit & Correction Action */}
                      <td>
                        {record ? (
                          <button
                            type="button"
                            className="button secondary tiny"
                            onClick={() =>
                              setCorrectionTarget({
                                ...record,
                                employeeId: emp.id,
                                employeeName: emp.name,
                                designation: emp.designation,
                                shiftName: emp.shiftName,
                                date: selectedDate,
                              })
                            }
                            title="Attendance Correction with Audit Trail"
                          >
                            <FileEdit size={12} />
                            <span>Correct</span>
                          </button>
                        ) : (
                          <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card Roster */}
          <div className="mobile-cards-only" style={{ marginTop: 14 }}>
            {filteredDailyStaff.map((emp) => {
              const record = dailyAttendanceMap.get(String(emp.id));
              const currentStatus = record?.status || null;

              return (
                <div key={emp.id} className="mobile-record-card att-mobile-card">
                  <div className="mobile-record-header">
                    <div>
                      <strong className="row-title">{emp.name}</strong>
                      <small style={{ display: 'block', color: 'var(--muted)' }}>
                        {emp.designation} • {emp.shiftName}
                      </small>
                    </div>
                    {currentStatus ? (
                      <span className={`att-status-pill ${currentStatus.toLowerCase()}`}>
                        {currentStatus}
                      </span>
                    ) : (
                      <span className="att-status-pill neutral">Not marked</span>
                    )}
                  </div>

                  <div className="mobile-record-body" style={{ marginTop: 10 }}>
                    <div className="att-status-buttons" style={{ width: '100%' }}>
                      <button
                        type="button"
                        className={`att-status-btn present ${currentStatus === 'Present' ? 'active' : ''}`}
                        onClick={() => handleMarkAttendance(emp, 'Present')}
                      >
                        <CheckCircle2 size={14} /> Present
                      </button>
                      <button
                        type="button"
                        className={`att-status-btn absent ${currentStatus === 'Absent' ? 'active' : ''}`}
                        onClick={() => handleMarkAttendance(emp, 'Absent')}
                      >
                        <XCircle size={14} /> Absent
                      </button>
                      <button
                        type="button"
                        className={`att-status-btn leave ${currentStatus === 'Leave' ? 'active' : ''}`}
                        onClick={() => handleMarkAttendance(emp, 'Leave')}
                      >
                        <Clock size={14} /> Leave
                      </button>
                    </div>

                    {record && (
                      <button
                        type="button"
                        className="button secondary tiny"
                        onClick={() =>
                          setCorrectionTarget({
                            ...record,
                            employeeId: emp.id,
                            employeeName: emp.name,
                            designation: emp.designation,
                            shiftName: emp.shiftName,
                            date: selectedDate,
                          })
                        }
                        style={{ marginTop: 8, width: '100%', justifyContent: 'center' }}
                      >
                        <FileEdit size={12} /> Correct with Audit Log
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {!filteredDailyStaff.length && (
            <p className="empty-state">No staff members match the selected shift or search query.</p>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: ATTENDANCE HISTORY & LOG (MODULE 3) */}
      {/* ========================================================================= */}
      {activeTab === 'history' && (
        <div className="att-main-card card">
          {/* History Filters */}
          <div className="att-controls-bar">
            <div className="att-filter-group">
              <label className="att-filter-label">Range:</label>
              <select
                value={historyRange}
                onChange={(e) => {
                  const val = e.target.value;
                  setHistoryRange(val);
                  const today = getKarachiTodayISO();
                  if (val === 'today') {
                    setHistoryStartDate(today);
                    setHistoryEndDate(today);
                  } else if (val === 'week') {
                    setHistoryStartDate(addDaysISO(today, -7));
                    setHistoryEndDate(today);
                  } else if (val === 'month') {
                    setHistoryStartDate(addDaysISO(today, -30));
                    setHistoryEndDate(today);
                  }
                }}
                className="att-select"
              >
                <option value="month">Last 30 Days</option>
                <option value="week">Last 7 Days</option>
                <option value="today">Today Only</option>
                <option value="custom">Custom Date Range</option>
              </select>
            </div>

            {historyRange === 'custom' && (
              <div className="att-date-range-inputs">
                <input
                  type="date"
                  value={historyStartDate}
                  onChange={(e) => setHistoryStartDate(e.target.value)}
                  className="att-date-input"
                />
                <span>to</span>
                <input
                  type="date"
                  value={historyEndDate}
                  onChange={(e) => setHistoryEndDate(e.target.value)}
                  className="att-date-input"
                />
              </div>
            )}

            <div className="att-filter-group">
              <label className="att-filter-label">Status:</label>
              <select
                value={historyStatusFilter}
                onChange={(e) => setHistoryStatusFilter(e.target.value)}
                className="att-select"
              >
                <option value="all">All Statuses</option>
                <option value="Present">Present Only</option>
                <option value="Leave">Leave Only</option>
                <option value="Absent">Absent Only</option>
              </select>
            </div>

            <div className="att-filter-group">
              <label className="att-filter-label">Shift:</label>
              <select
                value={selectedShift}
                onChange={(e) => setSelectedShift(e.target.value)}
                className="att-select"
              >
                <option value="all">All Shifts</option>
                <option value="Shift 1 - Day">Shift 1 - Day</option>
                <option value="Shift 2 - Night">Shift 2 - Night</option>
              </select>
            </div>

            <div className="table-search search att-search-box">
              <Search size={15} />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search history records..."
              />
            </div>
          </div>

          {/* History Records Table */}
          <div className="table-wrap desktop-table-only" style={{ marginTop: 16 }}>
            <table className="att-history-log-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Employee</th>
                  <th>Designation</th>
                  <th>Shift</th>
                  <th>Status</th>
                  <th>Times</th>
                  <th>Source</th>
                  <th>Notes</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistoryRecords.map((r, i) => (
                  <tr key={r.id || `${r.date}-${r.employeeId}-${i}`}>
                    <td>
                      <strong>{formatKarachiDate(new Date(`${r.date}T12:00:00+05:00`))}</strong>
                      <small style={{ display: 'block', color: 'var(--muted)', fontSize: 11 }}>
                        {r.date}
                      </small>
                    </td>
                    <td>
                      <strong>{r.employeeName}</strong>
                    </td>
                    <td>{r.designation}</td>
                    <td>
                      <span className="att-shift-badge">{r.shiftName || 'Shift 1 - Day'}</span>
                    </td>
                    <td>
                      <span className={`att-status-pill ${r.status.toLowerCase()}`}>
                        {r.status === 'Present' && <CheckCircle2 size={13} />}
                        {r.status === 'Absent' && <XCircle size={13} />}
                        {r.status === 'Leave' && <Clock size={13} />}
                        {r.status}
                      </span>
                    </td>
                    <td>
                      {r.checkInTime || r.checkOutTime ? (
                        <small style={{ fontFamily: 'monospace' }}>
                          {r.checkInTime || '--:--'} - {r.checkOutTime || '--:--'}
                        </small>
                      ) : (
                        <span style={{ color: 'var(--muted)' }}>—</span>
                      )}
                    </td>
                    <td>
                      <span className="att-source-pill">{r.attendanceSource || 'Manual'}</span>
                    </td>
                    <td>
                      <span className="att-notes-text">{r.notes || '—'}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="button secondary tiny"
                          onClick={() => {
                            const staff = staffList.find(
                              (s) => String(s.id) === String(r.employeeId) || s.name === r.employeeName,
                            );
                            setHistoryEmployeeModal(staff || { name: r.employeeName, designation: r.designation, shiftName: r.shiftName });
                          }}
                        >
                          View
                        </button>
                        <button
                          className="button secondary tiny"
                          onClick={() => setCorrectionTarget(r)}
                          title="Edit Attendance with Mandatory Reason & Audit Log"
                        >
                          <FileEdit size={12} />
                          <span>Correct</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards for History */}
          <div className="mobile-cards-only" style={{ marginTop: 14 }}>
            {filteredHistoryRecords.map((r, i) => (
              <div key={r.id || `${r.date}-${r.employeeId}-${i}`} className="mobile-record-card">
                <div className="mobile-record-header">
                  <div>
                    <strong className="row-title">{r.employeeName}</strong>
                    <small style={{ display: 'block', color: 'var(--muted)' }}>
                      {formatKarachiDate(new Date(`${r.date}T12:00:00+05:00`))} • {r.shiftName}
                    </small>
                  </div>
                  <span className={`att-status-pill ${r.status.toLowerCase()}`}>{r.status}</span>
                </div>
                {r.notes && (
                  <p style={{ margin: '8px 0 0 0', fontSize: 12, color: 'var(--muted)' }}>
                    Note: {r.notes}
                  </p>
                )}
                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                  <button
                    type="button"
                    className="button secondary tiny"
                    onClick={() => {
                      const staff = staffList.find(
                        (s) => String(s.id) === String(r.employeeId) || s.name === r.employeeName,
                      );
                      setHistoryEmployeeModal(staff || { name: r.employeeName, designation: r.designation, shiftName: r.shiftName });
                    }}
                  >
                    View
                  </button>
                  <button
                    type="button"
                    className="button secondary tiny"
                    onClick={() => setCorrectionTarget(r)}
                  >
                    <FileEdit size={12} /> Correct
                  </button>
                </div>
              </div>
            ))}
          </div>

          {!filteredHistoryRecords.length && (
            <p className="empty-state">No attendance records found for the selected filter range.</p>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: MONTHLY ATTENDANCE REGISTER & SUMMARY (MODULE 3 & PAYROLL BASE) */}
      {/* ========================================================================= */}
      {activeTab === 'monthly' && (
        <div className="att-main-card card">
          {/* Month Selector & Export Bar */}
          <div className="att-controls-bar">
            <div className="att-filter-group">
              <label className="att-filter-label">Month:</label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="att-month-input"
                id="monthly-register-month-picker"
              />
            </div>

            <div className="att-filter-group">
              <label className="att-filter-label">Shift:</label>
              <select
                value={selectedShift}
                onChange={(e) => setSelectedShift(e.target.value)}
                className="att-select"
              >
                <option value="all">All Shifts</option>
                <option value="Shift 1 - Day">Shift 1 - Day</option>
                <option value="Shift 2 - Night">Shift 2 - Night</option>
              </select>
            </div>

            <div className="table-search search att-search-box">
              <Search size={15} />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search employee or role..."
              />
            </div>

            <div style={{ marginLeft: 'auto' }}>
              <button
                className="button primary"
                onClick={handleExportCsv}
                id="export-attendance-csv-btn"
              >
                <Download size={15} />
                <span>Export CSV</span>
              </button>
            </div>
          </div>

          {/* Monthly Table with Module 5 & 6 Integrated Payroll Calculations */}
          <div className="table-wrap desktop-table-only" style={{ marginTop: 16 }}>
            <table className="att-monthly-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Role</th>
                  <th>Shift</th>
                  <th>Days (P / L / A)</th>
                  <th>Attendance %</th>
                  <th>Monthly Salary</th>
                  <th>Daily Rate (÷30)</th>
                  <th>Rule Impact</th>
                  <th>Net Est. Salary</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {monthlySummary
                  .filter((emp) => {
                    if (selectedShift !== 'all') {
                      const empShift = (emp.shift || '').toLowerCase();
                      if (!empShift.includes(selectedShift.toLowerCase()) && !empShift.includes('general')) {
                        return false;
                      }
                    }
                    if (searchQuery) {
                      const q = searchQuery.toLowerCase();
                      if (!emp.name.toLowerCase().includes(q) && !emp.designation.toLowerCase().includes(q)) {
                        return false;
                      }
                    }
                    return true;
                  })
                  .map((emp) => {
                    const staff = staffList.find(
                      (s) => String(s.id) === String(emp.employeeId) || s.name === emp.name,
                    );
                    const monthlySalary = staff?.monthlySalary || emp.monthlySalary || 35000;
                    const salaryCalc = calculateEmployeeSalary({
                      monthlySalary,
                      leaveDays: emp.leaveDays,
                      absentDays: emp.absentDays,
                      workingDaysBasis: 30,
                    });

                    return (
                      <tr key={emp.employeeId}>
                        <td>
                          <strong className="att-emp-name">{emp.name}</strong>
                        </td>
                        <td>{emp.designation}</td>
                        <td>
                          <span className="att-shift-badge">{emp.shift}</span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5 }}>
                            <span style={{ color: 'var(--green)', fontWeight: 700 }} title="Present Days">
                              {emp.presentDays}P
                            </span>
                            <span style={{ color: 'var(--line)' }}>/</span>
                            <span style={{ color: emp.leaveDays > 0 ? '#d97706' : 'var(--muted)', fontWeight: 700 }} title="Leave Days">
                              {emp.leaveDays}L
                            </span>
                            <span style={{ color: 'var(--line)' }}>/</span>
                            <span style={{ color: emp.absentDays > 0 ? 'var(--red)' : 'var(--muted)', fontWeight: 700 }} title="Absent Days">
                              {emp.absentDays}A
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className="att-rate-cell">
                            <span className="att-rate-num">{emp.attendanceRate}%</span>
                            <div className="att-rate-bar">
                              <div
                                className="att-rate-bar-fill"
                                style={{ width: `${Math.min(100, emp.attendanceRate)}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* Module 5: Monthly Salary */}
                        <td>
                          <div className="att-salary-cell">
                            <span className="att-salary-num">{formatPKR(salaryCalc.monthlySalary)}</span>
                            <small className="att-salary-sub">Base Config</small>
                          </div>
                        </td>

                        {/* Module 5: Daily Rate (Monthly ÷ 30) */}
                        <td>
                          <div className="att-salary-cell">
                            <span className="att-salary-num">{formatPKR(salaryCalc.dailySalary)}</span>
                            <small className="att-salary-sub">PKR / day</small>
                          </div>
                        </td>

                        {/* Module 6: Bonus / Deduction Rule Impact */}
                        <td>
                          {salaryCalc.isPerfectAttendance ? (
                            <span className="att-impact-tag bonus" title="Perfect Attendance Rule: Monthly + Daily Salary">
                              <Award size={11} /> +{formatPKR(salaryCalc.perfectAttendanceBonus)} Bonus
                            </span>
                          ) : salaryCalc.leaveDeduction > 0 ? (
                            <span className="att-impact-tag deduct" title={`Leave Rule: Monthly - (${emp.leaveDays} × Daily Salary)`}>
                              -{formatPKR(salaryCalc.leaveDeduction)} ({emp.leaveDays} leaves)
                            </span>
                          ) : salaryCalc.absentDeduction > 0 ? (
                            <span className="att-impact-tag deduct" title={`Absent Rule: Monthly - (${emp.absentDays} × Daily Salary)`}>
                              -{formatPKR(salaryCalc.absentDeduction)} ({emp.absentDays} absents)
                            </span>
                          ) : (
                            <span className="att-impact-tag neutral">Standard</span>
                          )}
                        </td>

                        {/* Module 6: Net Calculated Take-Home Salary */}
                        <td>
                          <strong
                            style={{
                              fontSize: 13.5,
                              color: salaryCalc.isPerfectAttendance ? 'var(--green)' : 'var(--ink)',
                            }}
                          >
                            {formatPKR(salaryCalc.netSalary)}
                          </strong>
                        </td>

                        {/* Actions */}
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              className="button secondary tiny"
                              onClick={() => {
                                setHistoryEmployeeModal(staff || emp);
                              }}
                              title="View individual attendance history timeline"
                            >
                              History
                            </button>
                            <button
                              className="button secondary tiny"
                              onClick={() => handleOpenSlipFromMonthly(emp, salaryCalc)}
                              title="View & Print official Salary Slip"
                              id={`btn-slip-${emp.employeeId}`}
                            >
                              <FileText size={11} /> Slip
                            </button>
                            <button
                              className="button primary tiny"
                              onClick={() => {
                                setCalculatorTargetEmployee({
                                  ...(staff || {}),
                                  id: emp.employeeId,
                                  name: emp.name,
                                  designation: emp.designation,
                                  monthlySalary,
                                  leaveDays: emp.leaveDays,
                                  absentDays: emp.absentDays,
                                });
                                setSalaryEngineOpen(true);
                              }}
                              title="Test Salary Engine with live calculations"
                            >
                              <Calculator size={11} /> Test Rule
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          {/* Mobile view for Monthly Register */}
          <div className="mobile-cards-only" style={{ marginTop: 14 }}>
            {monthlySummary.map((emp) => {
              const staff = staffList.find(
                (s) => String(s.id) === String(emp.employeeId) || s.name === emp.name,
              );
              const monthlySalary = staff?.monthlySalary || emp.monthlySalary || 35000;
              const salaryCalc = calculateEmployeeSalary({
                monthlySalary,
                leaveDays: emp.leaveDays,
                absentDays: emp.absentDays,
                workingDaysBasis: 30,
              });

              return (
                <div key={emp.employeeId} className="mobile-record-card">
                  <div className="mobile-record-header">
                    <div>
                      <strong className="row-title">{emp.name}</strong>
                      <small style={{ display: 'block', color: 'var(--muted)' }}>
                        {emp.designation} • {emp.shift}
                      </small>
                    </div>
                    {salaryCalc.isPerfectAttendance ? (
                      <span className="perfect-star-badge">
                        <Award size={12} /> ⭐ Perfect
                      </span>
                    ) : (
                      <span className="att-status-pill neutral">{emp.attendanceRate}% Rate</span>
                    )}
                  </div>
                  <div className="mobile-record-body" style={{ marginTop: 8 }}>
                    <div className="mobile-record-field">
                      <span>Attendance:</span>
                      <b>
                        <span style={{ color: 'var(--green)' }}>{emp.presentDays}P</span> /{' '}
                        <span style={{ color: '#d97706' }}>{emp.leaveDays}L</span> /{' '}
                        <span style={{ color: 'var(--red)' }}>{emp.absentDays}A</span>
                      </b>
                    </div>
                    <div className="mobile-record-field">
                      <span>Base Salary:</span>
                      <b>{formatPKR(salaryCalc.monthlySalary)}</b>
                    </div>
                    <div className="mobile-record-field">
                      <span>Rule Impact:</span>
                      {salaryCalc.isPerfectAttendance ? (
                        <b style={{ color: 'var(--green)' }}>+{formatPKR(salaryCalc.perfectAttendanceBonus)} (Bonus)</b>
                      ) : salaryCalc.leaveDeduction > 0 ? (
                        <b style={{ color: '#dc2626' }}>-{formatPKR(salaryCalc.leaveDeduction)}</b>
                      ) : (
                        <span>Standard</span>
                      )}
                    </div>
                    <div className="mobile-record-field">
                      <span>Net Salary:</span>
                      <b style={{ color: salaryCalc.isPerfectAttendance ? 'var(--green)' : 'var(--ink)' }}>
                        {formatPKR(salaryCalc.netSalary)}
                      </b>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                    <button
                      type="button"
                      className="button secondary tiny"
                      onClick={() => setHistoryEmployeeModal(staff || emp)}
                    >
                      History
                    </button>
                    <button
                      type="button"
                      className="button secondary tiny"
                      onClick={() => handleOpenSlipFromMonthly(emp, salaryCalc)}
                      title="View Salary Slip"
                    >
                      <FileText size={11} /> Slip
                    </button>
                    <button
                      type="button"
                      className="button primary tiny"
                      onClick={() => {
                        setCalculatorTargetEmployee({
                          ...(staff || {}),
                          id: emp.employeeId,
                          name: emp.name,
                          designation: emp.designation,
                          monthlySalary,
                          leaveDays: emp.leaveDays,
                          absentDays: emp.absentDays,
                        });
                        setSalaryEngineOpen(true);
                      }}
                    >
                      <Calculator size={11} /> Test Rule
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Employee Individual History Drilldown Modal */}
      {historyEmployeeModal && (
        <EmployeeHistoryModal
          employee={historyEmployeeModal}
          records={attendanceRecords}
          onClose={() => setHistoryEmployeeModal(null)}
        />
      )}

      {/* Module 4: Attendance Correction Modal */}
      {correctionTarget && (
        <AttendanceCorrectionModal
          record={correctionTarget}
          employee={staffList.find(
            (s) =>
              String(s.id) === String(correctionTarget.employeeId) ||
              s.name === correctionTarget.employeeName,
          )}
          auditHistory={auditLogs.filter(
            (a) =>
              String(a.employeeId) === String(correctionTarget.employeeId) ||
              a.employeeName === correctionTarget.employeeName,
          )}
          currentUserName="Station Manager"
          onClose={() => setCorrectionTarget(null)}
          onSaveCorrection={handleSaveCorrection}
        />
      )}

      {/* Module 4: Attendance Audit Trail Modal */}
      {auditTrailOpen && (
        <AttendanceAuditTrailModal
          auditLogs={auditLogs}
          onClose={() => setAuditTrailOpen(false)}
        />
      )}

      {/* Module 5 & 6: Salary Configuration & Live Payroll Calculator Modal */}
      {salaryEngineOpen && (
        <SalaryConfigAndCalculatorModal
          staffList={staffList}
          initialEmployee={calculatorTargetEmployee}
          onClose={() => {
            setSalaryEngineOpen(false);
            setCalculatorTargetEmployee(null);
          }}
        />
      )}

      {/* Module 10: Salary Slip & Official Voucher Modal */}
      {payslipModalData && (
        <PayslipModal
          record={payslipModalData}
          detail={payslipModalData}
          onClose={() => setPayslipModalData(null)}
        />
      )}
    </div>
  );
}
