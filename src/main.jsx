import React, { useEffect, useState, useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard,
  Fuel,
  ReceiptText,
  UsersRound,
  WalletCards,
  ChartNoAxesCombined,
  Settings,
  Bell,
  Search,
  ChevronDown,
  Plus,
  ArrowUpRight,
  MoreHorizontal,
  CircleCheck,
  Clock3,
  AlertTriangle,
  X,
  Menu,
  LogOut,
  CalendarDays,
  Banknote,
  Droplets,
  Gauge,
  TrendingUp,
  ArrowDownRight,
  Sun,
  Moon,
  Ruler,
  Link2,
  Sparkles,
  LockKeyhole,
} from "lucide-react";
import "./styles.css";
import ReportsPage from "./ReportsPage";
import SettingsPage from "./SettingsPage";
import IncomePage from "./IncomePage";
import TanksPage from "./components/tanks/TanksPage";
import ShiftClosingModal from "./components/tanks/ShiftClosingModal";
import OwnerKPIs from "./components/dashboard/OwnerKPIs";
import FlowAIAgent from "./components/dashboard/FlowAIAgent";
import FuelForecast from "./components/dashboard/FuelForecast";
import DeliveryOrderModal from "./components/dashboard/DeliveryOrderModal";
import { TankDataProvider, useTanks } from "./hooks/useTanks";
import AuthGate from "./components/auth/AuthGate";
import Sidebar from "./components/layout/Sidebar";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { isSupabaseConfigured } from "./lib/supabaseClient";
import { NotificationProvider, useNotifications } from "./hooks/useNotifications";
import { useAvatarUrl } from "./hooks/useAvatar";
import { LanguageProvider, useLanguage } from "./context/LanguageContext";
import { pctChange, formatPct, buildChart } from "./utils/salesMetrics";
import { formatPKR, formatLiters as formatLitres } from "./utils/formatters";
import {
  KARACHI_TIME_ZONE,
  getKarachiTodayISO,
  formatKarachiDate,
  getKarachiGreeting,
} from "./dateUtils";
import { canAccessPage, filterNavForRole } from "./utils/rbac";
import { filterAndSortEmployees, nextSort, sortArrow } from "./utils/employeeTable";
import {
  msUntilNextKarachiMidnight,
  msUntilNextShiftEnd,
  getKarachiShift,
} from "./dateUtils";

const nav = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "shifts", label: "Shift closing", icon: ReceiptText, badge: "2" },
  { id: "station", label: "Tanks & nozzles", icon: Fuel },
  { id: "expenses", label: "Expenses", icon: WalletCards },
  { id: "people", label: "Employees & salaries", icon: UsersRound },
  { id: "income", label: "Other income", icon: Banknote },
  { id: "reports", label: "Reports", icon: ChartNoAxesCombined },
];

