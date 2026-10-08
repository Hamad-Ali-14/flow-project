import React, { useEffect, useId } from 'react';
import { AlertTriangle, X } from 'lucide-react';

// Reuses the app's existing .modal-layer / .modal / .modal-top / .modal-mark markup so the
// dialogs look identical to the rest of FLOW OPS. Unlike the demo modals, clicking the
// backdrop does NOT close these: losing half-entered meter readings by accident is costly.
export function ModalShell({ icon: Icon, title, subtitle, onClose, busy = false, wide = false, children }) {
  const titleId = useId();

  useEffect(() => {
    const onKey = event => { if (event.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  return (
    <div className="modal-layer">
      <div className={'modal inv-modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="modal-top">
          <div className="modal-mark"><Icon size={19} /></div>
          <button type="button" aria-label="Close" onClick={onClose} disabled={busy}><X size={19} /></button>
        </div>
        <h2 id={titleId}>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

export function Alert({ children, tone = 'error' }) {
  if (!children) return null;
  return (
    <div className={'inv-alert ' + tone} role={tone === 'error' ? 'alert' : 'status'}>
      <AlertTriangle size={16} />
      <span>{children}</span>
    </div>
  );
}

export function FieldError({ children }) {
  return children ? <div className="field-error" role="alert">{children}</div> : null;
}

export function SummaryRow({ label, value, tone }) {
  return <div className={'inv-summary-row' + (tone ? ` ${tone}` : '')}><span>{label}</span><strong>{value}</strong></div>;
}
