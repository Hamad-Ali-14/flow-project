import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Theme-safe dropdown. A native <select> popup is drawn by the browser and cannot be styled
 * reliably (white boxes in dark mode), so this renders its own button + listbox.
 *
 * options: [{ value, label }]
 * block:   stretch to the full width of its container (form fields)
 */
export default function Dropdown({ value, onChange, options, block = false, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = options.find((o) => o.value === value) || options[0];

  return (
    <div className={block ? 'period-dd block' : 'period-dd'} ref={rootRef}>
      <button
        type="button"
        className="period-dd-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{current ? current.label : ''}</span>
        <ChevronDown size={14} className={open ? 'period-dd-chev open' : 'period-dd-chev'} />
      </button>
      {open && (
        <ul className="period-dd-menu" role="listbox">
          {options.map((o) => (
            <li key={o.value} role="option" aria-selected={o.value === value}>
              <button
                type="button"
                className={o.value === value ? 'period-dd-item active' : 'period-dd-item'}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
