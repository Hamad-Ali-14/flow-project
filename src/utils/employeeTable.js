// Search + sort for the Employees & salaries table.
// Rows are arrays: [name, role, shift, status, salary]. This only works on the rows it is given,
// so any shift filtering done upstream (owner = all shifts, manager = own shift) is untouched.

export const SALARY_COLUMN = 4;

function sortValue(row, col) {
  const v = Array.isArray(row) ? row[col] : '';
  if (col === SALARY_COLUMN) return Number(String(v ?? '').replace(/[^0-9.-]/g, '')) || 0; // "PKR 38,000" -> 38000
  return String(v ?? '').toLowerCase();
}

export function filterAndSortEmployees(rows, query, sort) {
  let out = Array.isArray(rows) ? rows : [];
  const q = String(query ?? '').trim().toLowerCase();
  if (q) out = out.filter((r) => Array.isArray(r) && r.some((v) => String(v ?? '').toLowerCase().includes(q)));
  if (sort && sort.key != null) {
    const dir = sort.dir === 'desc' ? -1 : 1;
    out = [...out].sort((a, b) => {
      const x = sortValue(a, sort.key);
      const y = sortValue(b, sort.key);
      return (typeof x === 'number' ? x - y : x.localeCompare(y)) * dir;
    });
  }
  return out;
}

// Header click cycle: unsorted -> ascending -> descending -> unsorted.
export function nextSort(sort, key) {
  if (!sort || sort.key !== key) return { key, dir: 'asc' };
  if (sort.dir === 'asc') return { key, dir: 'desc' };
  return { key: null, dir: 'asc' };
}

// "↑↓" = not sorted by this column, "↑" = ascending, "↓" = descending.
export function sortArrow(sort, key) {
  if (!sort || sort.key !== key) return '↑↓';
  return sort.dir === 'desc' ? '↓' : '↑';
}
