import React, { useMemo, useState, useEffect, useRef } from 'react';
import { ArrowLeft, Camera, CircleAlert, CircleCheck, ReceiptText, RefreshCw, Video, X } from 'lucide-react';
import { ModalShell, Alert, FieldError, SummaryRow } from './ModalShell';
import { getKarachiShift } from '../../dateUtils';
import { projectShiftClosing } from '../../utils/inventoryCalculations';
import { formatLiters, formatPKR, formatPrice } from '../../utils/formatters';
import { useNotifications } from '../../hooks/useNotifications';
import { useLanguage } from '../../context/LanguageContext';

// Station-wide: a shift covers every active nozzle, grouped here by tank. Opening a
// closing from a tank card simply lists that tank first.
export default function ShiftClosingModal({ tanks, openShift, focusTankId, api, onClose, onDone, onRefresh, perms = {} }) {
  const { t } = useLanguage();
  const { addNotification } = useNotifications();
  const [inputs, setInputs] = useState({});
  const [step, setStep] = useState('entry'); // 'entry' | 'review'
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState('');
  const [opening, setOpening] = useState(false);

  // Camera integration for nozzle meter capture
  const [activeCameraNozzle, setActiveCameraNozzle] = useState(null); // nozzleId
  const [nozzlePhotos, setNozzlePhotos] = useState({}); // { [nozzleId]: dataUrl }
  const [cameraError, setCameraError] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  // Auto-open a shift if none exists (first run). After that, close_shift always opens the next one.
  useEffect(() => {
    if (!openShift && !opening && !serverError) {
      setOpening(true);
      api.openShift()
        .then(() => { onRefresh(); onClose(); })
        .catch(e => { setServerError(e.message); setOpening(false); });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup camera stream
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setActiveCameraNozzle(null);
  };

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const startCamera = async (nozzleId) => {
    setCameraError('');
    setActiveCameraNozzle(nozzleId);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera not supported on this device/browser.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(e => console.warn('Video play error:', e));
        }
      }, 100);
    } catch (err) {
      console.warn('Camera error:', err);
      setCameraError(err.message || 'Unable to access camera. Please allow permissions.');
      setActiveCameraNozzle(null);
    }
  };

  const capturePhoto = (nozzleId) => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setNozzlePhotos(prev => ({ ...prev, [nozzleId]: dataUrl }));
    stopCamera();
  };

  const ordered = useMemo(
    () => [...tanks].filter(t => t.active).sort((a, b) => (b.id === focusTankId) - (a.id === focusTankId)),
    [tanks, focusTankId],
  );
  const shiftName = getKarachiShift().name;
  const projection = useMemo(() => projectShiftClosing(ordered, inputs), [ordered, inputs]);

  if (!openShift) {
    return (
      <ModalShell icon={ReceiptText} title={t('shifts_title') || "Shift closing"} subtitle={opening ? (t('opening_shift') || "Opening next shift...") : (t('shifts_page_desc') || "Shift management")} onClose={onClose}>
        <Alert tone="info">{serverError || (opening ? (t('opening_shift') || 'Opening next shift, please wait...') : 'No open shift. Click below to open one.')}</Alert>
        {!opening && !serverError && (
          <div className="modal-actions">
            <button className="button secondary" onClick={onClose}>{t('cancel') || 'Cancel'}</button>
            <button className="button primary" onClick={async () => {
              setOpening(true);
              try { await api.openShift(); onRefresh(); onClose(); }
              catch (e) { setServerError(e.message); setOpening(false); }
            }}><CircleCheck size={17} /> {t('open_shift') || 'Open new shift'}</button>
          </div>
        )}
        {serverError && <div className="modal-actions"><button className="button secondary" onClick={onClose}>{t('close') || 'Close'}</button></div>}
      </ModalShell>
    );
  }

  const setReading = (id, value) => {
    setInputs(prev => ({ ...prev, [id]: value }));
    setServerError('');
  };

  const priceMissing = projection.missingPriceFuel;

  const review = () => {
    setTouched(true);
    setServerError('');

    // Check for meter regression (closing < opening)
    const regressions = [];
    projection.tanks.forEach(t => {
      t.nozzles.forEach(n => {
        const val = inputs[n.id];
        if (val !== undefined && val !== '' && !isNaN(Number(val))) {
          if (Number(val) < n.currentMeter) {
            regressions.push({ nozzle: n.nozzleNumber, opening: n.currentMeter, closing: Number(val) });
          }
        }
      });
    });

    if (regressions.length > 0) {
      if (addNotification) {
        regressions.forEach(r => {
          addNotification({
            type: 'danger',
            targetRole: 'owner',
            title: `Meter Regression Anomaly: Nozzle ${r.nozzle}`,
            message: `During shift closing, entered closing meter (${r.closing}) is lower than opening (${r.opening}) on Nozzle ${r.nozzle}. Submission was rejected.`,
          });
        });
      }
      setServerError(`Meter reading anomaly: Closing meter cannot be lower than opening meter. Discrepancy logged for station owner.`);
      return;
    }

    if (projection.valid && !priceMissing) setStep('review');
  };

  const confirm = async () => {
    if (busy || !projection.valid || priceMissing) return;
    setBusy(true);
    setServerError('');
    try {
      const readings = projection.tanks.flatMap(t => t.nozzles.map(n => ({
        nozzleId: n.id, closingMeter: n.closing, expectedOpeningMeter: n.currentMeter,
      })));
      const result = await api.closeShift({ shiftId: openShift.id, readings });
      const revenue = result.totalRevenue != null && perms.view_sales ? ` Sales revenue ${formatPKR(result.totalRevenue)}.` : '';
      onDone(`${shiftName} closed - ${formatLiters(result.totalDispensed)} dispensed.${revenue} The next shift is now open.`);
    } catch (error) {
      setServerError(error.message);
      setBusy(false);
      setStep('entry');
      onRefresh(); // pick up whatever changed (another user closed the shift, new stock, ...)
    }
  };

  const title = `${t('shifts_title') || 'Shift closing'} - ${shiftName}`;

  if (step === 'review') {
    return (
      <ModalShell icon={ReceiptText} wide title={t('confirm_shift_closing') || "Confirm shift closing"} subtitle={`${shiftName} - ${t('review_shift_closing') || 'please check the figures before confirming.'}`} onClose={onClose} busy={busy}>
        <div className="review-grid">
          {projection.tanks.map(tData => (
            <section className="review-tank" key={tData.id}>
              <header><strong>{tData.name}</strong><span>{tData.fuelName}</span></header>
              {tData.nozzles.map(n => <SummaryRow key={n.id} label={`${t('nozzle_label') || 'Nozzle'} ${n.nozzleNumber}`} value={n.amount != null ? `${formatLiters(n.dispensed, { fixed: true })} = ${formatPKR(n.amount)}` : formatLiters(n.dispensed, { fixed: true })} />)}
              <SummaryRow label={t('tank_dispensed') || "Tank total dispensed"} value={formatLiters(tData.dispensed, { fixed: true })} tone="strong" />
              {tData.revenue != null && <SummaryRow label={`${t('todays_revenue') || 'Revenue'} @ ${formatPrice(tData.unitPrice)} / L`} value={formatPKR(tData.revenue)} tone="strong" />}
              <SummaryRow label={`${tData.name} ${t('current_stock') || 'current stock'}`} value={formatLiters(tData.currentStock, { fixed: true })} />
              <SummaryRow label={t('stock_after_shift') || "After shift"} value={formatLiters(tData.projectedStock, { fixed: true })} tone="strong" />
            </section>
          ))}
        </div>
        <div className="inv-summary total"><SummaryRow label={t('total_dispensed') || "Total dispensed (all tanks)"} value={formatLiters(projection.totalDispensed, { fixed: true })} />{projection.totalRevenue != null && <SummaryRow label={t('total_sales_revenue') || "Total sales revenue"} value={formatPKR(projection.totalRevenue)} />}</div>
        <Alert tone="info">
          Confirming closes {shiftName} permanently, deducts the fuel from each tank and records every nozzle sale. Closed shifts cannot be edited. Each sale keeps the unit price used here, even if prices change later. The next shift opens automatically.
        </Alert>
        <Alert>{serverError}</Alert>
        <div className="modal-actions">
          <button className="button secondary" onClick={() => setStep('entry')} disabled={busy}><ArrowLeft size={16} /> {t('back') || 'Back'}</button>
          <button className="button secondary" onClick={onClose} disabled={busy}>{t('cancel') || 'Cancel'}</button>
          <button className="button primary" onClick={confirm} disabled={busy}><CircleCheck size={17} /> {busy ? (t('closing_shift') || 'Closing shift...') : (t('confirm_shift_closing') || 'Confirm Shift Closing')}</button>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell icon={ReceiptText} wide title={title} subtitle={t('shift_modal_desc') || "Enter the closing meter for every active and working nozzle. Inactive or non-working nozzles are excluded."} onClose={onClose} busy={busy}>
      {cameraError && (
        <Alert tone="warning">{cameraError} (You can enter closing meters manually below)</Alert>
      )}

      {/* Live camera feed modal popup / inline if active */}
      {activeCameraNozzle && (
        <div className="camera-viewport-card" style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <strong>{t('camera_verification_active') || 'Camera verification active'}</strong>
            <button type="button" className="link-btn tiny" onClick={stopCamera}><X size={15} /> {t('close_camera') || 'Close camera'}</button>
          </div>
          <video ref={videoRef} autoPlay playsInline muted className="camera-live-feed" />
          <div className="camera-feed-controls">
            <button type="button" className="button primary small" onClick={() => capturePhoto(activeCameraNozzle)}>
              <Camera size={15} /> {t('capture_meter_reading') || 'Capture Meter Reading'}
            </button>
            <button type="button" className="button secondary small" onClick={stopCamera}>
              <X size={15} /> {t('cancel') || 'Cancel'}
            </button>
          </div>
        </div>
      )}

      {projection.tanks.map(tData => {
        // Find any not_working nozzles for this tank to display non-blocking status
        const fullTank = tanks.find(x => x.id === tData.id);
        const inactiveOrNotWorking = (fullTank?.nozzles || []).filter(n => !n.active || n.status === 'not_working');

        return (
          <section className={'shift-tank' + (tData.id === focusTankId ? ' focus' : '')} key={tData.id}>
            <header>
              <div><strong>{tData.name}</strong><span>{tData.fuelName}{tData.unitPrice != null ? ` - ${tData.unitPrice > 0 ? `${formatPrice(tData.unitPrice)} / L` : (t('no_price_set') || 'price not set')}` : ''}</span></div>
              <div className="shift-tank-stock"><span>{t('current_stock') || 'Current stock'}</span><b>{formatLiters(tData.currentStock)}</b></div>
            </header>
            <div className="nozzle-grid head" aria-hidden="true">
              <span>{t('nozzle_label') || 'Nozzle'}</span>
              <span>{t('opening_meter') || 'Opening meter'}</span>
              <span>{t('closing_meter') || 'Closing meter'}</span>
              <span>{t('dispensed') || 'Dispensed'}</span>
            </div>
            {tData.nozzles.map(n => {
              const showError = n.error && (n.entered || touched);
              const hasPhoto = Boolean(nozzlePhotos[n.id]);

              return (
                <div className="nozzle-grid row" key={n.id}>
                  <div data-label={t('nozzle_label') || 'Nozzle'}>
                    <strong>{t('nozzle_label') || 'Nozzle'} {n.nozzleNumber}</strong>
                    <div style={{ display: 'flex', gap: '4px', marginTop: '3px' }}>
                      <span className="badge-working" style={{ fontSize: '10px', padding: '1px 6px', background: 'rgba(34, 197, 94, 0.15)', color: '#16a34a', borderRadius: '4px' }}>
                        {t('working') || 'Working'}
                      </span>
                    </div>
                  </div>
                  <div data-label={t('opening_meter') || 'Opening meter'}>{formatLiters(n.currentMeter, { fixed: true })}</div>
                  <div data-label={t('closing_meter') || 'Closing meter'}>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <input
                        inputMode="decimal" value={inputs[n.id] ?? ''} placeholder="e.g. 125,850.00" disabled={busy}
                        className={showError ? 'invalid' : ''} aria-label={`${t('closing_meter') || 'Closing meter'} ${n.nozzleNumber}`} aria-invalid={Boolean(showError)}
                        onChange={e => setReading(n.id, e.target.value)}
                      />
                      <button
                        type="button"
                        className="button secondary tiny"
                        title="Capture meter photo with camera"
                        onClick={() => startCamera(n.id)}
                        disabled={busy}
                        style={{ padding: '6px 8px' }}
                      >
                        <Camera size={14} />
                      </button>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                      <button type="button" className="link-btn tiny" onClick={() => setReading(n.id, String(n.currentMeter))} disabled={busy}>{t('same_as_opening') || 'Same as opening'}</button>
                      {hasPhoto && (
                        <span className="text-success tiny" style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                          ✓ {t('photo_attached') || 'Photo attached'}
                        </span>
                      )}
                    </div>
                    <FieldError>{showError ? n.error : ''}</FieldError>
                  </div>
                  <div data-label={t('dispensed') || 'Dispensed'}>
                    <strong>{n.valid ? formatLiters(n.dispensed, { fixed: true }) : '-'}</strong>
                    {n.valid && n.amount != null && <small className="cell-note">{formatPKR(n.amount)}</small>}
                  </div>
                </div>
              );
            })}

            {/* Non-working / Inactive nozzles notice */}
            {inactiveOrNotWorking.length > 0 && (
              <div style={{ padding: '8px 14px', background: 'var(--surface-raised, #f8fafc)', borderTop: '1px dashed var(--border, #e2e8f0)', fontSize: '12px', color: 'var(--muted, #64748b)' }}>
                <span style={{ fontWeight: '500' }}>{t('excluded_nozzles_label') || 'Excluded non-working / inactive nozzles:'} </span>
                {inactiveOrNotWorking.map(nz => `${t('nozzle_label') || 'Nozzle'} ${nz.nozzleNumber} (${nz.status === 'not_working' ? (t('not_working') || 'Not Working') : (t('inactive') || 'Inactive')})`).join(', ')}
              </div>
            )}

            <footer className={tData.insufficient ? 'bad' : ''}>
              {tData.insufficient
                ? <span role="alert">Insufficient tank stock. Shift closing cannot be completed.</span>
                : <span>{t('tank_dispensed') || 'Tank dispensed'} <b>{formatLiters(tData.dispensed, { fixed: true })}</b>{tData.revenue != null && <> - {t('todays_revenue') || 'revenue'} <b>{formatPKR(tData.revenue)}</b></>}</span>}
              <span>{t('stock_after_shift') || 'Stock after shift'} <b>{formatLiters(tData.projectedStock, { fixed: true })}</b></span>
            </footer>
          </section>
        );
      })}

      <div className="inv-summary total"><SummaryRow label={t('total_dispensed') || "Total dispensed"} value={formatLiters(projection.totalDispensed, { fixed: true })} />{projection.totalRevenue != null && <SummaryRow label={t('total_sales_revenue') || "Total sales revenue"} value={formatPKR(projection.totalRevenue)} />}</div>
      <Alert>{touched && priceMissing ? `No price is set for ${priceMissing}. Set the fuel price (Tanks & nozzles > Fuel prices) before closing the shift.` : ''}</Alert>
      <Alert>{serverError}</Alert>
      <div className="modal-actions">
        <button className="button secondary" onClick={onClose} disabled={busy}>{t('cancel') || 'Cancel'}</button>
        <button className="button primary" onClick={review} disabled={touched && (!projection.valid || Boolean(priceMissing))}>{t('review_shift_closing') || 'Review shift closing'}</button>
      </div>
    </ModalShell>
  );
}
