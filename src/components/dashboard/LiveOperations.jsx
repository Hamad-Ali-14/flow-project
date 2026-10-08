import React from 'react';
import {
  Gauge,
  Fuel,
  Receipt,
  CheckCircle,
  Clock,
  AlertTriangle,
  UserCheck,
  ShieldCheck,
} from 'lucide-react';
import { get_nozzle_performance, get_cash_reconciliation } from '../../utils/flowAiTools';
import { formatPKR, formatLiters } from '../../utils/formatters';

export default function LiveOperations({
  tanks = [],
  employees = [],
  overview,
  shiftReconciliation = [],
  t = (k, f) => f,
}) {
  // Strictly hide deactivated fuel tanks and disabled nozzles
  const activeTanks = (tanks || []).filter(t => t.active !== false && t.is_active !== false && !t.is_disabled);
  const nozzleData = get_nozzle_performance({ tanks: activeTanks, employees });
  const reconData = get_cash_reconciliation({ overview, shiftReconciliation, tanks: activeTanks });
  const activeNozzles = (nozzleData.nozzles || []).filter((n) => n.active !== false && n.is_active !== false && !n.is_disabled);

  return (
    <section className="card live-ops-card">
      <div className="card-head">
        <div>
          <div className="live-badge-row">
            <h2>Live Operations</h2>
            <span className="live-pulse-badge">
              <span className="dot-pulse green" /> Station Online
            </span>
          </div>
          <p>Real-time pump totalizers, active dispenser throughput, and shift cash verifications</p>
        </div>
      </div>

      <div className="live-ops-content">
        {/* Subsection A: Active Nozzles / Pump Status */}
        <div className="live-subsection">
          <div className="subhead-row">
            <h3>
              <Fuel size={16} /> Active Nozzles &amp; Dispenser Status
            </h3>
            <span className="subhead-meta">
              {activeNozzles.length} Active Dispensers
            </span>
          </div>

          <div className="nozzles-strip-grid">
            {activeNozzles.map((nz) => {
              const isActive = nz.active && nz.todayDispensed > 0;
              const isStandby = nz.active && nz.todayDispensed === 0;

              return (
                <div
                  key={nz.id}
                  className={`nozzle-status-card ${isActive ? 'active-nozzle' : isStandby ? 'standby-nozzle' : 'idle-nozzle'}`}
                >
                  <div className="nozzle-top-line">
                    <span className="nozzle-tag">
                      Nozzle {nz.nozzleNumber} — <b>{nz.fuelCode}</b>
                    </span>
                    <span className={`nozzle-state-pill ${isActive ? 'state-active' : 'state-idle'}`}>
                      {isActive ? 'Active' : isStandby ? 'Standby' : 'Idle'}
                    </span>
                  </div>

                  <div className="nozzle-metrics">
                    <div className="nozzle-rev">
                      <strong>{formatPKR(nz.todayRevenue)}</strong>
                      <small>{formatLiters(nz.todayDispensed)} dispensed</small>
                    </div>
                  </div>

                  <div className="nozzle-attendant">
                    <UserCheck size={13} />
                    <span>Attendant: <strong>{nz.attendant}</strong></span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Subsection B: Shift Cash Reconciliation */}
        <div className="live-subsection">
          <div className="subhead-row">
            <h3>
              <Receipt size={16} /> Shift Cash Reconciliation
            </h3>
            <span className="subhead-meta">
              Total Recorded: {formatPKR(reconData.totalRecorded)}
            </span>
          </div>

          <div className="shift-recon-cards">
            {reconData.shifts.map((shift) => {
              const isClosed = shift.status.includes('Closed') || shift.status.includes('Completed');
              const hasDiff = shift.variance !== 0;

              return (
                <div
                  key={shift.id}
                  className={`shift-recon-row ${isClosed ? 'shift-closed' : 'shift-progress'}`}
                >
                  <div className="shift-main-info">
                    <div className="shift-name-group">
                      <strong>{shift.name}</strong>
                      <span className="shift-hours-badge">
                        <Clock size={12} /> {shift.hours}
                      </span>
                    </div>
                    <span className="shift-person">
                      Assigned: <b>{shift.attendant}</b>
                    </span>
                  </div>

                  <div className="shift-figures">
                    <div className="fig-item">
                      <span>Expected Sales</span>
                      <strong>{formatPKR(shift.expectedAmount)}</strong>
                    </div>
                    <div className="fig-item">
                      <span>Deposit Status</span>
                      <strong className={isClosed ? 'text-green' : 'text-amber'}>
                        {shift.depositStatus}
                      </strong>
                    </div>
                    <div className="fig-item">
                      <span>Variance</span>
                      <strong className={hasDiff ? 'text-red' : 'text-muted'}>
                        {hasDiff ? formatPKR(shift.variance) : 'PKR 0 (Balanced)'}
                      </strong>
                    </div>
                  </div>

                  <div className="shift-status-pill-wrap">
                    <span className={`recon-status-badge ${isClosed ? 'verified' : 'in-progress'}`}>
                      {isClosed ? <ShieldCheck size={14} /> : <Clock size={14} />}
                      {shift.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
