// Single source of truth for role -> page access (used by the sidebar AND the page guard,
// so the two can never disagree).
//
// Page ids match the `page` state in main.jsx:
//   expenses -> /expenses, people -> /employees-salaries, income -> /other-income

export const OWNER_ROLES = ['owner', 'admin'];

// Pages every signed-in role can open.
const COMMON_PAGES = ['overview', 'shifts', 'station', 'settings'];

// Station ledgers that Managers now share with the Owner.
export const MANAGER_LEDGER_PAGES = ['expenses', 'people', 'income', 'attendance', 'payroll'];

// Pages that stay Owner/Admin only (executive reporting).
const OWNER_ONLY_PAGES = ['reports'];

export function isOwnerRole(role) {
  return OWNER_ROLES.includes(role);
}

// Anything that is not owner/admin keeps the existing "manager-style" UI (limited avatar menu, etc.).
export function isManagerStyleRole(role) {
  return !isOwnerRole(role);
}

export function canAccessPage(role, pageId) {
  if (isOwnerRole(role)) return true;
  if (COMMON_PAGES.includes(pageId)) return true;
  if (role === 'manager' && MANAGER_LEDGER_PAGES.includes(pageId)) return true;
  return false; // reports, plus ledgers for supervisor/attendant
}

// Keeps the Owner's order, icons and labels; just drops the entries the role may not open.
export function filterNavForRole(role, navItems) {
  return navItems.filter((n) => canAccessPage(role, n.id));
}

// ---------------------------------------------------------------------------------------------
// Shift scope (Attendance + Employees & salaries)
//
//   owner / admin  -> { scoped: false }: every employee, every shift, including General (no shift)
//   manager        -> { scoped: true, shiftId, shiftName }: only employees of their own shift
//   anyone else    -> scoped with no shift: sees nothing
//
// The database enforces the same rule (employee_scope_ok / RLS, see
// database/migration_rbac_shift_scope.sql); these helpers keep the screens honest too, and they
// FAIL CLOSED: a manager without an assigned shift, or an entry without a shift id, is never shown.
// ---------------------------------------------------------------------------------------------
export function buildShiftScope({ role = null, shiftId = null, shiftName = null } = {}) {
  if (isOwnerRole(role)) return { role, scoped: false, shiftId: null, shiftName: null };
  return { role, scoped: true, shiftId: shiftId || null, shiftName: shiftName || null };
}

// Is an employee-like entry ({ shiftId }) inside `scope`?
export function employeeInScope(scope, entry = {}) {
  if (!scope || !scope.scoped) return true;
  if (!scope.shiftId) return false;
  const id = entry.shiftId ?? entry.shift_id ?? null;
  return Boolean(id) && String(id) === String(scope.shiftId);
}

// Generic list filter: owner / admin get the list back untouched (same reference).
export function filterByShiftScope(scope, items, pick = (x) => x) {
  if (!scope || !scope.scoped) return items || [];
  return (items || []).filter((x) => employeeInScope(scope, pick(x) || {}));
}

export { OWNER_ONLY_PAGES };
