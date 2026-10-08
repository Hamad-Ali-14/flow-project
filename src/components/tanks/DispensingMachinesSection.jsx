import React, { useState } from 'react';
import { AlertTriangle, Check, CircleAlert, Fuel, Gauge, Info, Plus, Power, PowerOff, Settings2, ShieldCheck, Wrench, X } from 'lucide-react';
import { formatLiters, formatPKR } from '../../utils/formatters';
import { useLanguage } from '../../context/LanguageContext';

export default function DispensingMachinesSection({ machines = [], tanks = [], api, notify, refreshAll }) {
  const { t } = useLanguage();
  const [showAddMachine, setShowAddMachine] = useState(false);
  const [showAddNozzle, setShowAddNozzle] = useState(false);
  const [selectedMachineForNozzle, setSelectedMachineForNozzle] = useState('');
  const [confirmDialog, setConfirmDialog] = useState(null); // { type, item, action }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Form states
  const [machineNum, setMachineNum] = useState('');
  const [machineName, setMachineName] = useState('');
  const [nozzleNum, setNozzleNum] = useState('');
  const [nozzleTankId, setNozzleTankId] = useState('');
  const [initialMeter, setInitialMeter] = useState('0');

  // Collect all nozzles from tanks safely
  const safeTanks = Array.isArray(tanks) ? tanks : [];
  const allNozzles = safeTanks.flatMap(tank => (Array.isArray(tank?.nozzles) ? tank.nozzles : []).map(nz => ({
    ...nz,
    nozzleNumber: String(nz?.nozzleNumber ?? nz?.nozzle_number ?? ''),
    machineNumber: String(nz?.machineNumber ?? nz?.machine_number ?? 'M1').trim().toUpperCase(),
    tankName: tank?.name || 'Tank',
    fuelName: tank?.fuelName || '',
    tankId: tank?.id,
  })));

  // Safely extract machine number from any machine object (snake_case or camelCase)
  const getMachineNum = (m) => String(m?.machineNumber ?? m?.machine_number ?? '').trim().toUpperCase();

  const safeMachines = Array.isArray(machines) ? machines : [];
  const knownMachineNumbers = new Set(
    safeMachines.map(getMachineNum).filter(Boolean)
  );

  const derivedMachines = safeMachines.map(m => {
    const mn = getMachineNum(m) || 'M1';
    return {
      ...m,
      id: m?.id || `machine-${mn}`,
      machineNumber: mn,
      name: m?.name || `Dispenser ${mn}`,
      active: m?.active !== false,
      status: m?.status || 'working',
    };
  });

  allNozzles.forEach(nz => {
    const mn = getMachineNum(nz) || 'M1';
    if (mn && !knownMachineNumbers.has(mn)) {
      derivedMachines.push({
        id: `derived-${mn}`,
        machineNumber: mn,
        name: `Dispenser ${mn}`,
        active: true,
        status: 'working',
        isDerived: true,
      });
      knownMachineNumbers.add(mn);
    }
  });

    // Handle Add Machine
  const handleAddMachine = async (e) => {
    e.preventDefault();
    const cleanNum = machineNum.trim().toUpperCase();
    if (!cleanNum) {
      setError(t('error_machine_number_req', 'Machine number is required (e.g. M4).'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (api.addMachine) {
        await api.addMachine({ machineNumber: cleanNum, name: machineName.trim() });
      }
      notify(t('notif_machine_added', 'Dispensing machine {num} added successfully.').replace('{num}', cleanNum));
      setShowAddMachine(false);
      setMachineNum('');
      setMachineName('');
      await refreshAll();
    } catch (err) {
      setError(err.message || t('action_failed', 'Action failed: {err}').replace('{err}', ''));
    } finally {
      setBusy(false);
    }
  };

  // Handle Add Nozzle
  const handleAddNozzle = async (e) => {
    e.preventDefault();
    const cleanMNum = selectedMachineForNozzle.trim().toUpperCase();
    const cleanNNum = nozzleNum.trim();
    if (!cleanMNum) {
      setError(t('error_select_machine', 'Please select a dispensing machine.'));
      return;
    }
    if (!cleanNNum) {
      setError(t('error_nozzle_number_req', 'Nozzle number is required (e.g. 7).'));
      return;
    }
    if (!nozzleTankId) {
      setError(t('error_select_tank', 'Please select a fuel tank.'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (api.addNozzle) {
        await api.addNozzle({
          machineNumber: cleanMNum,
          nozzleNumber: cleanNNum,
          tankId: nozzleTankId,
          currentMeterReading: Number(initialMeter) || 0,
        });
      }
      notify(t('notif_nozzle_added', 'Nozzle {nozzle} added to Dispenser {machine}.').replace('{nozzle}', cleanNNum).replace('{machine}', cleanMNum));
      setShowAddNozzle(false);
      setNozzleNum('');
      setInitialMeter('0');
      await refreshAll();
    } catch (err) {
      setError(err.message || t('action_failed', 'Action failed: {err}').replace('{err}', ''));
    } finally {
      setBusy(false);
    }
  };

  // Toggle Machine Status (working <-> not_working)
  const toggleMachineStatus = async (machine) => {
    const nextStatus = machine.status === 'working' ? 'not_working' : 'working';
    setBusy(true);
    try {
      if (api.setMachineStatus) {
        await api.setMachineStatus({
          id: machine.id,
          machineNumber: machine.machineNumber,
          status: nextStatus,
        });
      }
      const statusText = nextStatus === 'working' ? t('working', 'Working') : t('not_working', 'Not Working');
      notify(t('notif_machine_status', 'Dispenser {num} status changed to {status}.').replace('{num}', machine.machineNumber).replace('{status}', statusText));
      await refreshAll();
    } catch (err) {
      notify(t('error_update_machine_status', 'Failed to update machine status: {err}').replace('{err}', err.message || ''));
    } finally {
      setBusy(false);
    }
  };

  // Toggle Nozzle Status (working <-> not_working)
  const toggleNozzleStatus = async (nozzle) => {
    const nextStatus = nozzle.status === 'working' ? 'not_working' : 'working';
    setBusy(true);
    try {
      if (api.setNozzleStatus) {
        await api.setNozzleStatus({
          id: nozzle.id,
          nozzleNumber: nozzle.nozzleNumber,
          status: nextStatus,
        });
      }
      const nzStatusText = nextStatus === 'working' ? t('working', 'Working') : t('not_working', 'Not Working');
      notify(t('notif_nozzle_status', 'Nozzle {num} marked as {status}.').replace('{num}', nozzle.nozzleNumber).replace('{status}', nzStatusText));
      await refreshAll();
    } catch (err) {
      notify(t('error_update_nozzle_status', 'Failed to update nozzle status: {err}').replace('{err}', err.message || ''));
    } finally {
      setBusy(false);
    }
  };

  // Toggle Active (Soft Deactivate / Activate)
  const handleToggleActive = async () => {
    if (!confirmDialog) return;
    const { type, item } = confirmDialog;
    setBusy(true);
    try {
      const nextActive = !item.active;
      const actionText = nextActive ? t('activated', 'activated') : t('deactivated', 'deactivated');
      if (type === 'machine' && api.toggleMachineActive) {
        await api.toggleMachineActive({
          id: item.id,
          machineNumber: item.machineNumber,
          active: nextActive,
        });
        const unitName = t('dispenser_label', 'Dispenser');
        notify(t('notif_unit_status', '{unit} {num} {action} successfully.').replace('{unit}', unitName).replace('{num}', item.machineNumber).replace('{action}', actionText));
      } else if (type === 'nozzle' && api.toggleNozzleActive) {
        await api.toggleNozzleActive({
          id: item.id,
          nozzleNumber: item.nozzleNumber,
          active: nextActive,
        });
        const unitName = t('nozzle_label', 'Nozzle');
        notify(t('notif_unit_status', '{unit} {num} {action} successfully.').replace('{unit}', unitName).replace('{num}', item.nozzleNumber).replace('{action}', actionText));
      }
      setConfirmDialog(null);
      await refreshAll();
    } catch (err) {
      notify(t('action_failed', 'Action failed: {err}').replace('{err}', err.message || ''));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="machines-management-section" style={{ marginTop: '36px', marginBottom: '36px' }}>
      <div className="section-intro" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2>{t('dispensing_machines', 'Dispensing Machines & Nozzles')}</h2>
          <p>{t('dispensing_machines_desc', 'Manage digital dispensers, active nozzles, working statuses, and preserve historical meter records.')}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              setError('');
              setShowAddNozzle(true);
              if (derivedMachines.length > 0 && !selectedMachineForNozzle) {
                setSelectedMachineForNozzle(derivedMachines[0].machineNumber);
              }
              if (safeTanks.length > 0 && !nozzleTankId) {
                setNozzleTankId(safeTanks[0].id);
              }
            }}
          >
            <Plus size={16} /> {t('add_nozzle', 'Add Nozzle')}
          </button>
          <button
            type="button"
            className="button primary"
            onClick={() => {
              setError('');
              setShowAddMachine(true);
            }}
          >
            <Plus size={16} /> {t('add_machine', 'Add Machine')}
          </button>
        </div>
      </div>

      {/* Grid of Machines */}
      <div className="machines-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px', marginTop: '16px' }}>
        {derivedMachines.map((machine) => {
          const machineNozzles = allNozzles.filter(
            (nz) => (nz.machineNumber || 'M1').toUpperCase() === machine.machineNumber.toUpperCase()
          );
          const isWorking = machine.status === 'working';
          const isActive = machine.active !== false;

          return (
            <div
              key={machine.id || machine.machineNumber}
              className={`card machine-card ${!isActive ? 'machine-card-inactive' : isWorking ? 'machine-card-working' : 'machine-card-warning'}`}
              style={{
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              {/* Machine Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '8px',
                      background: isWorking ? 'rgba(34, 197, 94, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: isWorking ? '#16a34a' : '#d97706',
                    }}
                  >
                    <Gauge size={20} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>
                      {machine.machineNumber}
                    </h3>
                    <small style={{ color: 'var(--muted)' }}>{machine.name}</small>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  {!isActive ? (
                    <span className="status neutral">{t('inactive', 'Inactive')}</span>
                  ) : (
                    <span className={'status ' + (isWorking ? 'success' : 'warning')}>
                      {isWorking ? t('working', 'Working') : t('not_working', 'Not Working')}
                    </span>
                  )}
                </div>
              </div>

              {/* Machine Actions Strip */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', borderTop: '1px solid var(--line)', paddingTop: '10px' }}>
                {isActive && (
                  <button
                    type="button"
                    className="button secondary tiny"
                    onClick={() => toggleMachineStatus(machine)}
                    disabled={busy}
                    title="Toggle working status"
                  >
                    <Wrench size={13} /> {isWorking ? t('mark_not_working', 'Mark Not Working') : t('mark_working', 'Mark Working')}
                  </button>
                )}
                <button
                  type="button"
                  className={'link-btn tiny ' + (isActive ? 'danger' : 'success')}
                  onClick={() =>
                    setConfirmDialog({
                      type: 'machine',
                      item: machine,
                      action: isActive ? 'deactivate' : 'activate',
                    })
                  }
                  disabled={busy}
                >
                  {isActive ? <PowerOff size={13} /> : <Power size={13} />} {isActive ? t('deactivate', 'Deactivate') : t('reactivate', 'Reactivate')}
                </button>
              </div>

              {/* Connected Nozzles List */}
              <div style={{ marginTop: '4px' }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {t('connected_nozzles', 'Connected Nozzles')} ({machineNozzles.length})
                </div>

                {machineNozzles.length === 0 ? (
                  <div style={{ fontSize: '13px', color: 'var(--muted)', fontStyle: 'italic', padding: '8px 0' }}>
                    {t('no_nozzles_configured', 'No nozzles configured for this dispenser yet.')}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {machineNozzles.map((nz) => {
                      const nzWorking = (nz.status || 'working') === 'working';
                      const nzActive = nz.active !== false;

                      return (
                        <div
                          key={nz.id}
                          className={`nozzle-card-row ${!nzActive ? 'nozzle-inactive' : nzWorking ? 'nozzle-working' : 'nozzle-warning'}`}
                        >
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <strong>{t('nozzle_label', 'Nozzle')} {nz.nozzleNumber}</strong>
                              <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                                ({nz.tankName} - {nz.fuelName})
                              </span>
                            </div>
                            <small style={{ color: 'var(--muted)', fontSize: '11px' }}>
                              {t('meter_label', 'Meter:')} {formatLiters(nz.currentMeter, { fixed: true })}
                            </small>
                          </div>

                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            {!nzActive ? (
                              <span className="status neutral" style={{ fontSize: '10px', padding: '1px 6px' }}>{t('inactive', 'Inactive')}</span>
                            ) : (
                              <span
                                className={'status ' + (nzWorking ? 'success' : 'warning')}
                                style={{ fontSize: '10px', padding: '1px 6px', cursor: 'pointer' }}
                                onClick={() => toggleNozzleStatus(nz)}
                                title={nzWorking ? t('mark_not_working', 'Mark Not Working') : t('mark_working', 'Mark Working')}
                              >
                                {nzWorking ? t('working', 'Working') : t('not_working', 'Not Working')}
                              </span>
                            )}

                            <button
                              type="button"
                              className="link-btn tiny"
                              style={{ color: nzActive ? '#ef4444' : '#16a34a', padding: '2px 4px' }}
                              onClick={() =>
                                setConfirmDialog({
                                  type: 'nozzle',
                                  item: nz,
                                  action: nzActive ? 'deactivate' : 'activate',
                                })
                              }
                              title={nzActive ? t('deactivate', 'Deactivate') : t('reactivate', 'Reactivate')}
                            >
                              {nzActive ? <PowerOff size={13} /> : <Power size={13} />}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal: Add Dispensing Machine */}
      {showAddMachine && (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-labelledby="add-machine-title" style={{ maxWidth: '440px' }}>
            <div className="modal-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Gauge size={18} />
                <h3 id="add-machine-title">{t('add_dispensing_machine', 'Add Dispensing Machine')}</h3>
              </div>
              <button type="button" className="close-btn" onClick={() => setShowAddMachine(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddMachine}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label htmlFor="machine-number">{t('machine_number', 'Machine Number / ID *')}</label>
                  <input
                    id="machine-number"
                    autoFocus
                    placeholder="e.g. M4"
                    value={machineNum}
                    onChange={(e) => setMachineNum(e.target.value)}
                    required
                  />
                  <small style={{ color: 'var(--muted)' }}>{t('machine_id_hint', 'Identification tag on the station forecourt.')}</small>
                </div>

                <div>
                  <label htmlFor="machine-name">{t('dispenser_name', 'Dispenser Name (Optional)')}</label>
                  <input
                    id="machine-name"
                    placeholder="e.g. Dispenser 4 (Diesel)"
                    value={machineName}
                    onChange={(e) => setMachineName(e.target.value)}
                  />
                </div>

                {error && <div className="field-hint text-danger">{error}</div>}
              </div>

              <div className="modal-actions" style={{ marginTop: '16px' }}>
                <button type="button" className="button secondary" onClick={() => setShowAddMachine(false)} disabled={busy}>
                  {t('cancel', 'Cancel')}
                </button>
                <button type="submit" className="button primary" disabled={busy}>
                  {busy ? t('saving', 'Saving...') : t('create_machine', 'Create Machine')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Nozzle */}
      {showAddNozzle && (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-labelledby="add-nozzle-title" style={{ maxWidth: '440px' }}>
            <div className="modal-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Fuel size={18} />
                <h3 id="add-nozzle-title">{t('add_nozzle', 'Add Dispenser Nozzle')}</h3>
              </div>
              <button type="button" className="close-btn" onClick={() => setShowAddNozzle(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddNozzle}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label htmlFor="select-machine">{t('dispensing_machine', 'Dispensing Machine *')}</label>
                  <select
                    id="select-machine"
                    value={selectedMachineForNozzle}
                    onChange={(e) => setSelectedMachineForNozzle(e.target.value)}
                    required
                  >
                    {derivedMachines.map((m) => (
                      <option key={m.machineNumber} value={m.machineNumber}>
                        {m.machineNumber} - {m.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="nozzle-number">{t('nozzle_number', 'Nozzle Number *')}</label>
                  <input
                    id="nozzle-number"
                    placeholder="e.g. 7"
                    value={nozzleNum}
                    onChange={(e) => setNozzleNum(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label htmlFor="select-tank">{t('connected_tank', 'Connected Fuel Tank *')}</label>
                  <select
                    id="select-tank"
                    value={nozzleTankId}
                    onChange={(e) => setNozzleTankId(e.target.value)}
                    required
                  >
                    {safeTanks.map((tank) => (
                      <option key={tank.id} value={tank.id}>
                        {tank.name} ({tank.fuelName})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="initial-meter">{t('initial_meter', 'Initial Meter Reading (Litres)')}</label>
                  <input
                    id="initial-meter"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={initialMeter}
                    onChange={(e) => setInitialMeter(e.target.value)}
                  />
                  <small style={{ color: 'var(--muted)' }}>{t('opening_meter_hint', 'Opening totalizer value recorded on the digital dispenser.')}</small>
                </div>

                {error && <div className="field-hint text-danger">{error}</div>}
              </div>

              <div className="modal-actions" style={{ marginTop: '16px' }}>
                <button type="button" className="button secondary" onClick={() => setShowAddNozzle(false)} disabled={busy}>
                  {t('cancel', 'Cancel')}
                </button>
                <button type="submit" className="button primary" disabled={busy}>
                  {busy ? t('saving', 'Saving...') : t('add_nozzle', 'Add Nozzle')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Dialog for Deactivation / Reactivation */}
      {confirmDialog && (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" style={{ maxWidth: '420px' }}>
            <div className="modal-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={18} className="text-warning" />
                <h3>{confirmDialog.action === 'deactivate' ? t('confirm_deactivation', 'Confirm Deactivation') : t('confirm_reactivation', 'Confirm Reactivation')}</h3>
              </div>
              <button type="button" className="close-btn" onClick={() => setConfirmDialog(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ padding: '16px 0', fontSize: '14px', lineHeight: '1.5' }}>
              <p>
                {confirmDialog.action === 'deactivate' ? (
                  <>
                    {t('confirm_deactivate_prefix', 'Are you sure you want to deactivate')}{' '}
                    <strong>
                      {confirmDialog.type === 'machine'
                        ? `${t('dispenser_label', 'Dispenser')} ${confirmDialog.item.machineNumber}`
                        : `${t('nozzle_label', 'Nozzle')} ${confirmDialog.item.nozzleNumber}`}
                    </strong>
                    {t('confirm_question_mark', '?')}
                    <br /><br />
                    <span style={{ color: 'var(--muted)', fontSize: '13px' }}>
                      <ShieldCheck size={14} style={{ display: 'inline', verticalAlign: 'middle', marginInlineEnd: '4px', color: '#16a34a' }} />
                      <strong>{t('historical_preservation_guarantee', 'Historical preservation guarantee:')}</strong>{' '}
                      {t('historical_preservation_note', 'All previous meter readings, shift reconciliation entries, and transactions associated with this unit will be permanently preserved and remain auditable.')}
                    </span>
                  </>
                ) : (
                  <>
                    {t('reactivate_prefix', 'Reactivate')}{' '}
                    <strong>
                      {confirmDialog.type === 'machine'
                        ? `${t('dispenser_label', 'Dispenser')} ${confirmDialog.item.machineNumber}`
                        : `${t('nozzle_label', 'Nozzle')} ${confirmDialog.item.nozzleNumber}`}
                    </strong>{' '}
                    {t('reactivate_suffix', 'to include it in live station operations and shift closings?')}
                  </>
                )}
              </p>
            </div>

            <div className="modal-actions">
              <button type="button" className="button secondary" onClick={() => setConfirmDialog(null)} disabled={busy}>
                {t('cancel', 'Cancel')}
              </button>
              <button
                type="button"
                className={'button ' + (confirmDialog.action === 'deactivate' ? 'danger' : 'primary')}
                onClick={handleToggleActive}
                disabled={busy}
              >
                {busy ? t('processing', 'Processing...') : confirmDialog.action === 'deactivate' ? t('confirm_deactivation', 'Confirm Deactivation') : t('reactivate', 'Reactivate')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