export { KARACHI_TIME_ZONE, getKarachiTodayISO };
export function formatExpenseDate(iso) {
  return iso
    ? new Intl.DateTimeFormat("en-GB", {
      timeZone: "UTC",
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(`${iso}T00:00:00Z`))
    : "";
}
export function getExpenseDateRange(
  range = "today",
  todayISO = getKarachiTodayISO(),
) {
  const [year, month, day] = todayISO.split("-").map(Number);
  const today = new Date(Date.UTC(year, month - 1, day));
  let start = today;
  if (range === "week") {
    const mondayOffset = (today.getUTCDay() + 6) % 7;
    start = new Date(today);
    start.setUTCDate(today.getUTCDate() - mondayOffset);
  }
  if (range === "month") start = new Date(Date.UTC(year, month - 1, 1));
  return { startISO: start.toISOString().slice(0, 10), endISO: todayISO };
}
export function filterExpenses(
  expenses,
  search = "",
  range = "today",
  todayISO = getKarachiTodayISO(),
) {
  const { startISO, endISO } = getExpenseDateRange(range, todayISO);
  const query = search.trim().toLowerCase();
  return expenses.filter(
    (e) =>
      e.date >= startISO &&
      e.date <= endISO &&
      (!query || Object.values(e).join(" ").toLowerCase().includes(query)),
  );
}
const initialToday = getKarachiTodayISO();
const money = (n) => `PKR ${n.toLocaleString("en-PK")}`;
const liters = (n) => `${n.toLocaleString("en-PK")} L`;

function App() {
  const { t, lang } = useLanguage();
  const [page, setPage] = useState("overview");
  const [mobile, setMobile] = useState(false);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const [expenses, setExpenses] = useState([]);
  const [income, setIncome] = useState([]);
  const [employeesList, setEmployeesList] = useState([]);
  const [search, setSearch] = useState("");
  const [notifOpen, setNotifOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    try {
      const saved = localStorage.getItem("flow-theme");
      if (saved === "dark") return true;
      if (saved === "light") return false;
      if (saved === "system") {
        return window.matchMedia("(prefers-color-scheme: dark)").matches;
      }
    } catch {
      /* ignore */
    }
    // Default theme to light mode
    return false;
  });
  const [shiftReminder, setShiftReminder] = useState(null);
  const { unreadCount, addNotification } = useNotifications();
  const headerAvatarUrl = useAvatarUrl();

  const { api, session, userName, overview } = useTanks();
  const { status, signOut } = useAuth();
  const userRole = overview?.viewer?.role || 'owner';
  const isAdminOrOwner = userRole === 'owner' || userRole === 'admin';
  const isManager = !isAdminOrOwner;

  const allNavItems = [
    { id: "overview", label: t("overview", "Overview"), icon: LayoutDashboard },
    { id: "shifts", label: t("shift_closing", "Shift closing"), icon: ReceiptText, badge: "2" },
    { id: "station", label: t("tanks_nozzles", "Tanks & nozzles"), icon: Fuel },
    { id: "expenses", label: t("expenses", "Expenses"), icon: WalletCards },
    { id: "people", label: t("employees_salaries", "Employees & salaries"), icon: UsersRound },
    { id: "income", label: t("other_income", "Other income"), icon: Banknote },
    { id: "reports", label: t("reports", "Reports"), icon: ChartNoAxesCombined },
  ];

  // RBAC: same icons/labels/order as Owner; only the pages this role may open are kept.
  const navItems = filterNavForRole(userRole, allNavItems);

  // Defensive: if the role resolves after load (or changes), never leave the user on a forbidden page.
  useEffect(() => {
    if (page !== "settings" && !canAccessPage(userRole, page)) setPage("overview");
  }, [userRole, page]);

  useShiftReminder(useCallback(() => {
    const shift = getKarachiShift();
    setShiftReminder(shift);
    addNotification({
      id: 'shift-' + Date.now(),
      type: 'warning',
      shiftName: shift.name,
      title: `${t('notif_shift_title', 'Time to close')} ${shift.name}`,
      message: `${shift.name} ${t('notif_shift_msg', 'has ended. Please close the shift and record meter readings before the next shift begins.')}`
    });
  }, [addNotification, t]));

  useEffect(() => {
    const themeVal = darkMode ? "dark" : "light";
    document.documentElement.dataset.theme = themeVal;
    document.documentElement.setAttribute("data-theme", themeVal);
    try {
      localStorage.setItem("flow-theme", themeVal);
    } catch {
      /* ignore */
    }
  }, [darkMode]);

  // Load operational data from the database when connected
  useEffect(() => {
    if (!api) return;
    if (api.getExpenses) {
      api.getExpenses().then(res => { if (res && res.length) setExpenses(res); }).catch(() => { });
    }
    if (api.getOtherIncome) {
      api.getOtherIncome().then(res => { if (res && res.length) setIncome(res); }).catch(() => { });
    }
    if (api.getEmployees) {
      api.getEmployees().then(res => { if (res && res.length) setEmployeesList(res); }).catch(() => { });
    }
  }, [api, session]);

  if (status !== "authenticated") return null;

  const notify = useCallback((item, type = "success") => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    let message = item;
    let toastType = type;
    if (typeof item === 'object' && item !== null) {
      message = item.message || '';
      toastType = item.type || type;
    } else if (typeof item === 'string') {
      const lower = item.toLowerCase();
      if (lower.includes('failed') || lower.includes('error') || lower.includes('unable') || lower.includes('cannot') || lower.includes('ناکام') || lower.includes('خرابی')) {
        toastType = 'error';
      }
    }
    setToast({ message, type: toastType, id: Date.now() });
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
    }, 3500);
  }, []);
  const title = page === "settings" ? t("settings", "Settings") : navItems.find((x) => x.id === page)?.label || t("overview", "Overview");
  return (
    <div className="app">
      <Sidebar
        nav={navItems}
        page={page}
        onNavigate={(id) => {
          setPage(id);
          setMobile(false);
        }}
        open={mobile}
        onClose={() => setMobile(false)}
        isManager={isManager}
      />
      {mobile && <div className="backdrop" onClick={() => setMobile(false)} />}
      <main className="main">
        <header>
          <button className="mobile-menu" onClick={() => setMobile(true)}>
            <Menu />
          </button>
          <div className="crumb">
            <span>{t("workspace", "Workspace")}</span>
            <b>/</b>
            <strong>{title}</strong>
          </div>
          <div className="header-actions">
            <button
              className="icon-btn theme-toggle"
              onClick={() => setDarkMode((v) => !v)}
              aria-label={t("toggle_theme", "Toggle theme")}
            >
              {darkMode ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <div className="notif-bell-wrap">
              <button
                className="icon-btn"
                onClick={() => setNotifOpen((v) => !v)}
                aria-label="Notifications"
                aria-expanded={notifOpen}
              >
                <Bell size={19} />
                {unreadCount > 0 && (
                  <span className="notif-count-badge">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
              {notifOpen && (
                <NotificationPanel onClose={() => setNotifOpen(false)} />
              )}
            </div>
            <div className="header-profile" title={session?.email || userName}>
              <div className="avatar small">
                {headerAvatarUrl ? (
                  <img src={headerAvatarUrl} alt="" className="avatar-img" />
                ) : (
                  userName ? userName.charAt(0).toUpperCase() : "U"
                )}
              </div>
              <span className="header-name">{userName}</span>
            </div>
            <button
              className="icon-btn logout-btn"
              onClick={() => signOut()}
              aria-label={t("sign_out", "Sign out")}
              title={t("sign_out", "Sign out")}
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <div className="content">
          {page === "settings" ? (
            <SettingsPage darkMode={darkMode} setDarkMode={setDarkMode} />
          ) : page === "overview" ? (
            <Overview
              setModal={setModal}
              income={income}
              expenses={expenses}
              today={initialToday}
              notify={notify}
            />
          ) : (
            <Page
              page={page}
              setModal={setModal}
              notify={notify}
              expenses={expenses}
              income={income}
              employees={employeesList}
              search={search}
              setModalDetail={setModal}
              today={initialToday}
            />
          )}
        </div>
      </main>
      {modal && (
        <Modal
          type={typeof modal === "string" ? modal : modal.type}
          expense={typeof modal === "string" ? null : modal.expense}
          income={typeof modal === "string" ? null : modal.income}
          close={() => setModal(null)}
          notify={notify}
          onSaveExpense={async (expense) => {
            try {
              if (api?.saveExpense) {
                const saved = await api.saveExpense(expense);
                setExpenses((v) => [saved, ...v]);
                notify("Expense saved to database");
              } else {
                setExpenses((v) => [expense, ...v]);
                notify("Expense added to sample data");
              }
            } catch (err) {
              console.warn("Failed to persist expense:", err);
              setExpenses((v) => [expense, ...v]);
              notify("Expense added locally");
            }
            setModal(null);
          }}
          onSaveIncome={async (item) => {
            try {
              if (api?.saveOtherIncome) {
                const saved = await api.saveOtherIncome(item);
                setIncome((v) => [saved, ...v]);
                notify("Other income saved to database");
              } else {
                setIncome((v) => [{ ...item, id: `income-${Date.now()}` }, ...v]);
                notify("Other income added to sample data");
              }
            } catch (err) {
              console.warn("Failed to persist income:", err);
              setIncome((v) => [{ ...item, id: `income-${Date.now()}` }, ...v]);
              notify("Other income added locally");
            }
            setModal(null);
          }}
          onSaveEmployee={async (emp) => {
            try {
              if (api?.saveEmployee) {
                const saved = await api.saveEmployee(emp);
                setEmployeesList((v) => [saved, ...v]);
                notify("Employee saved to database");
              } else {
                setEmployeesList((v) => [[emp.name, emp.designation, "General", "Active", formatPKR(emp.salary)], ...v]);
                notify("Employee added to sample data");
              }
            } catch (err) {
              console.warn("Failed to persist employee:", err);
              setEmployeesList((v) => [[emp.name, emp.designation, "General", "Active", formatPKR(emp.salary)], ...v]);
              notify("Employee added locally");
            }
            setModal(null);
          }}
        />
      )}
      {toast && (
        <div
          className={`toast ${toast.type === 'error' ? 'toast-error' : 'toast-success'}`}
          role="status"
          aria-live="polite"
        >
          {toast.type === 'error' ? (
            <AlertTriangle size={18} />
          ) : (
            <CircleCheck size={18} />
          )}
          <span>{toast.message}</span>
        </div>
      )}
      {shiftReminder && (
        <ShiftReminderModal
          shift={shiftReminder}
          onDone={() => setShiftReminder(null)}
        />
      )}
      {isAdminOrOwner && (
        <FlowAIFAB
          userName={userName}
          expenses={expenses}
          income={income}
          employees={employeesList}
          today={initialToday}
          notify={notify}
          onNavigate={setPage}
        />
      )}
    </div>
  );
}

function Overview({ setModal, income = [], expenses = [], today, notify }) {
  const { userName, sales, overview, reloadPricing, tanks, reload, api } = useTanks();
  const { t, lang } = useLanguage();
  const canSeeSales = Boolean(
    (overview && overview.permissions && overview.permissions.view_sales) ||
    (overview?.viewer?.role === 'owner' || overview?.viewer?.role === 'admin')
  );

  // Re-read sales whenever the Overview opens (shift closings and price changes are in the database).
  useEffect(() => {
    reloadPricing();
  }, [reloadPricing]);

  const [period, setPeriod] = useState("daily");
  const [now, setNow] = useState(() => new Date());
  const [deliveryOrderTank, setDeliveryOrderTank] = useState(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const date = formatKarachiDate(now);
  const greetingHour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: KARACHI_TIME_ZONE,
      hour: "2-digit",
      hour12: false,
    }).format(now),
  ) % 24;

  const greetingText =
    greetingHour < 12
      ? t("greeting_morning", "Good morning")
      : greetingHour < 17
        ? t("greeting_afternoon", "Good afternoon")
        : t("greeting_evening", "Good evening");

  return (
    <>
      {/* Executive Header */}
      <div className="page-heading overview-heading">
        <div>
          <div className="eyebrow">
            <span className="pulse" /> {t("today", "Today")} - {date}
          </div>
          <h1>
            {greetingText}, {userName}
          </h1>
          <p>{t("overview_sub", "Here's what's happening at your station today.")}</p>
        </div>
        <div className="heading-actions overview-actions">
          <div className="today-date">
            <CalendarDays size={17} />
            <span>{t("today", "Today")} - {date}</span>
          </div>
        </div>
      </div>

      {/* TOP: Primary 5 KPIs Row */}
      <OwnerKPIs
        sales={sales}
        tanks={tanks}
        income={income}
        expenses={expenses}
        period={period}
        canSeeSales={canSeeSales}
        t={t}
      />

      {/* MAIN: Sales chart + Fuel Forecast */}
      <div className="dashboard-grid">
        <SalesOverviewChart
          sales={sales}
          canSeeSales={canSeeSales}
          period={period}
          setPeriod={setPeriod}
        />
        <FuelForecast
          tanks={tanks}
          sales={sales}
          onPrepareOrder={(targetTank) => setDeliveryOrderTank(targetTank)}
        />
      </div>


      {/* Delivery Order Modal */}
      {deliveryOrderTank && (
        <DeliveryOrderModal
          tank={deliveryOrderTank}
          api={api}
          notify={notify}
          onClose={() => setDeliveryOrderTank(null)}
          onConfirmOrder={async (order) => {
            try {
              if (api?.receiveFuel) {
                await api.receiveFuel({
                  tankId: order.tankId,
                  quantity: order.quantity,
                  reference: order.reference,
                  remarks: `Delivery order via ${order.supplier}. ${order.notes || ""}`.trim(),
                });
                reload();
              }
            } catch (err) {
              console.warn("Delivery order placed (stock update note):", err);
            }
          }}
        />
      )}
    </>
  );
}

