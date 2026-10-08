import { formatMm, formatNozzleRange } from './formatters';

// Adapts shared tank records (useTanks) to the row shape reportExport.js already expects,
// so reports show exactly what the Tanks & nozzles page and Overview show.
export function toReportTanks(tanks = []) {
  return (tanks || []).map(t => ({
    ...t,
    id: t.name || t.id,
    name: t.name || t.id,
    product: t.fuelName || t.product,
    fuelName: t.fuelName || t.product,
    capacity: t.capacity,
    stock: t.currentStock,
    currentStock: t.currentStock,
    dip: t.dip ? formatMm(t.dip.mm) : '-',
    calibration: t.calibration ? `1 mm = ${t.calibration} L` : '-',
    nozzles: Array.isArray(t.nozzles) ? t.nozzles : [],
    nozzleRange: Array.isArray(t.nozzles)
      ? formatNozzleRange(t.nozzles.filter(n => n && n.active).map(n => n.nozzleNumber))
      : '-',
    status: `${t.statusLabel || 'Healthy'} (${Math.round(t.percentage || 0)}%)`,
  }));
}
