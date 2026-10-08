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

export { OWNER_ONLY_PAGES };