function Page({
  page,
  setModal,
  notify,
  expenses = [],
  income = [],
  employees = [],
  setModalDetail,
  search = "",
  today,
}) {
  const { t } = useLanguage();
  const { overview } = useTanks();
  const [expenseRange, setExpenseRange] = useState("today");
  const [expenseSearch, setExpenseSearch] = useState(search);
  const [peopleSearch, setPeopleSearch] = useState(search);
  const [peopleSort, setPeopleSort] = useState({ key: null, dir: "asc" });
  const userRole = overview?.viewer?.role || 'owner';
  const isAdminOrOwner = userRole === 'owner' || userRole === 'admin';
  const isManager = !isAdminOrOwner;

  if (page === "station")
    return <TanksPage setModal={setModal} notify={notify} />;
  if (page === "shifts") return <ShiftPage setModal={setModal} />;

  // Restrict confidential station ledgers for Manager role
  if (!canAccessPage(userRole, page)) {
    return (
      <div className="card" style={{ padding: '3.5rem 2rem', textAlign: 'center', maxWidth: '580px', margin: '3rem auto' }}>
        <div style={{ display: 'inline-flex', padding: '1rem', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.1)', color: '#dc2626', marginBottom: '1.25rem' }}>
          <LockKeyhole size={32} />
        </div>
        <h2 style={{ fontSize: '1.35rem', fontWeight: 700, marginBottom: '0.6rem' }}>Admin / Owner Access Only</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: '1.6' }}>
          Executive reports and station financial ledgers are restricted to Station Owners and Admins for your current role.
          Your station duties are focused on daily shift operations, dispenser meters, and tank dips.
        </p>
      </div>
    );
  }

  if (page === "income")
    return <IncomePage income={income} search={search} setModal={setModal} />;
  if (page === "reports")
    return (
      <ReportsPage
        expenses={expenses}
        income={income}
        employees={employees}
        today={today}
        notify={notify}
      />
    );
  const configs = {
    people: {
      icon: UsersRound,
      desc: t("employees_desc", "Manage your station team and payroll"),
      button: t("add_employee", "Add employee"),
      headers: [
        t("col_employee", "Employee"),
        t("col_role", "Role"),
        t("col_shift", "Shift"),
        t("col_status", "Status"),
        t("col_salary", "Salary"),
      ],
      rows: employees,
    },
    income: {
      icon: Banknote,
      desc: t("income_desc", "Track revenue outside of fuel sales"),
      button: t("add_income", "Add income"),
      headers: [
        t("col_source", "Income source"),
        t("col_category", "Category"),
        t("col_date", "Date"),
        t("col_amount", "Amount"),
        t("col_status", "Status"),
      ],
      rows: income.map((i) => [
        i.name,
        i.category || "Services",
        formatExpenseDate(i.date),
        money(i.amount),
        i.status || "Received",
      ]),
    },
    reports: {
      icon: ChartNoAxesCombined,
      desc: t("reports_desc", "Understand your station performance over time"),
      button: t("generate_report", "Generate report"),
      headers: [
        t("col_report", "Report"),
        t("col_period", "Period"),
        t("col_generated_by", "Generated by"),
        t("col_last_updated", "Last updated"),
        "",
      ],
      rows: [
        [t("report_daily_sales", "Daily sales summary"), "24 Jun 2025", "System", t("today", "Today"), t("ready", "Ready")],
        [t("report_monthly_pnl", "Monthly P&L"), "June 2025", "System", "Yesterday", t("ready", "Ready")],
        [t("report_fuel_inv", "Fuel inventory"), "Q2 2025", "System", "20 Jun 2025", t("ready", "Ready")],
      ],
    },
  };
  if (page === "expenses") {
    const effectiveSearch = expenseSearch || search;
    const filtered = filterExpenses(expenses, effectiveSearch, expenseRange);
    const total = filtered.reduce((sum, e) => sum + e.amount, 0);
    return (
      <>
        <PageHeading
          Icon={WalletCards}
          title={t("expenses_title", "Expenses")}
          desc={t("expenses_desc", "Keep track of station operating costs")}
          button={t("add_expense", "Add expense")}
          onClick={() => setModal("expense")}
        />
        <div className="expense-summary-strip">
          <div>
            <span>{t("total_expense", "Total Expense")}</span>
            <strong className="expense-total">{money(total)}</strong>
          </div>
          <div>
            <span>{t("matching_records", "Matching records")}</span>
            <strong className="expense-count">{filtered.length}</strong>
          </div>
          <label className="expense-range-control">
            {t("sales_period", "Expense range")}
            <select
              value={expenseRange}
              onChange={(e) => setExpenseRange(e.target.value)}
            >
              <option value="today">{t("range_today", "Today's Expense")}</option>
              <option value="week">{t("range_week", "Weekly Expense")}</option>
              <option value="month">{t("range_month", "Monthly Expense")}</option>
            </select>
          </label>
        </div>
        <div className="card table-page">
          <div className="table-toolbar">
            <div>
              <h2>{t("expenses_title", "Expense register")}</h2>
              <p>{t("expenses_desc", "Click any expense for complete details.")}</p>
            </div>
            <div className="table-search search">
              <Search size={15} />
              <input
                value={expenseSearch}
                onChange={(e) => setExpenseSearch(e.target.value)}
                placeholder={t("search_expenses", "Search expenses")}
              />
            </div>
          </div>
          <div className="table-wrap desktop-table-only">
            <table>
              <thead>
                <tr>
                  {[
                    t("expenses_title", "Expense"),
                    t("col_category", "Category"),
                    t("col_date", "Date"),
                    t("col_amount", "Amount"),
                    t("col_paid_by", "Payment method"),
                    "",
                  ].map((h, idx) => (
                    <th key={idx}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr
                    className="clickable-row"
                    key={`${e.name}-${e.date}`}
                    onClick={() =>
                      setModalDetail({ type: "expenseDetail", expense: e })
                    }
                  >
                    <td>
                      <strong className="row-title">{e.name}</strong>
                    </td>
                    <td>{e.category}</td>
                    <td>{formatExpenseDate(e.date)}</td>
                    <td>{money(e.amount)}</td>
                    <td>{e.paymentMethod}</td>
                    <td>
                      <button
                        className="more"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setModalDetail({ type: "expenseDetail", expense: e });
                        }}
                      >
                        <MoreHorizontal size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mobile-cards-only">
            {filtered.map((e) => (
              <div
                key={`${e.name}-${e.date}`}
                className="mobile-record-card clickable"
                onClick={() => setModalDetail({ type: "expenseDetail", expense: e })}
              >
                <div className="mobile-record-header">
                  <strong className="row-title">{e.name}</strong>
                  <span className="status neutral">{e.category}</span>
                </div>
                <div className="mobile-record-body">
                  <div className="mobile-record-field">
                    <span>{t("col_date", "Date")}</span>
                    <small>{formatExpenseDate(e.date)}</small>
                  </div>
                  <div className="mobile-record-field">
                    <span>{t("col_amount", "Amount")}</span>
                    <b style={{ color: "#ef4444" }}>{money(e.amount)}</b>
                  </div>
                  <div className="mobile-record-field">
                    <span>{t("col_paid_by", "Payment method")}</span>
                    <span>{e.paymentMethod}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {!filtered.length && (
            <p className="empty-state">
              {t("no_expenses", "No expenses match the selected range and search.")}
            </p>
          )}
        </div>
      </>
    );
  }
  if (page === "people") {
    // Same card layout as Expenses. `employees` is already shift-filtered upstream; this only searches/sorts it.
    const p = configs.people;
    const shown = filterAndSortEmployees(employees, peopleSearch || search, peopleSort);
    const pill = (status) => (
      <span className={"status " + (status === "Active" ? "success" : "neutral")}>{status}</span>
    );
    return (
      <>
        <PageHeading
          Icon={p.icon}
          title={t("employees_salaries", "Employees & salaries")}
          desc={p.desc}
          button={p.button}
          onClick={() => setModal("employee")}
        />
        <div className="card table-page employees-card">
          <div className="table-toolbar">
            <div>
              <h2>{t("employees_salaries", "Employees & salaries")}</h2>
              <p>{shown.length} {t("records", "records")}</p>
            </div>
            <div className="table-search search">
              <Search size={15} />
              <input
                value={peopleSearch}
                onChange={(e) => setPeopleSearch(e.target.value)}
                placeholder={t("search_records", "Search records...")}
                aria-label={t("search_records", "Search records...")}
              />
            </div>
          </div>
          <div className="table-wrap desktop-table-only">
            <table>
              <thead>
                <tr>
                  {p.headers.map((h, idx) => (
                    <th
                      key={idx}
                      aria-sort={peopleSort.key === idx ? (peopleSort.dir === "asc" ? "ascending" : "descending") : "none"}
                    >
                      <button
                        type="button"
                        className={"th-sort" + (peopleSort.key === idx ? " active" : "")}
                        onClick={() => setPeopleSort((s) => nextSort(s, idx))}
                      >
                        {h}
                        <span className="sort-arrow" aria-hidden="true">{sortArrow(peopleSort, idx)}</span>
                      </button>
                    </th>
                  ))}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r, i) => (
                  <tr key={`${r[0]}-${i}`}>
                    <td><strong className="row-title">{r[0]}</strong></td>
                    <td>{r[1]}</td>
                    <td>{r[2]}</td>
                    <td>{pill(r[3])}</td>
                    <td>{r[4]}</td>
                    <td>
                      <button className="more" type="button">
                        <MoreHorizontal size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mobile-cards-only">
            {shown.map((r, i) => (
              <div key={`${r[0]}-${i}`} className="mobile-record-card">
                <div className="mobile-record-header">
                  <strong className="row-title">{r[0]}</strong>
                  {pill(r[3])}
                </div>
                <div className="mobile-record-body">
                  <div className="mobile-record-field"><span>{p.headers[1]}</span><b>{r[1]}</b></div>
                  <div className="mobile-record-field"><span>{p.headers[2]}</span><b>{r[2]}</b></div>
                  <div className="mobile-record-field"><span>{p.headers[4]}</span><b>{r[4]}</b></div>
                </div>
              </div>
            ))}
          </div>

          {!shown.length && (
            <p className="empty-state">
              {employees.length
                ? t("no_employees_match", "No employees match your search.")
                : "No records found in the database."}
            </p>
          )}
        </div>
      </>
    );
  }
  const c = configs[page] || configs.people;
  const Icon = c.icon;
  const pageTitle = page === "people" ? t("employees_salaries", "Employees & salaries") : titleCase(page);
  return (
    <>
      <PageHeading
        Icon={Icon}
        title={pageTitle}
        desc={c.desc}
        button={c.button}
        onClick={() => setModal(page === "people" ? "employee" : page)}
      />
      <Table headers={c.headers} rows={c.rows} />
    </>
  );
}
function PageHeading({ Icon, title, desc, button, onClick }) {
  const { t } = useLanguage();
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">
          <Icon size={15} /> {t("station_management", "STATION MANAGEMENT")}
        </div>
        <h1>{title}</h1>
        <p>{desc}</p>
      </div>
      <button className="button primary" onClick={onClick}>
        <Plus size={18} />
        {button}
      </button>
    </div>
  );
}
function ShiftPage({ setModal }) {
  const { api, tanks, overview, reload, refreshAll, userName, session } = useTanks();
  const { t } = useLanguage();
  const [shiftDialog, setShiftDialog] = useState(false);
  const [dbRows, setDbRows] = useState(null);
  const perms = overview ? overview.permissions : {};
  const userRole = overview?.viewer?.role || 'owner';
  const isAdminOrOwner = userRole === 'owner' || userRole === 'admin';
  const isManager = !isAdminOrOwner;

  const loadReconciliation = useCallback(() => {
    if (api?.getShiftReconciliation) {
      api.getShiftReconciliation().then((res) => {
        if (res && res.length) setDbRows(res);
      }).catch(() => { });
    }
  }, [api]);

  useEffect(() => {
    loadReconciliation();
  }, [loadReconciliation]);

  const liveTotalStock = (tanks || []).reduce((sum, t) => sum + (Number(t.currentStock) || 0), 0);
  const liveDispensed = (tanks || []).reduce((sum, t) => sum + (Number(t.todayDispensed) || 0), 0);
  const activeShiftNum = (Number(overview?.openShift?.shiftNumber || 1) % 2 === 0) ? 2 : 1;
  const activeShiftName = activeShiftNum === 1 ? 'Shift 1 - Day' : 'Shift 2 - Night';
  const activeHours = activeShiftNum === 1 ? '07:00 - 19:00' : '19:00 - 07:00';
  const dynamicStaff = activeShiftNum === 1 ? 'Fahad Iqbal' : 'Hamza Raza';
  const activeShiftRow = overview?.openShift ? [
    activeShiftName,
    userName || dynamicStaff,
    activeHours,
    liveTotalStock + liveDispensed,
    0,
    liveTotalStock + liveDispensed,
    liveDispensed,
    liveTotalStock,
    "Open",
    session?.user?.id
  ] : null;

  const rows = (dbRows && dbRows.length > 0)
    ? dbRows
    : (activeShiftRow ? [activeShiftRow] : []);

  const displayedRows = isManager
    ? rows.filter(r => {
      const person = String(r[1] || '').toLowerCase();
      const me = String(userName || '').toLowerCase();
      const closedBy = r[9];
      const isCurrentOpen = r[8] === 'Open';
      const matchesUser = (closedBy && session?.user?.id && closedBy === session.user.id) ||
        (me && person.includes(me)) ||
        (me && person.includes(me.split(' ')[0]));
      return isCurrentOpen || matchesUser;
    })
    : rows;

  return (
    <>
      <PageHeading
        Icon={ReceiptText}
        title={t("shifts_title", "Shift closing")}
        desc={t("shifts_page_desc", "Close a shift with stock movement and 12-hour sales")}
        button={t("close_shift", "Close shift")}
        onClick={() => setShiftDialog(true)}
      />
      <div className="shift-flow">
        <div>
          <span>Shift 1 closing</span>
          <strong>-&gt; Shift 2 opening</strong>
        </div>
        <Link2 size={18} />
        <div>
          <span>Shift 2 closing</span>
          <strong>-&gt; next Shift 1 opening</strong>
        </div>
      </div>
      <div className="card table-card shift-table">
        <div className="card-head">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <h2>{isManager ? t("my_shift_reconciliation", "My Shift Reconciliation") : t("shift_stock_reconciliation", "12-hour stock reconciliation")}</h2>
              <span className={`status ${isAdminOrOwner ? 'success' : 'info'}`} style={{ fontSize: '11px', padding: '2px 8px' }}>
                {isAdminOrOwner ? "Admin / Owner: All Shifts" : `Manager: ${userName}`}
              </span>
            </div>
            <p>
              {isManager
                ? "Filtered to shifts assigned to or closed by you, plus active shift on duty."
                : "Continuous 12-hour stock reconciliation ledger across Day and Night shifts."}
            </p>
          </div>
        </div>
        <div className="table-wrap desktop-table-only">
          <table>
            <thead>
              <tr>
                {[
                  "Shift",
                  "Assigned to",
                  "Hours",
                  "Opening stock",
                  "Purchases",
                  "Total stock",
                  "12-hour sales",
                  "Closing stock",
                  "Gain / loss",
                  "Status",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayedRows.map((r) => {
                const [
                  name,
                  person,
                  hours,
                  opening,
                  purchases,
                  total,
                  sales,
                  closing,
                  status,
                ] = r;
                const variance = closing - (total - sales);
                return (
                  <tr key={name}>
                    <td>
                      <strong className="row-title">{name}</strong>
                    </td>
                    <td>{person}</td>
                    <td>{hours}</td>
                    <td>{liters(opening)}</td>
                    <td>{liters(purchases)}</td>
                    <td>{liters(total)}</td>
                    <td>{liters(sales)}</td>
                    <td>
                      <strong>{liters(closing)}</strong>
                    </td>
                    <td>
                      <span className="gain-zero">
                        {variance > 0 ? "+" : ""}
                        {liters(variance)}
                      </span>
                    </td>
                    <td>
                      <span
                        className={
                          "status " +
                          (status === "Completed" ? "success" : "warning")
                        }
                      >
                        {status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!displayedRows.length && (
            <p className="empty-state">
              {isManager
                ? "No shifts assigned to or closed by your account yet. Use 'Close shift' to record your shift reconciliation."
                : "No shift closings recorded yet in the database. Use 'Close shift' to record shift closings."}
            </p>
          )}
        </div>

        <div className="mobile-cards-only">
          {displayedRows.map((r) => {
            const [
              name,
              person,
              hours,
              opening,
              purchases,
              total,
              sales,
              closing,
              status,
            ] = r;
            const variance = closing - (total - sales);
            return (
              <div key={name} className="mobile-record-card">
                <div className="mobile-record-header">
                  <strong className="row-title">{name}</strong>
                  <span className={"status " + (status === "Completed" ? "success" : "warning")}>
                    {status}
                  </span>
                </div>
                <div className="mobile-record-body">
                  <div className="mobile-record-field">
                    <span>Assigned to</span>
                    <b>{person}</b>
                  </div>
                  <div className="mobile-record-field">
                    <span>Hours</span>
                    <small>{hours}</small>
                  </div>
                  <div className="mobile-record-field">
                    <span>Opening stock</span>
                    <b>{liters(opening)}</b>
                  </div>
                  <div className="mobile-record-field">
                    <span>Purchases</span>
                    <b>{liters(purchases)}</b>
                  </div>
                  <div className="mobile-record-field">
                    <span>Total stock</span>
                    <b>{liters(total)}</b>
                  </div>
                  <div className="mobile-record-field">
                    <span>12-hour sales</span>
                    <b>{liters(sales)}</b>
                  </div>
                  <div className="mobile-record-field">
                    <span>Closing stock</span>
                    <strong style={{ color: "var(--amber, #0284c7)" }}>{liters(closing)}</strong>
                  </div>
                  <div className="mobile-record-field">
                    <span>Gain / loss</span>
                    <span className="gain-zero">
                      {variance > 0 ? "+" : ""}{liters(variance)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
          {!displayedRows.length && (
            <p className="empty-state">
              {isManager
                ? "No shifts assigned to or closed by your account yet. Use 'Close shift' to record your shift reconciliation."
                : "No shift closings recorded yet in the database. Use 'Close shift' to record shift closings."}
            </p>
          )}
        </div>
      </div>
      <div className="formula-note">
        <Gauge size={18} />
        <span>
          <strong>Opening stock is linked automatically.</strong> A completed
          Shift 1 closing carries into Shift 2 opening; Shift 2 closing carries
          into the next Shift 1 opening.{dbRows && dbRows.length ? " Reconciled shift records loaded from database." : " Current shift snapshot shown above."}
        </span>
      </div>
      {shiftDialog && (
        <ShiftClosingModal
          tanks={tanks ?? []}
          openShift={overview?.openShift ?? null}
          focusTankId={null}
          api={api}
          onClose={() => setShiftDialog(false)}
          onDone={() => { setShiftDialog(false); refreshAll(); loadReconciliation(); }}
          onRefresh={() => { refreshAll(); loadReconciliation(); }}
          perms={perms}
        />
      )}
    </>
  );
}

function useShiftReminder(onRemind) {
  useEffect(() => {
    let timeout;
    function schedule() {
      const ms = msUntilNextShiftEnd();
      timeout = setTimeout(() => {
        onRemind();
        schedule();
      }, ms);
    }
    schedule();
    return () => clearTimeout(timeout);
  }, [onRemind]);
}

function ShiftReminderModal({ shift, onDone }) {
  const { api, tanks, overview, refreshAll } = useTanks();
  const [closing, setClosing] = useState(false);
  const perms = overview ? overview.permissions : {};
  return (
    <>
      {!closing && (
        <div className="modal-layer">
          <div
            className="modal"
            onMouseDown={(e) => e.stopPropagation()}
            style={{ maxWidth: 420 }}
          >
            <div className="modal-top">
              <div className="modal-mark">
                <Clock3 size={19} />
              </div>
            </div>
            <h2>Time to close {shift.name}</h2>
            <p>
              It's {shift.hours.split(" - ")[1]} — {shift.name} has ended.
              Please close the shift and record meter readings before the next
              shift begins.
            </p>
            <div className="modal-actions">
              <button
                className="button primary"
                onClick={() => setClosing(true)}
              >
                <ReceiptText size={16} /> Close shift now
              </button>
            </div>
          </div>
        </div>
      )}
      {closing && (
        <ShiftClosingModal
          tanks={tanks}
          openShift={overview?.openShift ?? null}
          focusTankId={null}
          api={api}
          onClose={() => setClosing(false)}
          onDone={(msg) => {
            setClosing(false);
            refreshAll();
            onDone(msg);
          }}
          onRefresh={() => refreshAll()}
          perms={perms}
        />
      )}
    </>
  );
}

// ---------- NotificationPanel component ----------
function NotificationPanel({ onClose }) {
  const { notifications, markRead, markAllRead, clearAll, unreadCount } =
    useNotifications();
  const { t } = useLanguage();
  const ref = useRef(null);

  useEffect(() => {
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const timeAgo = (iso) => {
    const ms = Date.now() - new Date(iso).getTime();
    const m = Math.floor(ms / 60000);
    if (m < 1) return t("just_now", "Just now");
    if (m < 60) return `${m} ${t("m_ago", "m ago")}`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} ${t("h_ago", "h ago")}`;
    return `${Math.floor(h / 24)} ${t("d_ago", "d ago")}`;
  };

  const getNotifTitle = (n) => {
    if (n.id === "welcome") return t("notif_welcome_title", n.title);
    if (n.id === "price-tip") return t("notif_price_title", n.title);
    if (n.id.startsWith("shift-")) return t("notif_shift_title", n.title);
    return n.title;
  };

  const getNotifMsg = (n) => {
    if (n.id === "welcome") return t("notif_welcome_msg", n.message);
    if (n.id === "price-tip") return t("notif_price_msg", n.message);
    if (n.id.startsWith("shift-")) return t("notif_shift_msg", n.message);
    return n.message;
  };

  const iconFor = (type) => {
    if (type === "warning") return <AlertTriangle size={15} />;
    if (type === "success") return <CircleCheck size={15} />;
    return <Bell size={15} />;
  };

  return (
    <div className="notif-panel" ref={ref} role="dialog" aria-label={t("notifications", "Notifications")}>
      <div className="notif-panel-head">
        <strong>
          {t("notifications", "Notifications")}{" "}
          {unreadCount > 0 && (
            <span className="notif-head-badge">{unreadCount}</span>
          )}
        </strong>
        <div className="notif-head-actions">
          {unreadCount > 0 && (
            <button className="link-btn tiny" onClick={markAllRead}>
              {t("mark_all_read", "Mark all read")}
            </button>
          )}
          {notifications.length > 0 && (
            <button className="link-btn tiny" onClick={clearAll}>
              {t("clear_all", "Clear all")}
            </button>
          )}
        </div>
      </div>

      {notifications.length === 0 ? (
        <p className="notif-empty">{t("no_notifications", "You are all caught up!")}</p>
      ) : (
        <div className="notif-list">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={"notif-item notif-" + n.type + (n.read ? " notif-read" : "")}
              onClick={() => markRead(n.id)}
              role="button"
              tabIndex={0}
            >
              <div className={"notif-icon-wrap notif-icon-" + n.type}>
                {iconFor(n.type)}
              </div>
              <div className="notif-body">
                <strong>{getNotifTitle(n)}</strong>
                <p>{getNotifMsg(n)}</p>
                <span className="notif-time">{timeAgo(n.time)}</span>
              </div>
              {!n.read && <span className="notif-dot" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------

function titleCase(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function Table({ headers, rows }) {
  return (
    <>
      <div className="table-wrap desktop-table-only">
        <table>
          <thead>
            <tr>
              {headers.map((h) => (
                <th key={h}>{h}</th>
              ))}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((v, j) => (
                  <td key={j}>
                    {j === 0 ? (
                      <strong className="row-title">{v}</strong>
                    ) : j === r.length - 1 &&
                      [
                        "Paid",
                        "Completed",
                        "Approved",
                        "Received",
                        "Ready",
                        "Active",
                        "Good",
                        "Open",
                        "Pending",
                      ].includes(v) ? (
                      <span
                        className={
                          "status " +
                          ([
                            "Completed",
                            "Approved",
                            "Received",
                            "Ready",
                            "Active",
                            "Good",
                          ].includes(v)
                            ? "success"
                            : "warning")
                        }
                      >
                        {v}
                      </span>
                    ) : (
                      v
                    )}
                  </td>
                ))}
                <td>
                  <button className="more">
                    <MoreHorizontal size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <p className="empty-state">No records found in the database.</p>
        )}
      </div>

      <div className="mobile-cards-only">
        {rows.map((r, i) => {
          const title = r[0];
          const statusVal = r.find((v) =>
            [
              "Paid",
              "Completed",
              "Approved",
              "Received",
              "Ready",
              "Active",
              "Good",
              "Open",
              "Pending",
              "Inactive",
            ].includes(v)
          );

          return (
            <div key={i} className="mobile-record-card">
              <div className="mobile-record-header">
                <strong className="row-title">{title}</strong>
                {statusVal && (
                  <span
                    className={
                      "status " +
                      ([
                        "Completed",
                        "Approved",
                        "Received",
                        "Ready",
                        "Active",
                        "Good",
                      ].includes(statusVal)
                        ? "success"
                        : "warning")
                    }
                  >
                    {statusVal}
                  </span>
                )}
              </div>
              <div className="mobile-record-body">
                {r.slice(1).map((val, idx) => {
                  if (val === statusVal) return null;
                  const headerLabel = headers[idx + 1] || "";
                  return (
                    <div key={idx} className="mobile-record-field">
                      <span>{headerLabel}</span>
                      <b>{val}</b>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {!rows.length && (
          <p className="empty-state">No records found in the database.</p>
        )}
      </div>
    </>
  );
}
function Modal({
  type,
  close,
  notify,
  onSaveExpense,
  onSaveIncome,
  onSaveEmployee,
  expense,
  income,
}) {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Bank transfer");
  const [date, setDate] = useState(getKarachiTodayISO());
  if (type === "expenseDetail" || type === "incomeDetail") {
    const record = type === "expenseDetail" ? expense : income;
    return (
      <div className="modal-layer" onMouseDown={close}>
        <div
          className="modal detail-modal"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="modal-top">
            <div className="modal-mark">
              {type === "expenseDetail" ? (
                <WalletCards size={19} />
              ) : (
                <Banknote size={19} />
              )}
            </div>
            <button onClick={close}>
              <X size={19} />
            </button>
          </div>
          <h2>{record.name}</h2>
          <p>
            <span className="status success">{record.status || t("status_active", "Active")}</span>
          </p>
          <div className="detail-grid">
            {[
              [t("col_category", "Category"), record.category],
              [t("col_date", "Date"), formatExpenseDate(record.date)],
              [t("col_amount", "Amount"), money(record.amount)],
              [t("payment_method", "Payment method"), record.paymentMethod],
              [t("col_status", "Status"), record.status || t("status_active", "Active")],
              [t("col_description", "Description"), record.description],
            ]
              .filter(([, value]) => value)
              .map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
          </div>
          <div className="modal-actions">
            <button className="button primary" onClick={close}>
              {t("done", "Done")}
            </button>
          </div>
        </div>
      </div>
    );
  }
  const labels = {
    shift: [
      t("close_shift", "Close shift"),
      t("shifts_page_desc", "Record opening, purchases, 12-hour sales and closing stock."),
      t("shift_title", "Shift name"),
      t("shift_afternoon", "Afternoon shift"),
    ],
    tank: [t("add_tank", "Add tank"), t("add_tank_desc", "Add a tank configuration."), t("col_tank", "Tank name"), "Tank 4"],
    expense: [
      t("add_expense", "Add expense"),
      t("expenses_desc", "Log a station cost to the expense register."),
      t("col_description", "Expense name"),
      "e.g. Equipment maintenance",
    ],
    income: [
      t("add_income", "Add other income"),
      t("income_desc", "Capture revenue beyond fuel sales."),
      t("col_source", "Income source"),
      "e.g. Car wash",
    ],
    employee: [
      t("add_employee", "Add employee"),
      t("employees_desc", "Add a station staff member."),
      t("col_employee", "Full name"),
      "e.g. Imran Shah",
    ],
  };
  const x = labels[type] || labels.expense;
  return (
    <div className="modal-layer" onMouseDown={close}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-top">
          <div className="modal-mark">
            <Plus size={19} />
          </div>
          <button onClick={close}>
            <X size={19} />
          </button>
        </div>
        <h2>{x[0]}</h2>
        <p>{x[1]}</p>
        <label>{x[2]}</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={x[3]}
        />
        {type === "employee" && (
          <>
            <label>{t("col_role", "Designation / Role")}</label>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Pump attendant, Cashier, Manager"
            />
            <label>{t("col_salary", "Monthly Salary (PKR)")}</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 38000"
            />
          </>
        )}
        {type === "shift" && (
          <>
            <label>{t("opening_stock", "Opening stock (linked)")}</label>
            <input placeholder="From previous shift closing" />
            <label>{t("twelve_hour_sales", "12-hour sales")}</label>
            <input placeholder="e.g. 1,450 L" />
            <label>{t("closing_stock", "Closing stock")}</label>
            <input placeholder="Total stock - 12-hour sales" />
          </>
        )}
        {type === "tank" && (
          <>
            <label>{t("capacity", "Capacity")}</label>
            <input placeholder="e.g. 42,750" />
            <label>{t("dip_calibration", "Dip / calibration")}</label>
            <input placeholder="e.g. 1,500 mm - 1 mm = 23.8 L" />
          </>
        )}
        {type !== "employee" && type !== "shift" && type !== "tank" && (
          <>
            <label>{t("col_category", "Category")}</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">{t("select_category", "Select a category")}</option>
              <option>Operations</option>
              <option>Services</option>
              <option>Maintenance</option>
              <option>Utilities</option>
              <option>Inventory</option>
            </select>
            {(type === "expense" || type === "income") && (
              <>
                <label>{t("col_amount", "Amount (PKR)")}</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="e.g. 12500"
                />
                <label>{t("col_date", "Date")}</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
                {type === "expense" && (
                  <>
                    <label>{t("payment_method", "Payment method")}</label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                    >
                      <option>Bank transfer</option>
                      <option>Cash</option>
                      <option>Card</option>
                    </select>
                  </>
                )}
                <label>{t("col_description", "Description")}</label>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What was this record for?"
                />
              </>
            )}
          </>
        )}
        <div className="modal-actions">
          <button className="button secondary" onClick={close}>
            {t("cancel", "Cancel")}
          </button>
          <button
            className="button primary"
            onClick={() => {
              if (type === "expense" && onSaveExpense)
                onSaveExpense({
                  name: name || "Untitled expense",
                  category: category || "Operations",
                  date,
                  amount: Number(amount) || 0,
                  paymentMethod,
                  description: description || "No description provided.",
                });
              else if (type === "income" && onSaveIncome)
                onSaveIncome({
                  name: name || "Untitled income",
                  category: category || "Services",
                  date,
                  amount: Number(amount) || 0,
                  status: "Received",
                  description: description || "No description provided.",
                });
              else if (type === "employee" && onSaveEmployee)
                onSaveEmployee({
                  name: name || "New Employee",
                  designation: category || "Pump attendant",
                  salary: Number(amount) || 0,
                });
              else {
                close();
                notify(x[0] + " saved");
              }
            }}
          >
            <CircleCheck size={17} /> {t("save", "Save")}
          </button>
        </div>
      </div>
    </div>
  );
}

function SalesOverviewChart({ sales, canSeeSales, period, setPeriod }) {
  const chart = buildChart(
    canSeeSales && sales ? sales.series : [],
    period === "daily" ? 7 : period === "weekly" ? 14 : 31,
  );
  const periodDays = { daily: 7, weekly: 14, monthly: 31 };
  const rangeLabel = { daily: "Last 7 days", weekly: "Last 14 days", monthly: "Last 31 days" };

  return (
    <section className="card chart-card">
      <div className="card-head">
        <div>
          <h2>Sales overview</h2>
          <p>
            {canSeeSales
              ? chart.empty
                ? "No fuel sales recorded yet — revenue appears after the first shift closing"
                : `Fuel sales revenue (PKR) across the station — ${rangeLabel[period]}`
              : "Sales revenue is visible to owner / admin only"}
          </p>
        </div>
        <label className="period-selector" style={{ marginTop: 0 }}>
          <div className="select">
            <select value={period} onChange={(e) => setPeriod(e.target.value)}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            <ChevronDown size={14} />
          </div>
        </label>
      </div>
      <div className="chart-legend">
        <span><i className="dot blue" />Revenue</span>
        <span><i className="dot amber" />Fuel volume</span>
      </div>
      <div className="chart">
        <div className="y-labels">
          {chart.ticks.map((t, i) => <span key={i}>{t}</span>)}
        </div>
        <div className="chart-area">
          <div className="gridlines" />
          <svg viewBox="0 0 700 230" preserveAspectRatio="none" style={{ top: 4, height: "calc(100% - 28px)" }}>
            <defs>
              <linearGradient id="flow-chart-gradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#2d75df" stopOpacity=".35" />
                <stop offset=".72" stopColor="#ffb41f" stopOpacity=".16" />
                <stop offset="1" stopColor="#ffb41f" stopOpacity=".03" />
              </linearGradient>
            </defs>
            {chart.revenueArea && <path className="chart-fill" d={chart.revenueArea} />}
            {chart.revenuePath && <path className="chart-stroke" d={chart.revenuePath} />}
            {chart.litresPath && <path className="chart-line-litres" d={chart.litresPath} />}
          </svg>
          <div className="x-labels">
            {chart.xLabels.map((d) => (
              <span key={d}>
                {formatKarachiDate(new Date(`${d}T12:00:00+05:00`), { year: undefined })}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function FlowAIFAB({ userName, expenses, income, employees, today, notify, onNavigate }) {
  const [open, setOpen] = useState(false);
  const { sales, tanks, overview } = useTanks();
  const [shiftReconciliation, setShiftReconciliation] = useState([]);
  const { api } = useTanks();

  const userRole = overview?.viewer?.role || 'owner';
  const isOwnerOrAdmin = userRole === 'owner' || userRole === 'admin';
  if (!isOwnerOrAdmin) return null;

  useEffect(() => {
    if (api?.getShiftReconciliation) {
      api.getShiftReconciliation().then((res) => {
        if (res && res.length) setShiftReconciliation(res);
      }).catch(() => { });
    }
  }, [api]);

  return (
    <>
      {/* Floating button */}
      <button
        className={"ai-fab" + (open ? " ai-fab-open" : "")}
        onClick={() => setOpen((v) => !v)}
        aria-label="Flow AI Agent"
      >
        {open ? <X size={22} /> : <Sparkles size={22} />}
        {!open && <span className="ai-fab-label">AI</span>}
      </button>

      {/* Slide-up panel */}
      {open && (
        <div className="ai-fab-panel">
          <FlowAIAgent
            userName={userName}
            sales={sales}
            tanks={tanks}
            income={income}
            expenses={expenses}
            employees={employees}
            shiftReconciliation={shiftReconciliation}
            overview={overview}
            today={today}
            notify={notify}
            onNavigate={(pageId) => {
              if (onNavigate) onNavigate(pageId);
              setOpen(false);
            }}
          />
        </div>
      )}
    </>
  );
}

createRoot(document.getElementById("root")).render(
  <LanguageProvider>
    <NotificationProvider>
      <AuthProvider>
        <AuthGate>
          <TankDataProvider>
            <App />
          </TankDataProvider>
        </AuthGate>
      </AuthProvider>
    </NotificationProvider>
  </LanguageProvider>,
);
