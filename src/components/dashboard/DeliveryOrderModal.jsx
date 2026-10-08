import React, { useState } from 'react';
import {
  Truck,
  CheckCircle,
  AlertCircle,
  X,
  FileText,
  ShieldCheck,
  Building,
} from 'lucide-react';
import { SUPPLIER_INFO } from '../../utils/flowAiTools';
import { formatPKR, formatLiters } from '../../utils/formatters';

export default function DeliveryOrderModal({
  tank,
  onClose,
  onConfirmOrder,
  api,
  notify = () => {},
}) {
  const [selectedSupplier, setSelectedSupplier] = useState(SUPPLIER_INFO[0].name);
  const [quantity, setQuantity] = useState(tank?.recommendedQty || 15000);
  const [reference, setReference] = useState(`PO-${Date.now().toString().slice(-6)}`);
  const [notes, setNotes] = useState('Bulk delivery requested due to low tank forecast.');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const capacity = Number(tank?.capacity) || 45000;
  const currentStock = Number(tank?.currentStock) || 0;
  const projectedStock = currentStock + Number(quantity);
  const isOverflow = projectedStock > capacity;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isOverflow || isSubmitting) return;

    setIsSubmitting(true);
    try {
      if (onConfirmOrder) {
        await onConfirmOrder({
          tankId: tank?.tankId || tank?.id,
          tankName: tank?.tankName || tank?.name,
          fuelCode: tank?.fuelCode,
          fuelName: tank?.fuelName,
          quantity: Number(quantity),
          supplier: selectedSupplier,
          reference,
          notes,
        });
      }
      notify(`Delivery order ${reference} confirmed with ${selectedSupplier}!`);
      onClose();
    } catch (err) {
      console.error('Failed to submit delivery order:', err);
      notify('Failed to save delivery order. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-layer" onMouseDown={onClose}>
      <div
        className="modal delivery-order-modal"
        onMouseDown={(e) => e.stopPropagation()}
        style={{ maxWidth: 540 }}
      >
        <div className="modal-top">
          <div className="modal-mark">
            <Truck size={20} />
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={19} />
          </button>
        </div>

        <h2>Prepare Delivery Order</h2>
        <p>Review and verify tank replenishment parameters before confirming order dispatch.</p>

        <form onSubmit={handleSubmit}>
          <div className="order-spec-grid">
            <div className="spec-card">
              <span>Target Fuel</span>
              <strong>{tank?.fuelName || 'Diesel / HSD'}</strong>
              <small>{tank?.tankName || 'Tank 1'}</small>
            </div>
            <div className="spec-card">
              <span>Current Volume</span>
              <strong>{formatLiters(currentStock)}</strong>
              <small>{tank?.percentage || 28}% remaining</small>
            </div>
            <div className="spec-card">
              <span>Capacity Available</span>
              <strong>{formatLiters(capacity - currentStock)}</strong>
              <small>Max tank limit: {formatLiters(capacity)}</small>
            </div>
          </div>

          <label htmlFor="order-supplier">Authorized OMC Supplier *</label>
          <select
            id="order-supplier"
            value={selectedSupplier}
            onChange={(e) => setSelectedSupplier(e.target.value)}
          >
            {SUPPLIER_INFO.map((s) => (
              <option key={s.id} value={s.name}>
                {s.name} ({s.terminal})
              </option>
            ))}
          </select>

          <label htmlFor="order-quantity">Delivery Volume (Litres) *</label>
          <input
            id="order-quantity"
            type="number"
            step="500"
            min="1000"
            max={capacity}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            required
          />

          {isOverflow ? (
            <p className="order-warning-error" role="alert">
              ⚠️ Warning: Requested {formatLiters(quantity)} exceeds available space ({formatLiters(capacity - currentStock)}). Please adjust volume.
            </p>
          ) : (
            <div className="order-projected-box">
              <ShieldCheck size={16} />
              <span>
                Projected stock after receipt: <strong>{formatLiters(projectedStock)}</strong> ({Math.round((projectedStock / capacity) * 100)}% tank fill)
              </span>
            </div>
          )}

          <label htmlFor="order-ref">Purchase Order / Delivery Reference</label>
          <input
            id="order-ref"
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />

          <label htmlFor="order-notes">Special Delivery Instructions / Gate Pass</label>
          <textarea
            id="order-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          <div className="order-safety-notice">
            <AlertCircle size={15} />
            <small>
              Flow AI never places unconfirmed external orders. Your confirmation creates an audited replenishment request and authorizes station tanker offloading.
            </small>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="button secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="button primary"
              disabled={isOverflow || !quantity || isSubmitting}
            >
              <CheckCircle size={16} />
              {isSubmitting ? 'Confirming Order...' : 'Confirm Delivery Order'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
