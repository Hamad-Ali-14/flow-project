import React, { useEffect, useState, useRef } from 'react';
import { Camera, CircleCheck, RefreshCw, Ruler, Video, X } from 'lucide-react';
import { ModalShell, Alert, FieldError } from './ModalShell';
import { parseDecimalInput } from '../../utils/inventoryCalculations';
import { formatLiters, formatMm } from '../../utils/formatters';
import { formatKarachiDate } from '../../dateUtils';
import { useNotifications } from '../../hooks/useNotifications';
import { useLanguage } from '../../context/LanguageContext';

const when = iso => formatKarachiDate(new Date(iso), { year: undefined, hour: '2-digit', minute: '2-digit', hour12: false });

export default function DipReadingModal({ tank, api, onClose, onDone }) {
  const { t } = useLanguage();
  const { addNotification } = useNotifications();
  const [dipText, setDipText] = useState('');
  const [remarks, setRemarks] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState('');
  const [history, setHistory] = useState({ loading: true, rows: [], error: '' });

  // Camera integration
  const [cameraActive, setCameraActive] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [cameraError, setCameraError] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    let alive = true;
    api.listDips(tank.id, 5)
      .then(rows => { if (alive) setHistory({ loading: false, rows, error: '' }); })
      .catch(error => { if (alive) setHistory({ loading: false, rows: [], error: error.message }); });
    return () => { alive = false; };
  }, [api, tank.id]);

  // Clean up camera stream on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const startCamera = async () => {
    setCameraError('');
    setCapturedPhoto(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera not supported on this browser/device.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      setCameraActive(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(e => console.warn('Video play error:', e));
        }
      }, 100);
    } catch (err) {
      console.warn('Camera access error:', err);
      setCameraError(err.message || 'Unable to access camera. Please allow camera permissions.');
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setCapturedPhoto(dataUrl);
    stopCamera();
  };

  const parsed = parseDecimalInput(dipText, { maxDecimals: 1 });
  const showError = (touched || dipText !== '') && parsed.error;
  const change = parsed.error || !tank.dip ? null : Math.round((parsed.value - tank.dip.mm) * 10) / 10;

  // Realtime physical stock & variance calculations
  const physicalLitres = (parsed.value != null && tank.calibration) ? Math.round(parsed.value * tank.calibration) : null;
  const varianceLitres = physicalLitres != null ? Math.round(physicalLitres - tank.currentStock) : null;
  const isHighVariance = varianceLitres != null && Math.abs(varianceLitres) > 50;

  const submit = async event => {
    event.preventDefault();
    setTouched(true);
    setServerError('');
    if (parsed.error || busy) return;
    setBusy(true);

    try {
      let finalRemarks = remarks.trim();
      if (capturedPhoto) {
        finalRemarks = finalRemarks ? `${finalRemarks} [Dip gauge photo verified]` : '[Dip gauge photo verified]';
      }

      await api.recordDip({ tankId: tank.id, dipMm: parsed.value, remarks: finalRemarks });

      // Owner Anomaly Alert if variance > 50 Litres
      if (isHighVariance && addNotification) {
        addNotification({
          type: 'warning',
          targetRole: 'owner',
          title: `High Dip Variance: ${tank.name}`,
          message: `Dip reading on ${tank.name} (${tank.fuelName}) shows a physical variance of ${Math.abs(varianceLitres)} L (${varianceLitres > 0 ? '+' : ''}${varianceLitres} L). Book: ${formatLiters(tank.currentStock)}, Physical: ${formatLiters(physicalLitres)}.`,
        });
      }

      onDone(`Dip reading saved for ${tank.name}: ${formatMm(parsed.value)}${isHighVariance ? ` (Variance: ${varianceLitres > 0 ? '+' : ''}${varianceLitres} L)` : ''}`);
    } catch (error) {
      setServerError(error.message);
      setBusy(false);
    }
  };

  return (
    <ModalShell icon={Ruler} title={t('update_dip_reading', 'Update dip reading')} subtitle={t('dip_modal_subtitle', 'Saves a new physical reading. Previous readings are kept in history.')} onClose={onClose} busy={busy}>
      <form onSubmit={submit} noValidate>
        <div className="form-grid">
          <div><label>{t('col_tank', 'Tank')}</label><input value={`${tank.name} - ${tank.fuelName}`} readOnly /></div>
          <div><label>{t('current_dip', 'Current dip')}</label><input value={tank.dip ? formatMm(tank.dip.mm) : t('no_reading_yet', 'No reading yet')} readOnly /></div>
        </div>

        {/* Camera Verification Section */}
        <div className="camera-section-box">
          <div className="camera-section-head">
            <span className="camera-section-title">
              <Camera size={16} /> {t('camera_verification', 'Dip Gauge Photo Verification')}
            </span>
            {!cameraActive && !capturedPhoto && (
              <button type="button" className="button secondary small camera-btn" onClick={startCamera}>
                <Video size={14} /> {t('open_camera', 'Open Live Camera')}
              </button>
            )}
          </div>

          {cameraError && (
            <div className="field-hint text-warning" style={{ marginTop: '6px' }}>
              {cameraError} (You can enter the reading manually below)
            </div>
          )}

          {cameraActive && (
            <div className="camera-viewport-card">
              <video ref={videoRef} autoPlay playsInline muted className="camera-live-feed" />
              <div className="camera-feed-controls">
                <button type="button" className="button primary small" onClick={capturePhoto}>
                  <Camera size={15} /> {t('capture_photo', 'Capture Photo')}
                </button>
                <button type="button" className="button secondary small" onClick={stopCamera}>
                  <X size={15} /> {t('cancel_camera', 'Cancel Camera')}
                </button>
              </div>
            </div>
          )}

          {capturedPhoto && (
            <div className="camera-snapshot-preview">
              <img src={capturedPhoto} alt="Captured dip reading" className="captured-photo-thumb" />
              <div className="captured-photo-meta">
                <span className="photo-badge success">✓ {t('photo_captured', 'Photo Captured')}</span>
                <button type="button" className="button secondary tiny" onClick={startCamera}>
                  <RefreshCw size={13} /> {t('retake', 'Retake')}
                </button>
              </div>
            </div>
          )}
        </div>

        <label htmlFor="dip-new">{t('new_dip_reading', 'New dip reading (mm) *')}</label>
        <input id="dip-new" autoFocus inputMode="decimal" value={dipText} placeholder="e.g. 1,630" className={showError ? 'invalid' : ''}
          onChange={e => setDipText(e.target.value)} disabled={busy} />
        <FieldError>{showError ? parsed.error : ''}</FieldError>

        {change !== null && change !== 0 && (
          <div className="field-hint">
            {change > 0 ? '+' : ''}{change} mm {t('compared_with_previous', 'compared with previous reading.')}
          </div>
        )}

        {/* Live Physical Stock & Variance Indicator */}
        {physicalLitres != null && (
          <div className={'dip-variance-box ' + (isHighVariance ? 'variance-alert' : 'variance-normal')}>
            <div className="dip-variance-row">
              <span>{t('physical_fuel_stock', 'Physical Fuel Stock')} ({tank.calibration ? `1 mm = ${tank.calibration} L` : ''}):</span>
              <strong>{formatLiters(physicalLitres)}</strong>
            </div>
            <div className="dip-variance-row">
              <span>{t('book_stock', 'Book Stock (Calculated)')}:</span>
              <span>{formatLiters(tank.currentStock)}</span>
            </div>
            <div className="dip-variance-row total">
              <span>{t('stock_variance', 'Stock Variance:')}</span>
              <strong className={isHighVariance ? 'text-danger' : 'text-success'}>
                {varianceLitres > 0 ? '+' : ''}{formatLiters(varianceLitres)}
              </strong>
            </div>
          </div>
        )}

        {isHighVariance && (
          <Alert tone="warning">
            ⚠️ <strong>{t('high_variance_alert_title', 'High variance alert')} ({Math.abs(varianceLitres)} L):</strong> {t('high_variance_alert_desc', 'Discrepancy exceeds the 50 L threshold. An operational anomaly alert will be automatically dispatched to the station owner upon saving.')}
          </Alert>
        )}

        <label htmlFor="dip-remarks">{t('col_remarks', 'Remarks')}</label>
        <textarea id="dip-remarks" rows={2} value={remarks} maxLength={500} placeholder="Optional physical notes or gauge conditions" onChange={e => setRemarks(e.target.value)} disabled={busy} />

        <div className="inv-mini-list">
          <strong>{t('recent_readings', 'Recent readings')}</strong>
          {history.loading && <div className="skeleton line" />}
          {history.error && <div className="field-hint">{history.error}</div>}
          {!history.loading && !history.error && !history.rows.length && <div className="field-hint">{t('no_dip_readings_yet', 'No dip readings recorded yet.')}</div>}
          {history.rows.map(row => (
            <div key={row.id}><span>{when(row.recordedAt)}{row.userName ? ` - ${row.userName}` : ''}</span><b>{formatMm(row.dipMm)}</b></div>
          ))}
        </div>

        <Alert>{serverError}</Alert>
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose} disabled={busy}>{t('cancel', 'Cancel')}</button>
          <button type="submit" className="button primary" disabled={busy}><CircleCheck size={17} /> {busy ? t('saving', 'Saving...') : t('save_dip_reading', 'Save dip reading')}</button>
        </div>
      </form>
    </ModalShell>
  );
}
