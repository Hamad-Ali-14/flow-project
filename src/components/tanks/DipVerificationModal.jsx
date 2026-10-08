import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CircleCheck, RefreshCw, X } from 'lucide-react';
import { ModalShell, Alert, FieldError } from './ModalShell';
import { parseDecimalInput } from '../../utils/inventoryCalculations';
import { formatMm } from '../../utils/formatters';
import { useLanguage } from '../../context/LanguageContext';
import { STATION_NAME } from '../../config/station';

// Dip Verification: the operator photographs the physical dip rod, types the mm reading,
// and confirms. The reading is written to the tank's dip history (the audit log) through
// the same api.recordDip used by "Update dip", tagged as camera-verified.
export default function DipVerificationModal({ tank, api, onClose, onDone }) {
  const { t } = useLanguage();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [cameraError, setCameraError] = useState('');
  const [dipText, setDipText] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState('');

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraOn(false);
  }, []);

  // Always release the camera when the modal closes.
  useEffect(() => stopCamera, [stopCamera]);

  // Attach the stream once the <video> element exists.
  useEffect(() => {
    if (cameraOn && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraOn]);

  const startCamera = async () => {
    setCameraError('');
    setPhoto(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera is not supported here. Use HTTPS (or localhost) in a modern browser.');
      }
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      setCameraOn(true);
    } catch (err) {
      setCameraError(err && err.message ? err.message : 'Unable to access the camera. Please allow camera permission.');
    }
  };

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    setPhoto(canvas.toDataURL('image/jpeg', 0.85));
    stopCamera();
  };

  const parsed = parseDecimalInput(dipText, { maxDecimals: 1 });
  const showError = (touched || dipText !== '') && parsed.error;

  const submit = async event => {
    event.preventDefault();
    setTouched(true);
    setServerError('');
    if (!photo || parsed.error || busy) return;
    setBusy(true);
    try {
      await api.recordDip({
        tankId: tank.id,
        dipMm: parsed.value,
        remarks: `[Dip rod photo verified - camera] ${STATION_NAME}`,
      });
      stopCamera();
      onDone(`Dip verified for ${tank.name}: ${formatMm(parsed.value)} (photo attached to audit log)`);
    } catch (error) {
      setServerError(error.message);
      setBusy(false);
    }
  };

  const close = () => { stopCamera(); onClose(); };

  return (
    <ModalShell icon={Camera} title={t('dip_verification', 'Dip Verification')}
      subtitle={`${STATION_NAME} - ${t('dip_verification_subtitle', 'Photograph the physical dip rod reading for the audit log.')}`}
      onClose={close} busy={busy}>
      <form onSubmit={submit} noValidate>
        <div className="form-grid">
          <div><label>{t('col_tank', 'Tank')}</label><input value={`${tank.name} - ${tank.fuelName}`} readOnly /></div>
          <div><label>{t('current_dip', 'Current dip')}</label><input value={tank.dip ? formatMm(tank.dip.mm) : t('no_reading_yet', 'No reading yet')} readOnly /></div>
        </div>

        <div className="camera-section-box">
          {!cameraOn && !photo && (
            <div className="dv-empty">
              <Camera size={28} />
              <button type="button" className="button primary small" onClick={startCamera} disabled={busy}>
                <Camera size={15} /> {t('dv_start_camera', 'Start camera')}
              </button>
            </div>
          )}
          {cameraError && <div className="field-hint text-warning">{cameraError}</div>}

          {cameraOn && (
            <div className="camera-viewport-card">
              <video ref={videoRef} autoPlay playsInline muted className="camera-live-feed" />
              <div className="camera-feed-controls">
                <button type="button" className="button primary small" onClick={capture}>
                  <Camera size={15} /> {t('capture_photo', 'Capture Photo')}
                </button>
                <button type="button" className="button secondary small" onClick={stopCamera}>
                  <X size={15} /> {t('cancel_camera', 'Cancel Camera')}
                </button>
              </div>
            </div>
          )}

          {photo && (
            <div className="dv-photo">
              <img src={photo} alt="Captured dip rod" />
              <button type="button" className="button secondary small" onClick={startCamera} disabled={busy}>
                <RefreshCw size={14} /> {t('dv_retake', 'Retake')}
              </button>
            </div>
          )}
        </div>

        <label htmlFor="dv-mm">{t('dv_reading_label', 'Dip rod reading (mm) *')}</label>
        <input id="dv-mm" inputMode="decimal" placeholder="e.g. 1,630" value={dipText}
          className={showError ? 'invalid' : ''} onChange={e => setDipText(e.target.value)} disabled={busy} />
        <FieldError>{showError ? parsed.error : ''}</FieldError>
        {touched && !photo && <FieldError>Capture a photo of the dip rod first.</FieldError>}

        <Alert>{serverError}</Alert>
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={close} disabled={busy}>{t('cancel', 'Cancel')}</button>
          <button type="submit" className="button primary" disabled={busy || !photo}>
            <CircleCheck size={17} /> {busy ? t('saving', 'Saving...') : t('dv_confirm_attach', 'Confirm & attach to audit log')}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
